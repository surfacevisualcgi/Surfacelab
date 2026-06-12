/**
 * Tela 13 — Fiscal e Financeiro (estrutura v2): abas Visão geral / Fiscal /
 * Empresa / Obrigações. SIMULAÇÃO fiscal — não emite NF (aviso permanente).
 * Relatório contábil mensal = CSV real dos lançamentos (restrito à flag
 * exportar; registra o compartilhamento com o contador — LGPD).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { moeda, percentual } from '@/lib/formato';
import {
  Abas, Botao, CabecalhoPagina, Campo, Carregando, Cartao, Dinheiro, Entrada,
  EstadoVazio, Kpi, Selecao,
} from '@/components/ui';
import { GraficoBarrasDuplas } from '@/components/graficos';
import { useAuth } from '@/auth/AuthProvider';
import { AbaFiscal } from '../configuracoes/PaginaConfiguracoes';

type Aba = 'geral' | 'fiscal' | 'empresa' | 'obrigacoes';

function ultimos6Meses(): { chave: string; rotulo: string }[] {
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const agora = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() - (5 - i), 1);
    return { chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, rotulo: nomes[d.getMonth()] };
  });
}

export function PaginaFiscal() {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const [aba, setAba] = useState<Aba>('geral');
  if (!pode('fiscal')) return <EstadoVazio />;

  return (
    <div>
      <CabecalhoPagina titulo={t('fiscal.titulo')} subtitulo={t('config.avisoFiscal')} />
      <Abas<Aba>
        abas={[
          { id: 'geral', rotulo: t('fiscal.abaGeral') },
          { id: 'fiscal', rotulo: t('fiscal.abaFiscal') },
          { id: 'empresa', rotulo: t('fiscal.abaEmpresa') },
          { id: 'obrigacoes', rotulo: t('fiscal.abaObrigacoes') },
        ]}
        ativa={aba}
        onTrocar={setAba}
      />
      {aba === 'geral' && <AbaVisaoGeral />}
      {aba === 'fiscal' && <AbaFiscal />}
      {aba === 'empresa' && <AbaEmpresa />}
      {aba === 'obrigacoes' && <AbaObrigacoes />}
    </div>
  );
}

// ------------------------------------------------------------- Visão geral
function AbaVisaoGeral() {
  const { t } = useTranslation();
  const { formato } = useAuth();
  const lancamentos = useLista<{ tipo: string; valor: number; status: string; vencimento: string }>('lancamento');
  const pedidos = useLista<{ total: number; status: string; created_at: string }>('v_pedido', {
    selecao: 'total, status, created_at',
  });
  const fiscais = useLista<{ aliquota_efetiva: number; padrao: boolean }>('perfil_fiscal');
  const custosFixos = useLista<{ valor_mensal: number; ativo: boolean }>('custo_fixo');

  const r = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7);
    const lancs = (lancamentos.data ?? []).filter((l) => l.status !== 'cancelado');
    const pendentes = lancs.filter((l) => l.status === 'pendente');
    const fatMes = (pedidos.data ?? [])
      .filter((p) => p.status !== 'cancelado' && p.created_at.slice(0, 7) === mes)
      .reduce((s, p) => s + Number(p.total), 0);
    const aliquota = Number(
      ((fiscais.data ?? []).find((f) => f.padrao) ?? (fiscais.data ?? [])[0])?.aliquota_efetiva ?? 0,
    );
    const fixosMensais = (custosFixos.data ?? []).filter((c) => c.ativo)
      .reduce((s, c) => s + Number(c.valor_mensal), 0);
    const entradasMes = lancs.filter((l) => l.tipo === 'entrada' && l.vencimento.slice(0, 7) === mes)
      .reduce((s, l) => s + Number(l.valor), 0);
    const saidasMes = lancs.filter((l) => l.tipo === 'saida' && l.vencimento.slice(0, 7) === mes)
      .reduce((s, l) => s + Number(l.valor), 0);
    const margemMes = entradasMes > 0 ? (entradasMes - saidasMes) / entradasMes : null;
    return {
      impostosEstimados: Math.round(fatMes * aliquota),
      aliquota,
      fatMes,
      aReceber: pendentes.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0),
      aPagar: pendentes.filter((l) => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0),
      fixosMensais,
      // ponto de equilíbrio: custos fixos ÷ margem (sobre a receita do mês)
      pontoEquilibrio: margemMes && margemMes > 0 ? Math.round(fixosMensais / margemMes) : null,
      margemMes,
      fluxo6: ultimos6Meses().map((m) => ({
        rotulo: m.rotulo,
        entrada: lancs.filter((l) => l.tipo === 'entrada' && l.vencimento.slice(0, 7) === m.chave)
          .reduce((s, l) => s + Number(l.valor), 0),
        saida: lancs.filter((l) => l.tipo === 'saida' && l.vencimento.slice(0, 7) === m.chave)
          .reduce((s, l) => s + Number(l.valor), 0),
      })),
    };
  }, [lancamentos.data, pedidos.data, fiscais.data, custosFixos.data]);

  if (lancamentos.isLoading || pedidos.isLoading) return <Carregando />;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={t('fiscal.kpiImpostos')} destaque>
          {moeda(r.impostosEstimados, formato)}
        </Kpi>
        <Kpi rotulo={t('dashboard.faturamento')}>{moeda(r.fatMes, formato)}</Kpi>
        <Kpi rotulo={t('financeiro.aReceber')}>
          <span className="text-ok">{moeda(r.aReceber, formato)}</span>
        </Kpi>
        <Kpi rotulo={t('financeiro.aPagar')}>
          <span className="text-erro">{moeda(r.aPagar, formato)}</span>
        </Kpi>
      </div>
      <p className="-mt-2 mb-4 text-[11px] text-texto-2">
        {t('fiscal.impostosDica', { aliquota: percentual(r.aliquota, formato) })}
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Cartao>
          <h2 className="mb-1 text-sm font-bold text-ink">{t('dashboard.fluxoCaixa')}</h2>
          <div className="mb-1 flex gap-3 text-[10px] font-semibold text-texto-2">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ok" /> {t('financeiro.tipoLabel.entrada')}s</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-erro/70" /> {t('financeiro.tipoLabel.saida')}s</span>
          </div>
          <GraficoBarrasDuplas meses={r.fluxo6} />
        </Cartao>

        {/* ponto de equilíbrio (painel direito, v2) */}
        <Cartao className="h-fit">
          <h2 className="mb-2 text-sm font-bold text-ink">{t('fiscal.pontoEquilibrio')}</h2>
          <p className="text-2xl font-extrabold grad-texto tabular-nums">
            {r.pontoEquilibrio != null ? moeda(r.pontoEquilibrio, formato) : '—'}
          </p>
          <p className="mt-1 text-xs text-texto-2">{t('fiscal.pontoEquilibrioDica')}</p>
          <dl className="mt-3 space-y-1.5 border-t border-borda pt-3 text-xs">
            <div className="flex justify-between">
              <dt className="text-texto-2">{t('cadastros.custosFixos')}</dt>
              <dd className="font-semibold"><Dinheiro centavos={r.fixosMensais} />/mês</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-texto-2">{t('fiscal.margemDoMes')}</dt>
              <dd className="font-semibold">{r.margemMes != null ? percentual(r.margemMes, formato) : '—'}</dd>
            </div>
          </dl>
        </Cartao>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Empresa
