/**
 * Tela 14 — Lista de orçamentos (estrutura v2): 4 KPIs (taxa de conversão
 * herói), filtro por status, tabela com chips e validade vencida em alerta.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { dataCurta, percentual } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Carregando, Dinheiro, EstadoErro, EstadoVazio,
  Etiqueta, Kpi, Selecao, TabelaDados,
} from '@/components/ui';
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
  created_at: string;
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

export function PaginaOrcamentos() {
  const { t } = useTranslation();
  const { formato, pode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const lista = useLista<OrcamentoView>('v_orcamento', { ordem: 'created_at', desc: true });
  const [filtroStatus, setFiltroStatus] = useState('');
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [agindo, setAgindo] = useState<string | null>(null);

  async function mudarStatus(o: OrcamentoView, status: string) {
    setAgindo(o.id); setErro(null);
    const patch: Record<string, unknown> = { status };
    if (status === 'enviado') patch.enviado_em = new Date().toISOString();
    const { error } = await supabase.from('orcamento').update(patch).eq('id', o.id);
    setAgindo(null);
    if (error) setErro(mensagemErro(error));
    else qc.invalidateQueries({ queryKey: ['v_orcamento'] });
  }
  async function aprovar(o: OrcamentoView) {
    setAgindo(o.id); setErro(null);
    const { data, error } = await supabase.rpc('aprovar_orcamento', { p_orcamento: o.id });
    setAgindo(null);
    if (error) setErro(mensagemErro(error));
    else { qc.invalidateQueries(); navigate('/pedidos', { state: { pedido: data } }); }
  }

  const kpis = useMemo(() => {
    const todos = lista.data ?? [];
    const decididos = todos.filter((o) => ['aprovado', 'recusado', 'expirado'].includes(o.status));
    const aprovados = todos.filter((o) => o.status === 'aprovado');
    return {
      abertos: todos.filter((o) => ['rascunho', 'enviado'].includes(o.status)).length,
      aguardando: todos.filter((o) => o.status === 'aguardando_resposta').length,
      aprovados: aprovados.length,
      conversao: decididos.length > 0 ? aprovados.length / decididos.length : null,
    };
  }, [lista.data]);

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  const hoje = new Date().toISOString().slice(0, 10);
  const filtrados = (lista.data ?? []).filter((o) => !filtroStatus || o.status === filtroStatus);

  return (
    <div>
      <CabecalhoPagina
        titulo={t('orcamento.titulo')}
        acoes={pode('orcamentos', 'criar') ? (
          <div className="flex items-center gap-2">
            <Botao variante="secundario" onClick={() => navigate('/calculadora')}>{t('orcamento.novoPelaCalculadora')}</Botao>
            <Botao variante="acento" onClick={() => setNovo(true)}>+ {t('orcamento.novoManual')}</Botao>
          </div>
        ) : undefined}
      />

      {/* 4 KPIs — taxa de conversão como herói (v2) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={t('orcamento.kpiConversao')} destaque>
          {kpis.conversao != null ? percentual(kpis.conversao, formato) : '—'}
        </Kpi>
        <Kpi rotulo={t('orcamento.kpiAbertos')}>{kpis.abertos}</Kpi>
        <Kpi rotulo={t('orcamento.statusLabel.aguardando_resposta')}>{kpis.aguardando}</Kpi>
        <Kpi rotulo={t('orcamento.kpiAprovados')}>{kpis.aprovados}</Kpi>
      </div>

      <div className="mb-3">
        <Selecao value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="!w-auto">
          <option value="">{t('orcamento.todosStatus')}</option>
          {Object.keys(COR_STATUS_ORC).map((s) => (
            <option key={s} value={s}>{t(`orcamento.statusLabel.${s}`)}</option>
          ))}
        </Selecao>
      </div>

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      {filtrados.length === 0 ? (
        <EstadoVazio acao={!filtroStatus && pode('orcamentos', 'criar') ? <Botao variante="acento" onClick={() => setNovo(true)}>+ {t('orcamento.novoManual')}</Botao> : undefined} />
      ) : (
        <TabelaDados<OrcamentoView>
          colunas={[
            {
              titulo: t('orcamento.numero'),
              principal: true,
              render: (o) => (
                <Link to={`/orcamentos/${o.id}`} className="font-bold text-ink hover:text-brand-azul">
                  {o.numero}
                </Link>
              ),
            },
            { titulo: t('orcamento.cliente'), render: (o) => o.cliente_snapshot?.nome ?? '—' },
            { titulo: t('orcamento.total'), numerica: true, render: (o) => <span className="font-semibold"><Dinheiro centavos={o.total} /></span> },
            {
              titulo: t('orcamento.validade'),
              render: (o) => {
                const vencido = o.validade && o.validade < hoje && !['aprovado', 'recusado', 'cancelado'].includes(o.status);
                return (
                  <span className={vencido ? 'font-semibold text-alerta' : 'text-texto-2'}>
                    {dataCurta(o.validade, formato)}{vencido ? ' ⚠' : ''}
                  </span>
                );
              },
            },
            {
              titulo: t('orcamento.status'),
              render: (o) => (
                <Etiqueta cor={COR_STATUS_ORC[o.status] ?? 'cinza'}>
                  {t(`orcamento.statusLabel.${o.status}`)}
                </Etiqueta>
              ),
            },
          ]}
          linhas={filtrados}
          chave={(o) => o.id}
          acoes={(o) => {
            if (!pode('orcamentos', 'editar')) return null;
            const ocupado = agindo === o.id;
            const vencido = o.validade && o.validade < hoje;
            return (
              <div className="flex flex-wrap justify-end gap-1">
                {o.status === 'rascunho' && (
                  <Botao variante="secundario" className="!px-2 !py-1 !text-[11px]" disabled={ocupado} onClick={() => mudarStatus(o, 'enviado')}>
                    {t('orcamento.enviar')}
                  </Botao>
                )}
                {['enviado', 'aguardando_resposta'].includes(o.status) && (
                  <>
                    {vencido ? (
                      <Botao variante="secundario" className="!px-2 !py-1 !text-[11px]" disabled={ocupado} onClick={() => mudarStatus(o, 'expirado')}>
                        {t('orcamento.marcarExpirado')}
                      </Botao>
                    ) : (
                      <Botao variante="fantasma" className="!px-2 !py-1 !text-[11px]" disabled={ocupado} onClick={() => mudarStatus(o, 'recusado')}>
                        {t('orcamento.recusar')}
                      </Botao>
                    )}
                  </>
                )}
                {['rascunho', 'enviado', 'aguardando_resposta'].includes(o.status) && pode('orcamentos', 'aprovar') && (
                  <Botao variante="acento" className="!px-2 !py-1 !text-[11px]" disabled={ocupado} onClick={() => aprovar(o)}>
                    {t('orcamento.aprovar')}
                  </Botao>
                )}
              </div>
            );
          }}
        />
      )}

      <ModalNovoOrcamento aberto={novo} onFechar={() => setNovo(false)} />
    </div>
  );
}
