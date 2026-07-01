import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { dataCurta, moeda, percentual, paraCentavos } from '@/lib/formato';
import {
  Botao, Campo, Carregando, Dinheiro, Entrada,
  EntradaDinheiro, EstadoErro, EstadoVazio, Etiqueta, Modal, Selecao,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

const PERIODOS = [1, 7, 15, 30, 60, 90, 180, 360] as const;

type TipoLancamento = 'entrada' | 'saida';
type StatusLancamento = 'pago' | 'pendente' | 'atrasado' | 'cancelado';

interface Lancamento {
  id: string;
  tipo: TipoLancamento;
  descricao: string;
  categoria: string;
  vencimento: string;
  pago_em: string | null;
  valor: number;
  valor_pago: number;
  conta: string | null;
  status: StatusLancamento;
  origem_tipo: string | null;
  origem_id: string | null;
}

interface SerieMes {
  chave: string;
  rotulo: string;
  entrada: number;
  saida: number;
  saldo: number;
}

const CATEGORIAS = [
  'vendas', 'insumos', 'frete', 'energia', 'aluguel', 'software',
  'contador', 'marketing', 'manutencao', 'servicos', 'materiais', 'comunicacao', 'outros',
] as const;

function inicioPeriodo(dias: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dias - 1));
  return d;
}

function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dataLocal(iso: string) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const d = new Date(ano, (mes ?? 1) - 1, dia ?? 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDias(d: Date, dias: number) {
  const copia = new Date(d);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

function diffDias(inicio: Date, fim: Date) {
  return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 864e5));
}

