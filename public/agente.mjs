#!/usr/bin/env node
/**
 * Surface Labs — Agente de impressão local (referência).
 *
 * Roda na MESMA REDE da(s) impressora(s) — um PC, um Raspberry Pi, etc.
 * Faz polling da fila no Surface Labs, baixa o G-code por URL assinada e
 * manda imprimir. Suporta dois modos de envio à impressora:
 *
 *   1) OCTOPRINT  — POST do G-code + comando de impressão (recomendado;
 *      funciona com a maioria das FDM via OctoPrint/Klipper-Moonraker shim).
 *   2) SIMULACAO  — não há impressora: simula o progresso (para testar o
 *      pipeline de ponta a ponta). É o modo padrão.
 *
 * NÃO precisa de Node externo além do runtime: usa só APIs nativas (fetch).
 * Node 18+.
 *
 * Configuração por variáveis de ambiente (ou edite os defaults abaixo):
 *   SL_URL    = URL do Surface Labs (ex.: https://<ref>.supabase.co)
 *   SL_TOKEN  = token do agente (gerado em Configurações → Agente de impressão)
 *   SL_MODO   = "simulacao" (default) | "octoprint"
 *   OCTOPRINT_URL / OCTOPRINT_KEY  = quando SL_MODO=octoprint
 *   SL_INTERVALO_MS = intervalo de polling (default 4000)
 */

const URL_BASE = process.env.SL_URL ?? 'http://127.0.0.1:54321';
const TOKEN = process.env.SL_TOKEN ?? '';
const MODO = process.env.SL_MODO ?? 'simulacao';
const INTERVALO = Number(process.env.SL_INTERVALO_MS ?? 4000);
const ENDPOINT = `${URL_BASE.replace(/\/$/, '')}/functions/v1/agente-impressao`;

if (!TOKEN.startsWith('sl_agent_')) {
  console.error('✗ Defina SL_TOKEN (gere em Configurações → Agente de impressão).');
  process.exit(1);
}

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

async function api(body) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${body.action} → HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

const reportar = (job_id, status, progresso, mensagem) =>
  api({ action: 'status', job_id, status, progresso, mensagem });

/** Imprime via OctoPrint: sobe o arquivo na pasta local e manda imprimir. */
async function imprimirOctoprint(job, gcodeTexto) {
  const base = process.env.OCTOPRINT_URL?.replace(/\/$/, '');
  const key = process.env.OCTOPRINT_KEY;
  if (!base || !key) throw new Error('OCTOPRINT_URL/OCTOPRINT_KEY não configurados');

  const form = new FormData();
  form.append('file', new Blob([gcodeTexto], { type: 'text/plain' }), `${job.numero}.gcode`);
  form.append('print', 'true'); // sobe e já inicia
  const up = await fetch(`${base}/api/files/local`, {
    method: 'POST', headers: { 'X-Api-Key': key }, body: form,
  });
  if (!up.ok) throw new Error(`OctoPrint upload HTTP ${up.status}`);
  await reportar(job.id, 'imprimindo', 0, 'Enviado ao OctoPrint');

  // acompanha o progresso pelo /api/job
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetch(`${base}/api/job`, { headers: { 'X-Api-Key': key } }).then((x) => x.json());
    const pct = st?.progress?.completion ?? 0;
    const estado = st?.state ?? '';
    if (/Operational|Finishing|Printing/i.test(estado) && pct < 100) {
      await reportar(job.id, 'imprimindo', pct, estado);
    }
    if (pct >= 100 || /Operational/i.test(estado) && (st?.progress?.printTime ?? 0) > 0) {
      await reportar(job.id, 'concluido', 100, 'Impressão concluída');
      return;
    }
    if (/Error|Closed|Offline/i.test(estado)) {
      await reportar(job.id, 'falha', pct, `OctoPrint: ${estado}`);
      return;
    }
  }
}

/** Simula a impressão (sem hardware) — para testar o pipeline. */
async function imprimirSimulado(job, gcodeTexto) {
  const linhas = (gcodeTexto.match(/\n/g) || []).length;
  log(`  ↳ simulando ${job.numero} (${linhas} linhas de G-code)`);
  for (const pct of [10, 35, 60, 85, 100]) {
    await new Promise((r) => setTimeout(r, 1200));
    await reportar(job.id, pct < 100 ? 'imprimindo' : 'concluido', pct,
      pct < 100 ? `Camada ${pct}%` : 'Impressão concluída (simulação)');
    log(`  ↳ ${job.numero}: ${pct}%`);
  }
}

async function ciclo() {
  const { trabalho, gcode } = await api({ action: 'claim' });
  if (!trabalho) return false;
  log(`▶ trabalho ${trabalho.numero} reivindicado`);
  try {
    // a URL assinada pode vir com o host interno do servidor (ex.: kong em
    // ambiente local/atrás de proxy); o token assinado independe do host, então
    // refazemos a origem contra SL_URL para garantir alcance a partir daqui.
    let gcodeUrl = gcode?.url ?? '';
    if (gcodeUrl) {
      try {
        const u = new URL(gcodeUrl);
        const base = new URL(URL_BASE);
        u.protocol = base.protocol; u.host = base.host;
        gcodeUrl = u.toString();
      } catch { /* mantém a original */ }
    }
    const gcodeTexto = gcodeUrl ? await fetch(gcodeUrl).then((r) => r.text()) : '';
    if (MODO === 'octoprint') await imprimirOctoprint(trabalho, gcodeTexto);
    else await imprimirSimulado(trabalho, gcodeTexto);
    log(`✓ trabalho ${trabalho.numero} concluído`);
  } catch (e) {
    log(`✗ falha em ${trabalho.numero}: ${e.message}`);
    await reportar(trabalho.id, 'falha', 0, e.message).catch(() => {});
  }
  return true;
}

async function main() {
  const info = await api({ action: 'ping' });
  log(`Surface Labs — agente "${info.agente}" online (modo ${MODO}).`);
  log(`Impressoras vinculadas: ${info.impressoras.map((i) => i.nome).join(', ') || '(nenhuma — vincule no site)'}`);
  for (;;) {
    try {
      const teveTrabalho = await ciclo();
      if (!teveTrabalho) await api({ action: 'ping' }); // mantém vivo
    } catch (e) {
      log(`! erro: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, INTERVALO));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
