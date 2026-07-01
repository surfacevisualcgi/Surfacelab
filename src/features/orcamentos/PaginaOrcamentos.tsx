import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { mensagemErro, useLista } from '@/lib/dados';
import { dataCurta, percentual } from '@/lib/formato';
import { Botao, Carregando, Dinheiro, Entrada, EstadoErro, EstadoVazio, Etiqueta } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { ModalNovoOrcamento } from './ModalNovoOrcamento';

export interface OrcamentoView {
  id: string;
  numero: string;
  status: string;
  cliente_snapshot: { nome?: string } | null;
  validade: string | null;
  total: number;
  custo_total: number | null;
  lucro_estimado: number | null;
  margem_estimada: number | null;
  calculo_snapshot: unknown;
  simulacao_id?: string | null;
  created_at: string;
}

interface OrcamentoItemResumo {
  id: string;
  orcamento_id: string;
  descricao: string;
  quantidade: number;
}

export const COR_STATUS_ORC: Record<string, 'cinza' | 'azul' | 'amarelo' | 'verde' | 'vermelho'> = {
  rascunho: 'cinza',
  enviado: 'azul',
  aguardando_resposta: 'amarelo',
  aprovado: 'verde',
  recusado: 'vermelho',
  cancelado: 'vermelho',
  expirado: 'cinza',
};

const PERIODOS = [1, 7, 15, 30, 60, 90, 180, 360] as const;

const STATUS_FILTROS = [
  { valor: '', chave: 'orcamento.overview.statusTodos' },
  { valor: 'rascunho', chave: 'orcamento.statusLabel.rascunho' },
  { valor: 'enviado', chave: 'orcamento.statusLabel.enviado' },
  { valor: 'aguardando_resposta', chave: 'orcamento.overview.statusAguardandoCurto' },
  { valor: 'aprovado', chave: 'orcamento.statusLabel.aprovado' },
  { valor: 'recusado', chave: 'orcamento.statusLabel.recusadoPublico' },
  { valor: 'expirado', chave: 'orcamento.statusLabel.expirado' },
] as const;

function inicioPeriodo(dias: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dias - 1));
  return d;
}

function pluralItens(qtd: number, t: ReturnType<typeof useTranslation>['t']) {
  if (qtd === 0) return t('orcamento.overview.semItens');
  return t('orcamento.overview.itens', { count: qtd });
}

function statusLegivel(status: string, t: ReturnType<typeof useTranslation>['t']) {
  if (status === 'recusado') return t('orcamento.statusLabel.recusadoPublico');
  return t(`orcamento.statusLabel.${status}`);
}

function MiniIconeOrcamento({ tipo }: { tipo: 'total' | 'conversao' | 'aberto' | 'aguardando' | 'aprovado' | 'recusado' }) {
  const paths: Record<typeof tipo, string> = {
    total: 'M7 2h10v3h3v17H4V5h3V2Zm2 3h6V4H9v1Zm-1 5h8v2H8v-2Zm0 4h5v2H8v-2Z',
    conversao: 'M7 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10-4a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 20 18 4l1.6 1.2-12 16L6 20Z',
    aberto: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5v5.4l4 2.4-1 1.7-5-3V7h2Z',
    aguardando: 'M6 2h12v6a6 6 0 0 1-3.2 5.3L12 15l-2.8-1.7A6 6 0 0 1 6 8V2Zm2 2v4a4 4 0 0 0 2.1 3.5L12 12.6l1.9-1.1A4 4 0 0 0 16 8V4H8Zm-2 16h12v2H6v-2Zm3-4h6v2H9v-2Z',
    aprovado: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-1.1 14.2-4-4 1.4-1.4 2.6 2.6 5.8-5.8 1.4 1.4-7.2 7.2Z',
    recusado: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm3.5 12.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1-2.1-2.1 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1Z',
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={paths[tipo]} />
    </svg>
  );
}

