/**
 * Edge Function: agente-impressao — a API que o AGENTE LOCAL consome.
 *
 * O agente não tem login interativo; autentica com um TOKEN longo
 * (Authorization: Bearer sl_agent_...). A função roda com service_role
 * (segredo só do servidor) MAS sempre escopa tudo ao tenant que o token
 * resolve — menor privilégio: o agente só enxerga/atualiza trabalhos das
 * impressoras dele, nada de clientes/financeiro/etc.
 *
 * Ações (POST { action, ... }):
 *  - ping   → marca o agente online, devolve as impressoras vinculadas
 *  - claim  → pega o próximo trabalho 'fila' das impressoras do agente,
 *             marca 'enviado' e devolve uma URL ASSINADA do G-code
 *  - status → atualiza o trabalho (imprimindo/concluido/falha/progresso);
 *             ao concluir, avança a OP vinculada para 'acabamento'
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { crypto } from 'jsr:@std/crypto';
import { encodeHex } from 'jsr:@std/encoding/hex';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return encodeHex(new Uint8Array(buf));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // service_role só no servidor — bypassa RLS, então o escopo por tenant é
  // responsabilidade DESTA função (sempre filtrar por tenant do token).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token.startsWith('sl_agent_')) {
      return json({ error: 'token do agente ausente' }, 401);
    }

    const { data: agente } = await admin
      .from('agente_impressao')
      .select('id, tenant_id, nome')
      .eq('token_hash', await sha256Hex(token))
      .is('deleted_at', null)
      .maybeSingle();
    if (!agente) return json({ error: 'agente não reconhecido' }, 401);

    // todo contato conta como sinal de vida
    await admin.from('agente_impressao')
      .update({ status: 'online', ultimo_contato: new Date().toISOString() })
      .eq('id', agente.id);

    const corpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const acao = corpo.action ?? 'ping';

    if (acao === 'ping') {
      const { data: impressoras } = await admin
        .from('impressora')
        .select('id, nome, tecnologia, status_conexao')
        .eq('agente_id', agente.id)
        .is('deleted_at', null);
      return json({ agente: agente.nome, impressoras: impressoras ?? [] });
    }

    if (acao === 'claim') {
      const { data: trab } = await admin
        .from('trabalho_impressao')
        .select('id, numero, gcode_id, impressora_id, modelo_id')
        .eq('tenant_id', agente.tenant_id)
        .eq('agente_id', agente.id)
        .eq('status', 'fila')
        .is('deleted_at', null)
        .order('enfileirado_em', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!trab) return json({ trabalho: null });

      // reivindica o trabalho (fila → enviado)
      await admin.from('trabalho_impressao')
        .update({ status: 'enviado', updated_at: new Date().toISOString() })
        .eq('id', trab.id);

      // URL assinada do G-code (bucket privado; validamos que é do tenant)
      let gcodeUrl: string | null = null;
      let gcodeNome: string | null = null;
      if (trab.gcode_id) {
        const { data: gcode } = await admin
          .from('arquivo_gcode')
          .select('path, nome')
          .eq('id', trab.gcode_id)
          .eq('tenant_id', agente.tenant_id)
          .maybeSingle();
        if (gcode) {
          gcodeNome = gcode.nome;
          const { data: assinada } = await admin.storage
            .from('arquivos-modelos')
            .createSignedUrl(gcode.path, 3600);
          gcodeUrl = assinada?.signedUrl ?? null;
        }
      }
      return json({
        trabalho: { id: trab.id, numero: trab.numero, impressora_id: trab.impressora_id },
        gcode: gcodeUrl ? { url: gcodeUrl, nome: gcodeNome } : null,
      });
    }

    if (acao === 'status') {
      const { job_id, status, progresso, mensagem } = corpo as {
        job_id?: string; status?: string; progresso?: number; mensagem?: string;
      };
      const permitidos = ['imprimindo', 'pausado', 'concluido', 'falha'];
      if (!job_id || !status || !permitidos.includes(status)) {
        return json({ error: 'job_id e status válidos são obrigatórios' }, 400);
      }

      const { data: trab } = await admin
        .from('trabalho_impressao')
        .select('id, ordem_producao_id, impressora_id, iniciado_em')
        .eq('id', job_id)
        .eq('tenant_id', agente.tenant_id)
        .eq('agente_id', agente.id)
        .maybeSingle();
      if (!trab) return json({ error: 'trabalho não encontrado' }, 404);

      const patch: Record<string, unknown> = {
        status,
        progresso_pct: typeof progresso === 'number' ? Math.max(0, Math.min(100, progresso)) : undefined,
        mensagem: mensagem ?? null,
        updated_at: new Date().toISOString(),
      };
      if (status === 'imprimindo' && !trab.iniciado_em) patch.iniciado_em = new Date().toISOString();
      if (status === 'concluido') { patch.concluido_em = new Date().toISOString(); patch.progresso_pct = 100; }
      await admin.from('trabalho_impressao').update(patch).eq('id', trab.id);

      // reflete na saúde da impressora
      if (trab.impressora_id) {
        await admin.from('impressora').update({
          status_conexao: status === 'imprimindo' ? 'imprimindo'
            : status === 'falha' ? 'erro' : 'pronta',
        }).eq('id', trab.impressora_id);
      }

      // automação: impressão concluída → OP vinculada vai para 'acabamento'
      if (status === 'concluido' && trab.ordem_producao_id) {
        await admin.from('ordem_producao')
          .update({ status: 'acabamento', updated_at: new Date().toISOString() })
          .eq('id', trab.ordem_producao_id)
          .eq('tenant_id', agente.tenant_id)
          .eq('status', 'imprimindo');
      }
      return json({ ok: true });
    }

    return json({ error: 'ação desconhecida' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
