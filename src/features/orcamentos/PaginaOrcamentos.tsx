/**
 * Tela 14 — Lista de orçamentos (estrutura v2): 4 KPIs (taxa de conversão
 * herói), filtro por status, tabela com chips e validade vencida em alerta.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLista } from '@/lib/dados';
import { dataCurta, percentual } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Carregando, Dinheiro, EstadoErro, EstadoVazio,
  Etiqueta, Kpi, Selecao, TabelaDados,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

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
  const { formato } = useAuth();
  const navigate = useNavigate();
  const lista = useLista<OrcamentoView>('v_orcamento', { ordem: 'created_at', desc: true });
  const [filtroStatus, setFiltroStatus] = useState('');

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
        acoes={<Botao variante="acento" onClick={() => navigate('/calculadora')}>+ {t('orcamento.novo')}</Botao>}
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

      {filtrados.length === 0 ? (
        <EstadoVazio acao={!filtroStatus ? <Botao variante="acento" onClick={() => navigate('/calculadora')}>+ {t('orcamento.novo')}</Botao> : undefined} />
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
        />
      )}
    </div>
  );
}