function AbaEmpresa() {
  const { t } = useTranslation();
  const { ativa } = useAuth();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const empresa = useQuery({
    queryKey: ['empresa', ativa?.tenant_id],
    enabled: !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresa').select('*').is('deleted_at', null).limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string; razao_social: string | null; nome_fantasia: string | null; cnpj: string | null; regime_tributario: string | null } | null;
    },
  });

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const valores = {
      razao_social: (f.get('razao_social') as string) || null,
      nome_fantasia: (f.get('nome_fantasia') as string) || null,
      cnpj: (f.get('cnpj') as string) || null,
      regime_tributario: (f.get('regime_tributario') as string) || null,
    };
    const { error } = empresa.data
      ? await supabase.from('empresa').update(valores).eq('id', empresa.data.id)
      : await supabase.from('empresa').insert({ tenant_id: ativa?.tenant_id, ...valores });
    if (error) setErro(mensagemErro(error));
    else {
      setErro(null);
      setMsg(t('estados.salvo'));
      qc.invalidateQueries({ queryKey: ['empresa'] });
      setTimeout(() => setMsg(null), 2500);
    }
  }

  if (empresa.isLoading) return <Carregando />;
  return (
    <Cartao className="max-w-xl">
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Razão social">
          <Entrada name="razao_social" defaultValue={empresa.data?.razao_social ?? ''} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome fantasia">
            <Entrada name="nome_fantasia" defaultValue={empresa.data?.nome_fantasia ?? ''} />
          </Campo>
          <Campo rotulo="CNPJ">
            <Entrada name="cnpj" defaultValue={empresa.data?.cnpj ?? ''} placeholder="00.000.000/0001-00" />
          </Campo>
        </div>
        <Campo rotulo={t('config.regimeTributario')} dica={t('fiscal.regimeDica')}>
          <Selecao name="regime_tributario" defaultValue={empresa.data?.regime_tributario ?? ''}>
            <option value="">—</option>
            <option value="MEI">MEI</option>
            <option value="Simples Nacional">Simples Nacional</option>
            <option value="Lucro Presumido">Lucro Presumido</option>
            <option value="Lucro Real">Lucro Real</option>
          </Selecao>
        </Campo>
        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        {msg && <p className="text-xs font-semibold text-ok">{msg}</p>}
        <Botao type="submit">{t('acoes.salvar')}</Botao>
      </form>
    </Cartao>
  );
}