function rotuloData(d: Date, locale: string, modo: 'dia' | 'semana' | 'mes') {
  if (modo === 'mes') {
    const txt = new Intl.DateTimeFormat(locale, { month: 'short' }).format(d).replace('.', '');
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(d);
}

function gerarSerieFluxo(lancamentos: Lancamento[], inicio: Date, fim: Date, locale: string): SerieMes[] {
  const dias = diffDias(inicio, fim);
  const modo: 'dia' | 'semana' | 'mes' = dias <= 31 ? 'dia' : dias <= 120 ? 'semana' : 'mes';
  const buckets: { chave: string; rotulo: string; inicio: Date; fim: Date; entrada: number; saida: number; saldo: number }[] = [];

  if (modo === 'mes') {
    let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const limite = new Date(fim.getFullYear(), fim.getMonth(), 1);
    while (cursor <= limite) {
      const ini = cursor < inicio ? inicio : new Date(cursor);
      const prox = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const fimBucket = addDias(prox, -1) > fim ? fim : addDias(prox, -1);
      buckets.push({ chave: `${cursor.getFullYear()}-${cursor.getMonth()}`, rotulo: rotuloData(cursor, locale, 'mes'), inicio: ini, fim: fimBucket, entrada: 0, saida: 0, saldo: 0 });
      cursor = prox;
    }
  } else {
    const passo = modo === 'dia' ? 1 : 7;
    let cursor = new Date(inicio);
    while (cursor <= fim) {
      const fimBucket = addDias(cursor, passo - 1) > fim ? fim : addDias(cursor, passo - 1);
      buckets.push({ chave: isoLocal(cursor), rotulo: rotuloData(cursor, locale, modo), inicio: new Date(cursor), fim: fimBucket, entrada: 0, saida: 0, saldo: 0 });
      cursor = addDias(cursor, passo);
    }
  }

  for (const l of lancamentos) {
    const data = dataLocal(l.vencimento);
    const bucket = buckets.find((b) => data >= b.inicio && data <= b.fim);
    if (!bucket) continue;
    if (l.tipo === 'entrada') bucket.entrada += Number(l.valor);
    else bucket.saida += Number(l.valor);
  }
  return buckets.map((b) => ({ chave: b.chave, rotulo: b.rotulo, entrada: b.entrada, saida: b.saida, saldo: b.entrada - b.saida }));
}

function statusEfetivo(l: Lancamento, hoje: string): StatusLancamento {
  if (l.status === 'cancelado' || l.status === 'pago') return l.status;
  if (l.vencimento < hoje) return 'atrasado';
  return l.status;
}

function restante(l: Lancamento) {
  return Math.max(0, Number(l.valor) - Number(l.valor_pago ?? 0));
}

function corCategoria(i: number) {
  return ['#4b6ce0', '#8a3fd1', '#e5179a', '#29c2f2', '#16a34a', '#d97706'][i % 6];
}

function MiniIcone({
  tipo,
}: {
  tipo: 'wallet' | 'arrowUp' | 'arrowDown' | 'clock' | 'trend' | 'percent' | 'calendar' | 'check' | 'alert' | 'eye' | 'edit' | 'more' | 'filter';
}) {
  const paths: Record<typeof tipo, string> = {
    wallet: 'M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Zm0 2v10h16V9H4Zm13 3h3v4h-3a2 2 0 0 1 0-4ZM4 5h14v2H4V5Z',
    arrowUp: 'M7 17 17 7h-7V5h10v10h-2V8.4L8.4 18 7 17Z',
    arrowDown: 'M17 7 7 17h7v2H4V9h2v6.6L15.6 6 17 7Z',
    clock: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5v5.4l4 2.4-1 1.7-5-3V7h2Z',
    trend: 'M3 17h18v2H3v-2Zm1-3 5-5 4 4 6-7 1.5 1.3-7.4 8.7-4.1-4.1-3.6 3.6L4 14Z',
    percent: 'M7 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10-4a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 20 18 4l1.6 1.2-12 16L6 20Z',
    calendar: 'M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm13 8H6v10h14V10ZM6 8h14V6H6v2Z',
    check: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-1.1 14.2-4-4 1.4-1.4 2.6 2.6 5.8-5.8 1.4 1.4-7.2 7.2Z',
    alert: 'M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V8h2v5Z',
    eye: 'M12 5c5 0 8.5 4.5 9.5 7-1 2.5-4.5 7-9.5 7S3.5 14.5 2.5 12C3.5 9.5 7 5 12 5Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    edit: 'M4 17.5V21h3.5L18.1 10.4l-3.5-3.5L4 17.5ZM20.7 7.8a1 1 0 0 0 0-1.4l-3.1-3.1a1 1 0 0 0-1.4 0l-1.6 1.6 4.5 4.5 1.6-1.6Z',
    more: 'M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
    filter: 'M3 5h18l-7 8v5l-4 2v-7L3 5Z',
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={paths[tipo]} />
    </svg>
  );
}

function KpiFinanceiro({
  icone,
  rotulo,
  valor,
  detalhe,
  cor = 'azul',
}: {
  icone: Parameters<typeof MiniIcone>[0]['tipo'];
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  cor?: 'azul' | 'verde' | 'vermelho' | 'laranja' | 'roxo';
}) {
  const cores = {
    azul: 'bg-brand-azul/10 text-brand-azul',
    verde: 'bg-ok/10 text-ok',
    vermelho: 'bg-erro/10 text-erro',
    laranja: 'bg-alerta/10 text-alerta',
    roxo: 'bg-brand-roxo/10 text-brand-roxo',
  };
  return (
    <div className="min-w-0 rounded-xl border border-borda bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cores[cor]}`}>
          <MiniIcone tipo={icone} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-texto-2">{rotulo}</p>
          <div className="mt-0.5 text-2xl font-extrabold leading-none tabular-nums text-ink">{valor}</div>
          {detalhe && <p className="mt-1 truncate text-[11px] font-semibold text-texto-2">{detalhe}</p>}
        </div>
      </div>
    </div>
  );
}

function FluxoCaixaGrafico({ serie, formato }: { serie: SerieMes[]; formato: ReturnType<typeof useAuth>['formato'] }) {
  const max = Math.max(1, ...serie.flatMap((m) => [m.entrada, m.saida, Math.abs(m.saldo)]));
  const w = 1420;
  const h = 250;
  const pad = { l: 64, r: 24, t: 18, b: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const step = innerW / Math.max(1, serie.length - 1);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const xAt = (i: number) => serie.length === 1 ? pad.l + innerW / 2 : pad.l + i * step;
  const pontosSaldo = serie.map((m, i) => `${xAt(i)},${y(Math.max(0, m.saldo))}`).join(' ');
  const areaSaldo = `${xAt(0)},${pad.t + innerH} ${pontosSaldo} ${xAt(Math.max(0, serie.length - 1))},${pad.t + innerH}`;
  const linhas = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(max * p));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full min-h-[260px] w-full overflow-visible">
      <defs>
        <linearGradient id="finance-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#4b6ce0" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#4b6ce0" stopOpacity="0" />
        </linearGradient>
      </defs>
      {linhas.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="#eceef3" strokeWidth="1" />
          <text x={pad.l - 10} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#6b6b70">{moeda(v, formato)}</text>
        </g>
      ))}
      <polygon points={areaSaldo} fill="url(#finance-area)" />
      <polyline points={pontosSaldo} fill="none" stroke="#4b6ce0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {serie.map((m, i) => {
        const x = xAt(i);
        const base = pad.t + innerH;
        const barW = Math.max(8, Math.min(18, step / 4.5));
        const entradaH = (m.entrada / max) * innerH;
        const saidaH = (m.saida / max) * innerH;
        return (
          <g key={m.chave}>
            <rect x={x - 19} y={base - entradaH} width={barW} height={entradaH} rx="4" fill="#16a34a" opacity="0.86" />
            <rect x={x + 4} y={base - saidaH} width={barW} height={saidaH} rx="4" fill="#ef4444" opacity="0.82" />
            <circle cx={x} cy={y(Math.max(0, m.saldo))} r="4" fill="#4b6ce0" stroke="white" strokeWidth="2" />
            <text x={x} y={h - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill="#6b6b70">{m.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}

function StatusResumo({ pago, pendente, atrasado }: { pago: number; pendente: number; atrasado: number }) {
  const total = Math.max(1, pago + pendente + atrasado);
  const c = 44;
  const r = 32;
  const circ = 2 * Math.PI * r;
  const partes = [
    { v: pago, cor: '#16a34a' },
    { v: pendente, cor: '#f59e0b' },
    { v: atrasado, cor: '#ef4444' },
  ];
  let offset = 0;
  return (
    <svg viewBox="0 0 88 88" className="size-24 shrink-0">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f0f1f4" strokeWidth="12" />
      {partes.map((p) => {
        const dash = (p.v / total) * circ;
        const el = <circle key={p.cor} cx={c} cy={c} r={r} fill="none" stroke={p.cor} strokeWidth="12" strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`} />;
        offset += dash;
        return el;
      })}
      <text x={c} y={c - 2} textAnchor="middle" fontSize="10" fontWeight="800" fill="#6b6b70">Total</text>
      <text x={c} y={c + 13} textAnchor="middle" fontSize="18" fontWeight="800" fill="#0d0d0d">{pago + pendente + atrasado}</text>
    </svg>
  );
}

export function PaginaFinanceiro() {
  const { t } = useTranslation();
  const { pode, flag, formato } = useAuth();
  const lista = useLista<Lancamento>('lancamento', { ordem: 'vencimento', desc: true });
  const crud = useCrud('lancamento');
  const qc = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [baixa, setBaixa] = useState<Lancamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>(7);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const hoje = new Date().toISOString().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const intervaloManual = !!dataInicio || !!dataFim;
  const inicioFiltro = dataInicio ? dataLocal(dataInicio) : inicioPeriodo(periodo);
  const fimFiltro = dataFim ? dataLocal(dataFim) : dataLocal(hoje);
  const inicioFinal = inicioFiltro <= fimFiltro ? inicioFiltro : fimFiltro;
  const fimFinal = fimFiltro >= inicioFiltro ? fimFiltro : inicioFiltro;

  const dados = useMemo(() => {
    const validos = (lista.data ?? []).filter((l) => l.status !== 'cancelado');
    const doPeriodo = validos.filter((l) => {
      const venc = dataLocal(l.vencimento);
      return venc >= inicioFinal && venc <= fimFinal;
    });
    const pendentes = validos.filter((l) => statusEfetivo(l, hoje) !== 'pago');
    const pendentesPeriodo = doPeriodo.filter((l) => statusEfetivo(l, hoje) !== 'pago');
    const entradasPeriodo = doPeriodo.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0);
    const saidasPeriodo = doPeriodo.filter((l) => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0);
    const lucroPeriodo = entradasPeriodo - saidasPeriodo;
    const margem = entradasPeriodo > 0 ? lucroPeriodo / entradasPeriodo : 0;
    return {
      validos,
      doPeriodo,
      saldo: validos.reduce((s, l) => s + (l.tipo === 'entrada' ? 1 : -1) * Number(l.valor_pago ?? 0), 0),
      aReceber: pendentesPeriodo.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + restante(l), 0),
      aPagar: pendentesPeriodo.filter((l) => l.tipo === 'saida').reduce((s, l) => s + restante(l), 0),
      atrasados: pendentesPeriodo.filter((l) => statusEfetivo(l, hoje) === 'atrasado'),
      lucroPeriodo,
      margem,
      fluxo: gerarSerieFluxo(doPeriodo, inicioFinal, fimFinal, formato.locale),
      proximosPagar: pendentes.filter((l) => l.tipo === 'saida' && l.vencimento <= em30).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 3),
      proximosReceber: pendentes.filter((l) => l.tipo === 'entrada' && l.vencimento <= em30).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 3),
    };
  }, [lista.data, inicioFinal, fimFinal, hoje, em30, formato.locale]);

  const categorias = useMemo(
    () => [...new Set([...(lista.data ?? []).map((l) => l.categoria), ...CATEGORIAS, ...(flag('ver_prolabore') ? ['prolabore'] : [])])].filter(Boolean).sort(),
    [lista.data, flag],
  );

  const filtrados = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    return dados.doPeriodo.filter((l) => {
      const status = statusEfetivo(l, hoje);
      const texto = `${l.descricao} ${l.categoria} ${l.conta ?? ''} ${l.origem_tipo ?? ''}`.toLowerCase();
      return (!filtroTipo || l.tipo === filtroTipo)
        && (!filtroStatus || status === filtroStatus)
        && (!filtroCategoria || l.categoria === filtroCategoria)
        && (!alvo || texto.includes(alvo));
    });
  }, [dados.doPeriodo, filtroTipo, filtroStatus, filtroCategoria, busca, hoje]);

  const categoriasResumo = useMemo(() => {
    const mapa = new Map<string, { categoria: string; valor: number }>();
    for (const l of dados.doPeriodo) {
      const atual = mapa.get(l.categoria) ?? { categoria: l.categoria, valor: 0 };
      atual.valor += Number(l.valor);
      mapa.set(l.categoria, atual);
    }
    return [...mapa.values()].sort((a, b) => b.valor - a.valor).slice(0, 4);
  }, [dados.doPeriodo]);
  const maiorCategoria = Math.max(1, ...categoriasResumo.map((c) => c.valor));

  const statusResumo = useMemo(() => {
    const base = filtrados.filter((l) => l.status !== 'cancelado');
    return {
      pago: base.filter((l) => statusEfetivo(l, hoje) === 'pago').length,
      pendente: base.filter((l) => statusEfetivo(l, hoje) === 'pendente').length,
      atrasado: base.filter((l) => statusEfetivo(l, hoje) === 'atrasado').length,
    };
  }, [filtrados, hoje]);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await crud.criar.mutateAsync({
        tipo: f.get('tipo') as string,
        descricao: f.get('descricao') as string,
        categoria: f.get('categoria') as string,
        vencimento: f.get('vencimento') as string,
        valor: paraCentavos(f.get('valor') as string),
        conta: (f.get('conta') as string) || null,
        origem_tipo: 'manual',
      });
      setNovo(false);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function registrarBaixa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!baixa) return;
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.rpc('registrar_pagamento', {
      p_lancamento: baixa.id,
      p_valor: paraCentavos(f.get('valor') as string),
      p_conta: (f.get('conta') as string) || null,
    });
    if (error) { setErro(mensagemErro(error)); return; }
    setBaixa(null); setErro(null);
    qc.invalidateQueries({ queryKey: ['lancamento'] });
  }

  function exportarCsv() {
    const linhas = [
      ['descricao', 'categoria', 'conta', 'vencimento', 'valor', 'status', 'origem'],
      ...filtrados.map((l) => [
        l.descricao,
        l.categoria,
        l.conta ?? '',
        l.vencimento,
        String(l.tipo === 'entrada' ? Number(l.valor) : -Number(l.valor)),
        statusEfetivo(l, hoje),
        l.origem_tipo ?? '',
      ]),
    ];
    const csv = linhas.map((linha) => linha.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro-${hoje}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div className="mx-auto flex w-full flex-col lg:min-h-[calc(100dvh-112px)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-ink 2xl:text-2xl">{t('financeiro.titulo')}</h1>
          <p className="mt-1 text-sm text-texto-2">{t('financeiro.subtitulo')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Botao variante="secundario" onClick={exportarCsv}>↓ {t('acoes.exportar')}</Botao>
          {pode('financeiro', 'criar') && <Botao onClick={() => setNovo(true)}>+ {t('financeiro.novoLancamento')}</Botao>}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-borda bg-white p-1 min-[1600px]:grid-cols-8">
          {PERIODOS.map((dias) => (
            <button
              key={dias}
              onClick={() => { setPeriodo(dias); setDataInicio(''); setDataFim(''); }}
              className={`rounded-lg px-3 py-2 text-xs font-extrabold transition-colors ${
                periodo === dias && !intervaloManual ? 'grad-acento text-white shadow-sm' : 'text-texto-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {dias === 1 ? '1D' : `${dias}D`}
            </button>
          ))}
        </div>
        <div className="flex overflow-x-auto rounded-xl border border-borda bg-white p-1">
          {[
            ['', t('financeiro.todos')],
            ['entrada', t('financeiro.tipoLabel.entrada')],
            ['saida', t('financeiro.tipoLabel.saida')],
          ].map(([valor, rotulo]) => (
            <button key={valor || 'todos'} onClick={() => setFiltroTipo(valor)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${filtroTipo === valor ? 'border border-brand-azul bg-brand-azul/5 text-brand-azul' : 'border border-transparent text-texto-2 hover:bg-surface-2 hover:text-ink'}`}>
              {rotulo}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-borda bg-white p-1">
          <span className="px-2 text-xs font-extrabold text-texto-2">{t('financeiro.periodoPersonalizado')}</span>
          <Entrada type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="!w-36 !py-1.5 !text-xs" aria-label={t('financeiro.dataInicio')} />
          <span className="text-xs font-bold text-texto-2">→</span>
          <Entrada type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="!w-36 !py-1.5 !text-xs" aria-label={t('financeiro.dataFim')} />
          {intervaloManual && (
            <button type="button" onClick={() => { setDataInicio(''); setDataFim(''); }} className="rounded-lg px-2 py-1.5 text-xs font-bold text-texto-2 hover:bg-surface-2 hover:text-ink">
              {t('financeiro.limparPeriodo')}
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 min-[1800px]:grid-cols-6">
        <KpiFinanceiro icone="wallet" rotulo={t('financeiro.saldoRealizado')} cor="azul" valor={<span className={dados.saldo < 0 ? 'text-erro' : 'grad-texto'}>{moeda(dados.saldo, formato)}</span>} detalhe={t('financeiro.disponivelAgora')} />
        <KpiFinanceiro icone="arrowUp" rotulo={t('financeiro.aReceber')} cor="verde" valor={<span className="text-ok">{moeda(dados.aReceber, formato)}</span>} detalhe={t('financeiro.qtdRecebimentos', { count: dados.proximosReceber.length })} />
        <KpiFinanceiro icone="arrowDown" rotulo={t('financeiro.aPagar')} cor="vermelho" valor={<span className="text-erro">{moeda(dados.aPagar, formato)}</span>} detalhe={t('financeiro.qtdPagamentos', { count: dados.proximosPagar.length })} />
        <KpiFinanceiro icone="clock" rotulo={t('financeiro.atrasados')} cor="vermelho" valor={dados.atrasados.length} detalhe={moeda(dados.atrasados.reduce((s, l) => s + restante(l), 0), formato)} />
        <KpiFinanceiro icone="trend" rotulo={t('financeiro.lucroPeriodo')} cor="verde" valor={<span className={dados.lucroPeriodo < 0 ? 'text-erro' : 'text-ok'}>{moeda(dados.lucroPeriodo, formato)}</span>} detalhe={t('financeiro.entradasMenosSaidas')} />
        <KpiFinanceiro icone="percent" rotulo={t('financeiro.margem')} cor="roxo" valor={<span className="grad-texto">{percentual(dados.margem, formato)}</span>} detalhe={t('financeiro.sobreEntradas')} />
      </div>

      {erro && <p className="mb-3 rounded-lg border border-erro/30 bg-erro/5 px-3 py-2 text-xs font-semibold text-erro">{erro}</p>}

      <div className="mb-4 grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-borda bg-white p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-ink">{t('financeiro.fluxoCaixa')}</h2>
              <div className="mt-1 flex gap-3 text-[10px] font-bold text-texto-2">
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ok" /> {t('financeiro.entradas')}</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-erro/70" /> {t('financeiro.saidas')}</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-brand-azul" /> {t('financeiro.saldo')}</span>
              </div>
            </div>
            <span className="rounded-lg border border-borda bg-white px-3 py-1.5 text-xs font-bold text-texto-2">
              {dataCurta(isoLocal(inicioFinal), formato)} - {dataCurta(isoLocal(fimFinal), formato)}
            </span>
          </div>
          <div className="h-[270px]">
            <FluxoCaixaGrafico serie={dados.fluxo} formato={formato} />
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <ListaProximos
            titulo={t('financeiro.proximosPagamentos')}
            vazio={t('financeiro.semProximos')}
            itens={dados.proximosPagar}
            formato={formato}
            hoje={hoje}
            tipo="saida"
          />
          <ListaProximos
            titulo={t('financeiro.recebimentosProximos')}
            vazio={t('financeiro.semRecebimentosProximos')}
            itens={dados.proximosReceber}
            formato={formato}
            hoje={hoje}
            tipo="entrada"
          />
        </div>
      </div>

      <section className="flex min-h-[330px] flex-1 flex-col overflow-hidden rounded-xl border border-borda bg-white shadow-sm lg:min-h-0">
        <div className="border-b border-borda px-4 py-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-ink">{t('financeiro.listaTitulo')}</h2>
              <p className="mt-0.5 text-xs text-texto-2">{t('financeiro.listaAjuda')}</p>
            </div>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-texto-2">
              {t('financeiro.qtdLancamentos', { count: filtrados.length })}
            </span>
          </div>
          <div className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_170px_160px_180px]">
            <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('financeiro.buscarLancamento')} />
            <Selecao value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">{t('financeiro.todosTipos')}</option>
              <option value="entrada">{t('financeiro.tipoLabel.entrada')}</option>
              <option value="saida">{t('financeiro.tipoLabel.saida')}</option>
            </Selecao>
            <Selecao value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">{t('orcamento.todosStatus')}</option>
              {['pendente', 'pago', 'atrasado', 'cancelado'].map((s) => (
                <option key={s} value={s}>{t(`financeiro.statusLabel.${s}`)}</option>
              ))}
            </Selecao>
            <Selecao value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="">{t('financeiro.todasCategorias')}</option>
              {categorias.map((c) => <option key={c} value={c}>{t(`financeiro.categoriaLabel.${c}`, { defaultValue: c })}</option>)}
            </Selecao>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <EstadoVazio />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="border-b border-borda bg-surface-2/70 text-left">
                  {[t('financeiro.descricao'), t('financeiro.categoria'), t('financeiro.conta'), t('financeiro.vencimento'), t('financeiro.valor'), t('orcamento.status'), t('financeiro.origem'), t('financeiro.acoes')].map((cab, idx) => (
                    <th key={cab} className={`px-4 py-3 text-[11px] font-extrabold uppercase tracking-wide text-texto-2 ${idx === 4 ? 'text-right' : idx >= 7 ? 'text-center' : ''}`}>{cab}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda/70">
                {filtrados.map((l) => {
                  const status = statusEfetivo(l, hoje);
                  const parcial = Number(l.valor_pago ?? 0) > 0 && Number(l.valor_pago ?? 0) < Number(l.valor);
                  return (
                    <tr key={l.id} className="hover:bg-surface-2/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${l.tipo === 'entrada' ? 'bg-ok/10 text-ok' : 'bg-erro/10 text-erro'}`}>
                            <MiniIcone tipo={l.tipo === 'entrada' ? 'arrowUp' : 'arrowDown'} />
                          </span>
                          <span className="font-extrabold text-ink">{l.descricao}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-texto-2">{t(`financeiro.categoriaLabel.${l.categoria}`, { defaultValue: l.categoria })}</td>
                      <td className="px-4 py-3 text-texto-2">{l.conta ?? '—'}</td>
                      <td className="px-4 py-3 text-texto-2">{dataCurta(l.vencimento, formato)}</td>
                      <td className={`px-4 py-3 text-right font-extrabold tabular-nums ${l.tipo === 'entrada' ? 'text-ok' : 'text-erro'}`}>
                        {l.tipo === 'entrada' ? '+' : '-'}<Dinheiro centavos={Number(l.valor)} />
                        {parcial && <span className="block text-[10px] font-semibold text-texto-2"><Dinheiro centavos={Number(l.valor_pago)} /> {t('financeiro.pagoDe')}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Etiqueta cor={status === 'pago' ? 'verde' : status === 'atrasado' ? 'vermelho' : status === 'cancelado' ? 'cinza' : parcial ? 'azul' : 'amarelo'}>
                          {status === 'pago' && l.tipo === 'entrada' ? t('financeiro.statusLabel.recebido') : parcial ? t('financeiro.parcial') : t(`financeiro.statusLabel.${status}`)}
                        </Etiqueta>
                      </td>
                      <td className="px-4 py-3 text-texto-2">{t(`financeiro.origemLabel.${l.origem_tipo ?? 'manual'}`, { defaultValue: l.origem_tipo ?? 'manual' })}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1.5 text-texto-2">
                          <button className="rounded-md p-1.5 hover:bg-surface-2 hover:text-brand-azul" title={t('financeiro.ver')}><MiniIcone tipo="eye" /></button>
                          {status !== 'pago' && status !== 'cancelado' && pode('financeiro', 'editar') && (
                            <button className="rounded-md p-1.5 hover:bg-surface-2 hover:text-brand-roxo" onClick={() => setBaixa(l)} title={l.tipo === 'entrada' ? t('financeiro.receber') : t('financeiro.pagar')}><MiniIcone tipo="check" /></button>
                          )}
                          <button className="rounded-md p-1.5 hover:bg-surface-2 hover:text-ink" title={t('financeiro.mais')}><MiniIcone tipo="more" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <section className="rounded-xl border border-borda bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-extrabold text-ink">{t('financeiro.categoriasPeriodo')}</h2>
          <div className="space-y-3">
            {categoriasResumo.length === 0 ? <p className="text-sm text-texto-2">{t('estados.vazio')}</p> : categoriasResumo.map((c, i) => (
              <div key={c.categoria} className="grid grid-cols-[150px_minmax(0,1fr)_70px_100px] items-center gap-3 text-xs">
                <span className="font-bold text-texto-2">{t(`financeiro.categoriaLabel.${c.categoria}`, { defaultValue: c.categoria })}</span>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(8, Math.round((c.valor / maiorCategoria) * 100))}%`, background: `linear-gradient(100deg, ${corCategoria(i)}, #e5179a)` }} />
                </div>
                <span className="text-right font-bold text-texto-2">{percentual(c.valor / maiorCategoria, formato)}</span>
                <span className="text-right font-bold text-ink">{moeda(c.valor, formato)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-borda bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-extrabold text-ink">{t('financeiro.resumoStatus')}</h2>
          <div className="flex items-center gap-5">
            <StatusResumo {...statusResumo} />
            <div className="min-w-0 flex-1 space-y-2 text-xs">
              {[
                ['pago', statusResumo.pago, '#16a34a'],
                ['pendente', statusResumo.pendente, '#f59e0b'],
                ['atrasado', statusResumo.atrasado, '#ef4444'],
              ].map(([status, qtd, cor]) => {
                const total = Math.max(1, statusResumo.pago + statusResumo.pendente + statusResumo.atrasado);
                return (
                  <div key={String(status)} className="grid grid-cols-[1fr_34px_58px] items-center gap-3">
                    <span className="flex items-center gap-2 font-bold text-ink"><span className="size-2 rounded-full" style={{ backgroundColor: String(cor) }} /> {t(`financeiro.statusLabel.${status}`)}</span>
                    <span className="text-right font-extrabold text-ink">{String(qtd)}</span>
                    <span className="text-right font-semibold text-texto-2">{percentual(Number(qtd) / total, formato)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <Modal aberto={novo} titulo={t('financeiro.novoLancamento')} onFechar={() => setNovo(false)}>
        <form onSubmit={salvar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('financeiro.tipo')}>
              <Selecao name="tipo" defaultValue="saida">
                <option value="entrada">{t('financeiro.tipoLabel.entrada')}</option>
                <option value="saida">{t('financeiro.tipoLabel.saida')}</option>
              </Selecao>
            </Campo>
            <Campo rotulo={t('financeiro.categoria')}>
              <Selecao name="categoria" defaultValue="outros">
                {categorias.map((c) => <option key={c} value={c}>{t(`financeiro.categoriaLabel.${c}`, { defaultValue: c })}</option>)}
              </Selecao>
            </Campo>
          </div>
          <Campo rotulo={t('financeiro.descricao')}>
            <Entrada name="descricao" required />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('financeiro.vencimento')}>
              <Entrada name="vencimento" type="date" required defaultValue={hoje} />
            </Campo>
            <Campo rotulo={t('financeiro.valor')}>
              <EntradaDinheiro name="valor" required defaultCentavos={0} />
            </Campo>
          </div>
          <Campo rotulo={t('financeiro.conta')} dica={t('financeiro.contaDica')}>
            <Entrada name="conta" placeholder={t('financeiro.contaPlaceholder')} />
          </Campo>
          {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setNovo(false)}>{t('acoes.cancelar')}</Botao>
            <Botao type="submit">{t('acoes.salvar')}</Botao>
          </div>
        </form>
      </Modal>

      <Modal aberto={!!baixa} titulo={baixa?.tipo === 'entrada' ? t('financeiro.registrarRecebimento') : t('financeiro.registrarPagamento')} onFechar={() => setBaixa(null)}>
        {baixa && (
          <form onSubmit={registrarBaixa} className="space-y-3">
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <p className="font-semibold text-ink">{baixa.descricao}</p>
              <p className="text-xs text-texto-2">
                {t('financeiro.totalLanc')}: <Dinheiro centavos={Number(baixa.valor)} />
                {Number(baixa.valor_pago) > 0 && <> · {t('financeiro.jaPago')}: <Dinheiro centavos={Number(baixa.valor_pago)} /></>}
                {' · '}{t('financeiro.restante')}: <span className="font-bold"><Dinheiro centavos={restante(baixa)} /></span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={t('financeiro.valorBaixa')} dica={t('financeiro.valorBaixaDica')}>
                <EntradaDinheiro name="valor" required defaultCentavos={restante(baixa)} />
              </Campo>
              <Campo rotulo={t('financeiro.conta')}>
                <Entrada name="conta" defaultValue={baixa.conta ?? ''} placeholder={t('financeiro.contaPlaceholderCurto')} />
              </Campo>
            </div>
            {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setBaixa(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit" variante="acento">{t('acoes.confirmar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function ListaProximos({
  titulo,
  vazio,
  itens,
  formato,
  hoje,
  tipo,
}: {
  titulo: string;
  vazio: string;
  itens: Lancamento[];
  formato: ReturnType<typeof useAuth>['formato'];
  hoje: string;
  tipo: TipoLancamento;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-borda bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-ink">{titulo}</h2>
        <span className="text-[11px] font-bold text-brand-azul">{t('financeiro.verTodos')}</span>
      </div>
      {itens.length === 0 ? (
        <p className="py-5 text-center text-xs text-texto-2">{vazio}</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((l) => {
            const atrasado = l.vencimento < hoje;
            return (
              <li key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-borda/70 p-2">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tipo === 'entrada' ? 'bg-ok/10 text-ok' : 'bg-erro/10 text-erro'}`}>
                  <MiniIcone tipo={tipo === 'entrada' ? 'arrowUp' : 'calendar'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-extrabold text-ink">{l.descricao}</span>
                  <span className={atrasado ? 'text-[11px] font-bold text-erro' : 'text-[11px] text-texto-2'}>{dataCurta(l.vencimento, formato)}</span>
                </span>
                <Dinheiro centavos={restante(l)} className={`shrink-0 text-xs font-extrabold ${tipo === 'entrada' ? 'text-ok' : 'text-erro'}`} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