function KpiOrcamento({
  icone,
  rotulo,
  valor,
  detalhe,
  destaque = false,
  cor = 'roxo',
}: {
  icone: 'total' | 'conversao' | 'aberto' | 'aguardando' | 'aprovado' | 'recusado';
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: boolean;
  cor?: 'azul' | 'roxo' | 'laranja' | 'verde' | 'vermelho';
}) {
  const cores = {
    azul: 'bg-brand-azul/10 text-brand-azul',
    roxo: 'bg-brand-roxo/10 text-brand-roxo',
    laranja: 'bg-alerta/10 text-alerta',
    verde: 'bg-ok/10 text-ok',
    vermelho: 'bg-erro/10 text-erro',
  };
  return (
    <div className="min-w-0 rounded-xl border border-borda bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cores[cor]}`}>
          <MiniIconeOrcamento tipo={icone} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-ink">{rotulo}</p>
          <div className={`mt-0.5 text-2xl font-extrabold leading-none tabular-nums ${destaque ? 'grad-texto' : 'text-ink'}`}>
            {valor}
          </div>
          {detalhe && <p className="mt-1 truncate text-xs text-texto-2">{detalhe}</p>}
        </div>
      </div>
    </div>
  );
}

export function PaginaOrcamentos() {
  const { t } = useTranslation();
  const { ativa, formato, pode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const lista = useLista<OrcamentoView>('v_orcamento', { ordem: 'created_at', desc: true });
  const itens = useQuery({
    queryKey: ['v_orcamento_item', ativa?.tenant_id, 'resumo-lista'],
    enabled: !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_orcamento_item')
        .select('id, orcamento_id, descricao, quantidade')
        .is('deleted_at', null)
        .order('ordem');
      if (error) throw error;
      return data as OrcamentoItemResumo[];
    },
  });

  const [filtroStatus, setFiltroStatus] = useState('');
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>(30);
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [agindo, setAgindo] = useState<string | null>(null);

  async function mudarStatus(o: OrcamentoView, status: string) {
    setAgindo(o.id);
    setErro(null);
    const patch: Record<string, unknown> = { status };
    if (status === 'enviado') patch.enviado_em = new Date().toISOString();
    const { error } = await supabase.from('orcamento').update(patch).eq('id', o.id);
    setAgindo(null);
    if (error) setErro(mensagemErro(error));
    else qc.invalidateQueries({ queryKey: ['v_orcamento'] });
  }

  async function aprovar(o: OrcamentoView) {
    setAgindo(o.id);
    setErro(null);
    const { data, error } = await supabase.rpc('aprovar_orcamento', { p_orcamento: o.id });
    setAgindo(null);
    if (error) setErro(mensagemErro(error));
    else {
      qc.invalidateQueries();
      navigate('/pedidos', { state: { pedido: data } });
    }
  }

  const itensPorOrcamento = useMemo(() => {
    const mapa = new Map<string, OrcamentoItemResumo[]>();
    for (const item of itens.data ?? []) {
      const atuais = mapa.get(item.orcamento_id) ?? [];
      atuais.push(item);
      mapa.set(item.orcamento_id, atuais);
    }
    return mapa;
  }, [itens.data]);

  const dadosPeriodo = useMemo(() => {
    const todos = lista.data ?? [];
    const inicio = inicioPeriodo(periodo);
    const anteriorInicio = new Date(inicio);
    anteriorInicio.setDate(anteriorInicio.getDate() - periodo);
    const atual = todos.filter((o) => new Date(o.created_at) >= inicio);
    const anterior = todos.filter((o) => {
      const criado = new Date(o.created_at);
      return criado >= anteriorInicio && criado < inicio;
    });
    return { atual, anterior };
  }, [lista.data, periodo]);

  const kpis = useMemo(() => {
    const todos = dadosPeriodo.atual;
    const anterior = dadosPeriodo.anterior;
    const decididos = todos.filter((o) => ['aprovado', 'recusado'].includes(o.status));
    const aprovados = todos.filter((o) => o.status === 'aprovado');
    const total = todos.reduce((acc, o) => acc + (o.total ?? 0), 0);
    const totalAnterior = anterior.reduce((acc, o) => acc + (o.total ?? 0), 0);
    const variacao = totalAnterior > 0 ? (total - totalAnterior) / totalAnterior : null;
    return {
      total,
      variacao,
      abertos: todos.filter((o) => ['rascunho', 'enviado'].includes(o.status)).length,
      aguardando: todos.filter((o) => o.status === 'aguardando_resposta').length,
      aprovados: aprovados.length,
      recusados: todos.filter((o) => o.status === 'recusado').length,
      conversao: decididos.length > 0 ? aprovados.length / decididos.length : null,
    };
  }, [dadosPeriodo]);

  if (lista.isLoading || itens.isLoading) return <Carregando />;
  if (lista.isError || itens.isError) return <EstadoErro onRetry={() => { lista.refetch(); itens.refetch(); }} />;

  const hoje = new Date().toISOString().slice(0, 10);
  const buscaNormalizada = busca.trim().toLowerCase();
  const filtrados = dadosPeriodo.atual.filter((o) => {
    const itensDoOrc = itensPorOrcamento.get(o.id) ?? [];
    const textoItens = itensDoOrc.map((i) => i.descricao).join(' ').toLowerCase();
    const texto = `${o.numero} ${o.cliente_snapshot?.nome ?? ''} ${textoItens}`.toLowerCase();
    return (!filtroStatus || o.status === filtroStatus) && (!buscaNormalizada || texto.includes(buscaNormalizada));
  });

  const proximosVencimentos = filtrados
    .filter((o) => o.validade && !['aprovado', 'recusado', 'cancelado'].includes(o.status))
    .sort((a, b) => String(a.validade).localeCompare(String(b.validade)))
    .slice(0, 3);

  const origem = dadosPeriodo.atual.reduce((acc, o) => {
    const snap = o.calculo_snapshot as { origem?: string } | null;
    const chave = snap?.origem === 'orcamento_manual' ? 'manual' : o.simulacao_id ? 'calculadora' : 'recorrente';
    acc[chave] = (acc[chave] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalOrigem = Object.values(origem).reduce((acc, v) => acc + v, 0) || 1;

  return (
    <div className="mx-auto flex w-full flex-col lg:h-[calc(100dvh-112px)] lg:min-h-0 lg:overflow-hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-ink 2xl:text-2xl">{t('orcamento.titulo')}</h1>
          <p className="mt-1 text-sm text-texto-2">{t('orcamento.overview.subtitulo')}</p>
        </div>
        {pode('orcamentos', 'criar') && (
          <div className="flex items-center gap-2">
            <Botao variante="secundario" onClick={() => navigate('/calculadora')}>{t('orcamento.novoPelaCalculadora')}</Botao>
            <Botao variante="acento" onClick={() => setNovo(true)}>+ {t('orcamento.novoManual')}</Botao>
          </div>
        )}
      </div>

      <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)_minmax(300px,0.8fr)] xl:items-end">
        <div>
          <p className="mb-2 text-xs font-extrabold text-texto-2">{t('orcamento.overview.periodo')}</p>
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-borda bg-white p-1 min-[1600px]:grid-cols-8">
            {PERIODOS.map((dias) => (
              <button
                key={dias}
                onClick={() => setPeriodo(dias)}
                className={`rounded-lg px-3 py-2 text-xs font-extrabold transition-colors ${
                  periodo === dias ? 'grad-acento text-white shadow-sm' : 'text-texto-2 hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {dias === 1 ? '1D' : `${dias}D`}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-extrabold text-texto-2">{t('orcamento.status')}</p>
          <div className="flex overflow-x-auto rounded-xl border border-borda bg-white p-1">
            {STATUS_FILTROS.map((status) => (
              <button
                key={status.valor || 'todos'}
                onClick={() => setFiltroStatus(status.valor)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  filtroStatus === status.valor ? 'border border-brand-azul bg-brand-azul/5 text-brand-azul' : 'border border-transparent text-texto-2 hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {t(status.chave)}
              </button>
            ))}
          </div>
        </div>
        <Entrada
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t('orcamento.overview.busca')}
          className="min-w-0 xl:w-80"
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiOrcamento
          icone="total"
          rotulo={t('orcamento.overview.totalOrcado')}
          destaque
          cor="azul"
          valor={<Dinheiro centavos={kpis.total} />}
          detalhe={kpis.variacao == null ? t('orcamento.overview.dias', { count: periodo }) : `${kpis.variacao >= 0 ? '+' : ''}${percentual(kpis.variacao, formato)} ${t('orcamento.overview.vsAnterior')}`}
        />
        <KpiOrcamento icone="conversao" rotulo={t('orcamento.kpiConversao')} valor={kpis.conversao != null ? percentual(kpis.conversao, formato) : '—'} />
        <KpiOrcamento icone="aberto" rotulo={t('orcamento.kpiAbertos')} valor={kpis.abertos} cor="azul" />
        <KpiOrcamento icone="aguardando" rotulo={t('orcamento.overview.aguardandoResposta')} valor={kpis.aguardando} cor="laranja" />
        <KpiOrcamento icone="aprovado" rotulo={t('orcamento.kpiAprovados')} valor={kpis.aprovados} cor="verde" />
        <KpiOrcamento icone="recusado" rotulo={t('orcamento.overview.naoAprovados')} valor={kpis.recusados} cor="vermelho" />
      </div>

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      {filtrados.length === 0 ? (
        <EstadoVazio acao={!filtroStatus && pode('orcamentos', 'criar') ? <Botao variante="acento" onClick={() => setNovo(true)}>+ {t('orcamento.novoManual')}</Botao> : undefined} />
      ) : (
        <section className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-borda bg-white lg:min-h-0">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-borda px-4 py-3">
            <div>
              <h2 className="text-sm font-extrabold text-ink">{t('orcamento.overview.listaTitulo')}</h2>
              <p className="mt-0.5 text-xs text-texto-2">{t('orcamento.overview.listaAjuda')}</p>
            </div>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-texto-2">
              {t('orcamento.overview.registros', { count: filtrados.length })}
            </span>
          </div>
          <div className="hidden min-h-0 flex-1 overflow-auto xl:block">
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="border-b border-borda bg-surface-2/70 text-left">
                  {[
                    t('orcamento.numero'),
                    t('orcamento.cliente'),
                    t('orcamento.overview.produtos'),
                    t('orcamento.total'),
                    t('orcamento.validade'),
                    t('orcamento.criadoEm'),
                    t('orcamento.status'),
                    t('orcamento.overview.acoes'),
                  ].map((cab, idx) => (
                    <th key={cab} className={`px-4 py-3 text-[11px] font-extrabold uppercase tracking-wide text-texto-2 ${idx === 3 ? 'text-right' : ''}`}>
                      {cab}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda/70">
                {filtrados.map((o) => {
                  const itensDoOrc = itensPorOrcamento.get(o.id) ?? [];
                  const ocupado = agindo === o.id;
                  const vencido = o.validade && o.validade < hoje && !['aprovado', 'recusado', 'cancelado'].includes(o.status);
                  return (
                    <tr key={o.id} className="hover:bg-surface-2/50">
                      <td className="px-4 py-3">
                        <Link to={`/orcamentos/${o.id}`} className="font-extrabold text-ink hover:text-brand-azul">
                          {o.numero}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink">{o.cliente_snapshot?.nome ?? '—'}</td>
                      <td className="max-w-[320px] px-4 py-3">
                        <p className="font-semibold text-ink">{pluralItens(itensDoOrc.length, t)}</p>
                        <p className="truncate text-xs text-texto-2">{itensDoOrc.map((i) => i.descricao).join(', ') || t('orcamento.overview.itensNaoVinculados')}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold tabular-nums text-ink"><Dinheiro centavos={o.total} /></td>
                      <td className={`px-4 py-3 ${vencido ? 'font-bold text-alerta' : 'text-texto-2'}`}>
                        {dataCurta(o.validade, formato)}{vencido ? ' !' : ''}
                      </td>
                      <td className="px-4 py-3 text-texto-2">{dataCurta(o.created_at, formato)}</td>
                      <td className="px-4 py-3">
                        <Etiqueta cor={COR_STATUS_ORC[o.status] ?? 'cinza'}>{statusLegivel(o.status, t)}</Etiqueta>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Botao variante="secundario" className="!px-2.5 !py-1.5 !text-[11px]" onClick={() => navigate(`/orcamentos/${o.id}`)}>
                            {t('orcamento.overview.ver')}
                          </Botao>
                          {pode('orcamentos', 'editar') && o.status === 'rascunho' && (
                            <Botao variante="secundario" className="!px-2.5 !py-1.5 !text-[11px]" disabled={ocupado} onClick={() => mudarStatus(o, 'enviado')}>
                              {t('orcamento.enviar')}
                            </Botao>
                          )}
                          {pode('orcamentos', 'editar') && ['enviado', 'aguardando_resposta'].includes(o.status) && (
                            <Botao variante="fantasma" className="!px-2.5 !py-1.5 !text-[11px]" disabled={ocupado} onClick={() => mudarStatus(o, vencido ? 'expirado' : 'recusado')}>
                              {vencido ? t('orcamento.overview.expirar') : t('orcamento.recusar')}
                            </Botao>
                          )}
                          {['rascunho', 'enviado', 'aguardando_resposta'].includes(o.status) && pode('orcamentos', 'aprovar') && (
                            <Botao variante="acento" className="!px-2.5 !py-1.5 !text-[11px]" disabled={ocupado} onClick={() => aprovar(o)}>
                              {t('orcamento.aprovar')}
                            </Botao>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 p-3 xl:hidden">
            {filtrados.map((o) => {
              const itensDoOrc = itensPorOrcamento.get(o.id) ?? [];
              return (
                <Link key={o.id} to={`/orcamentos/${o.id}`} className="block rounded-xl border border-borda p-3 hover:bg-surface-2/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-ink">{o.numero}</p>
                      <p className="text-sm text-texto-2">{o.cliente_snapshot?.nome ?? '—'}</p>
                    </div>
                    <Etiqueta cor={COR_STATUS_ORC[o.status] ?? 'cinza'}>{statusLegivel(o.status, t)}</Etiqueta>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <span><b>{t('orcamento.total')}:</b> <Dinheiro centavos={o.total} /></span>
                    <span><b>{t('orcamento.overview.produtos')}:</b> {pluralItens(itensDoOrc.length, t)}</span>
                    <span><b>{t('orcamento.validade')}:</b> {dataCurta(o.validade, formato)}</span>
                    <span><b>{t('orcamento.overview.criado')}:</b> {dataCurta(o.created_at, formato)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.55fr)]">
        <section className="rounded-xl border border-borda bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-ink">{t('orcamento.overview.proximosVencimentos')}</h2>
            <span className="text-xs font-semibold text-texto-2">{t('orcamento.overview.dias', { count: periodo })}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {proximosVencimentos.length === 0 ? (
              <p className="text-sm text-texto-2 md:col-span-3">{t('orcamento.overview.semProximos')}</p>
            ) : proximosVencimentos.map((o) => (
              <Link key={o.id} to={`/orcamentos/${o.id}`} className="rounded-lg border border-borda p-3 hover:bg-surface-2/60">
                <p className="text-xs font-extrabold text-ink">{o.numero}</p>
                <p className="mt-1 truncate text-xs text-texto-2">{o.cliente_snapshot?.nome ?? '—'}</p>
                <p className="mt-2 text-xs font-bold text-alerta">{dataCurta(o.validade, formato)}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-borda bg-white p-4">
          <h2 className="mb-3 text-sm font-extrabold text-ink">{t('orcamento.overview.origemTitulo')}</h2>
          <div className="space-y-3">
            {(['calculadora', 'manual', 'recorrente'] as const).map((rotulo) => {
              const qtd = origem[rotulo] ?? 0;
              return (
                <div key={rotulo}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-bold text-ink">{t(`orcamento.overview.origem.${rotulo}`)}</span>
                    <span className="font-semibold text-texto-2">{qtd}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full grad-acento" style={{ width: `${Math.round((qtd / totalOrigem) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <ModalNovoOrcamento aberto={novo} onFechar={() => setNovo(false)} />
    </div>
  );
}
