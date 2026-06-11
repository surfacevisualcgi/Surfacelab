/**
 * Tela 09 — detalhe do orçamento: itens congelados, resumo interno (mascarado
 * sem ver_custos), detalhamento do snapshot e transições de status.
 * Aprovar chama a RPC transacional (pedido + OPs + reserva de estoque).
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { mensagemErro } from '@/lib/dados';
import { dataCurta, percentual } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Carregando, Cartao, Dinheiro, EstadoErro, Etiqueta,
  Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { COR_STATUS_ORC, type OrcamentoView } from './PaginaOrcamentos';
import type { ResultadoCalculo } from '@/core/calculo';

interface ItemView {
  id: string;
  descricao: string;
  quantidade: number;
  valor_unit: number;
  valor_total: number;
  custo_unit: number | null;
}

export function PaginaOrcamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { ativa, pode, flag, formato } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [agindo, setAgindo] = useState(false);

  const orc = useQuery({
    queryKey: ['v_orcamento', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_orcamento').select('*').eq('id', id).single();
      if (error) throw error;
      return data as OrcamentoView & { observacoes: string | null; prazo_entrega: string | null };
    },
  });

  const itens = useQuery({
    queryKey: ['v_orcamento_item', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_orcamento_item').select('*').eq('orcamento_id', id).is('deleted_at', null).order('ordem');
      if (error) throw error;
      return data as ItemView[];
    },
  });

  async function mudarStatus(status: string) {
    setAgindo(true);
    setErro(null);
    const patch: Record<string, unknown> = { status };
    if (status === 'enviado') patch.enviado_em = new Date().toISOString();
    const { error } = await supabase.from('orcamento').update(patch).eq('id', id);
    setAgindo(false);
    if (error) setErro(mensagemErro(error));
    else {
      qc.invalidateQueries({ queryKey: ['v_orcamento'] });
      orc.refetch();
    }
  }

  async function aprovar() {
    setAgindo(true);
    setErro(null);
    const { data, error } = await supabase.rpc('aprovar_orcamento', { p_orcamento: id });
    setAgindo(false);
    if (error) setErro(mensagemErro(error));
    else {
      qc.invalidateQueries();
      navigate('/pedidos', { state: { pedido: data } });
    }
  }

  if (orc.isLoading || itens.isLoading) return <Carregando />;
  if (orc.isError || !orc.data) return <EstadoErro onRetry={() => orc.refetch()} />;

  const o = orc.data;
  const snapshot = (flag('ver_custos') ? o.calculo_snapshot : null) as ResultadoCalculo | null;

  return (
    <div>
      <CabecalhoPagina
        titulo={o.numero}
        subtitulo={o.cliente_snapshot?.nome ?? undefined}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <Etiqueta cor={COR_STATUS_ORC[o.status] ?? 'cinza'}>{t(`orcamento.statusLabel.${o.status}`)}</Etiqueta>
            {o.status === 'rascunho' && pode('orcamentos', 'editar') && (
              <Botao variante="secundario" disabled={agindo} onClick={() => mudarStatus('enviado')}>
                {t('orcamento.marcarEnviado')}
              </Botao>
            )}
            {['rascunho', 'enviado', 'aguardando_resposta'].includes(o.status) && pode('orcamentos', 'aprovar') && (
              <>
                <Botao variante="perigo" disabled={agindo} onClick={() => mudarStatus('recusado')}>
                  {t('orcamento.recusar')}
                </Botao>
                <Botao variante="acento" disabled={agindo} onClick={aprovar}>
                  {t('orcamento.aprovarGerarPedido')}
                </Botao>
              </>
            )}
          </div>
        }
      />

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      {o.status !== 'rascunho' && (
        <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-texto-2">
          🔒 {t('orcamento.snapshotAviso')}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Tabela cabecalhos={['Item', t('produto.quantidade'), 'Valor unit.', 'Total']}>
            {(itens.data ?? []).map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2.5 font-semibold text-ink">{item.descricao}</td>
                <td className="px-3 py-2.5 tabular-nums">{Number(item.quantidade)}</td>
                <td className="px-3 py-2.5"><Dinheiro centavos={item.valor_unit} /></td>
                <td className="px-3 py-2.5 font-semibold"><Dinheiro centavos={item.valor_total} /></td>
              </tr>
            ))}
            <tr className="bg-surface-2/60">
              <td colSpan={3} className="px-3 py-2.5 text-right text-xs font-bold uppercase text-texto-2">
                {t('orcamento.total')}
              </td>
              <td className="px-3 py-2.5 text-base font-extrabold text-ink"><Dinheiro centavos={o.total} /></td>
            </tr>
          </Tabela>

          {snapshot && Array.isArray(snapshot.itens) && (
            <Cartao>
              <h2 className="mb-2 text-sm font-bold text-ink">{t('calculadora.itensCusto')} <Etiqueta>{t('orcamento.interno')}</Etiqueta></h2>
              <div className="divide-y divide-borda/70 text-sm">
                {snapshot.itens.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <span className="text-texto-2">{item.descricao}</span>
                    <Dinheiro centavos={item.total} className="font-semibold" />
                  </div>
                ))}
              </div>
            </Cartao>
          )}
        </div>

        <div className="space-y-3">
          {flag('ver_custos') && (
            <Cartao className="border-dashed">
              <p className="mb-2 text-[11px] font-bold uppercase text-texto-2">
                {t('orcamento.interno')} 🔒
              </p>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-texto-2">{t('orcamento.custoInterno')}</dt>
                  <dd className="font-semibold"><Dinheiro centavos={o.custo_total} /></dd></div>
                <div className="flex justify-between"><dt className="text-texto-2">{t('orcamento.lucroInterno')}</dt>
                  <dd className="font-semibold text-ok"><Dinheiro centavos={o.lucro_estimado} /></dd></div>
                <div className="flex justify-between"><dt className="text-texto-2">{t('orcamento.margemInterna')}</dt>
                  <dd className="font-semibold">{o.margem_estimada != null ? percentual(Number(o.margem_estimada), formato) : '•••'}</dd></div>
              </dl>
            </Cartao>
          )}
          <Cartao>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-texto-2">{t('orcamento.validade')}</dt>
                <dd>{dataCurta(o.validade, formato)}</dd></div>
              <div className="flex justify-between"><dt className="text-texto-2">Criado em</dt>
                <dd>{dataCurta(o.created_at, formato)}</dd></div>
            </dl>
          </Cartao>
        </div>
      </div>
    </div>
  );
}