// -------------------------------------------------------------- Obrigações
function AbaObrigacoes() {
  const { t } = useTranslation();
  const { ativa, flag, formato } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function relatorioContabil() {
    setErro(null);
    const mes = new Date().toISOString().slice(0, 7);
    const { data, error } = await supabase
      .from('lancamento')
      .select('tipo, descricao, categoria, vencimento, pago_em, valor, status')
      .is('deleted_at', null)
      .gte('vencimento', `${mes}-01`)
      .order('vencimento');
    if (error) {
      setErro(mensagemErro(error));
      return;
    }
    const linhas = [
      'tipo;descricao;categoria;vencimento;pago_em;valor;status',
      ...(data ?? []).map((l) =>
        [l.tipo, `"${l.descricao.replace(/"/g, "'")}"`, l.categoria, l.vencimento,
         l.pago_em ?? '', (Number(l.valor) / 100).toFixed(2).replace('.', ','), l.status].join(';'),
      ),
    ];
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-contabil-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    // LGPD: exportação ao contador é compartilhamento com terceiro — registrar
    await supabase.from('registro_compartilhamento').insert({
      tenant_id: ativa?.tenant_id,
      destinatario: 'contador',
      finalidade: 'relatório contábil mensal',
      dados: `lançamentos financeiros de ${mes}`,
      base_legal: 'obrigacao_legal',
    });
    setMsg(t('fiscal.relatorioGerado'));
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div className="max-w-xl space-y-3">
      <div className="rounded-xl border border-alerta/40 bg-alerta/5 p-4 text-sm text-texto">
        <p className="font-bold text-alerta">⚠ {t('fiscal.avisoTitulo')}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-texto-2">
          <li>{t('fiscal.aviso1')}</li>
          <li>{t('fiscal.aviso2')}</li>
          <li>{t('fiscal.aviso3')}</li>
        </ul>
      </div>
      <Cartao>
        <h2 className="mb-1 text-sm font-bold text-ink">{t('fiscal.relatorioContabil')}</h2>
        <p className="mb-3 text-xs text-texto-2">{t('fiscal.relatorioDica')}</p>
        {flag('exportar') ? (
          <Botao onClick={relatorioContabil}>⤓ {t('fiscal.gerarRelatorio')} ({new Date().toLocaleDateString(formato.locale, { month: 'long' })})</Botao>
        ) : (
          <p className="text-xs text-texto-2">🔒 {t('fiscal.semPermissaoExportar')}</p>
        )}
        {msg && <p className="mt-2 text-xs font-semibold text-ok">{msg}</p>}
        {erro && <p className="mt-2 text-xs font-semibold text-erro">{erro}</p>}
      </Cartao>
    </div>
  );
}
