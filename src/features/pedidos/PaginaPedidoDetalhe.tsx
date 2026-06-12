/**
 * Tela do Pedido (/pedidos/:id) — o pedido como objeto de negócio: itens,
 * cliente, pagamento, entrega, ordens de produção vinculadas e recebimentos
 * do financeiro num só lugar. Ações de controle: marcar entregue, registrar
 * recebimento, cancelar. Leitura mascarada via v_pedido (custos sob ver_custos).
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { mensagemErro } from '@/lib/dados';
import { dataCurta, percentual } from '@/lib/formato';
import {
  Acordeao, BarraProgresso, Botao, Carregando, Cartao, Dinheiro, EstadoErro, Etiqueta,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { duracao } from '@/lib/formato';

const COR_STATUS_PED: Record<string, 'cinza' | 'azul' | 'amarelo' | 'verde' | 'vermelho'> = {
  criado: 'cinza', aprovado: 'azul', em_producao: 'amarelo', concluido: 'verde', cancelado: 'vermelho',
};
const COR_STATUS_OP: Record<string, 'cinza' | 'azul' | 'amarelo' | 'verde' | 'vermelho' | 'roxo'> = {
  aguardando_aprovacao: 'cinza', preparar: 'azul', imprimindo: 'amarelo',
  acabamento: 'roxo', concluido: 'verde', cancelado: 'vermelho',
};

interface PedidoDet {
  id: string; numero: string; status: string;
  cliente_id: string | null; cliente_snapshot: { nome?: string; cidade?: string; estado?: string } | null;
  canal_id: string | null; origem_orcamento_id: string | null;
  total: number; custo_estimado: number | null; custo_real: number | null;
  entrada: number; parcelas: number; frete_cobrado: number;
  data_prevista_recebimento: string | null; prazo_entrega: string | null;
  observacoes: string | null; aprovado_em: string | null; concluido_em: string | null;
  entregue_em: string | null; created_at: string;
}
interface ItemPed { id: string; descricao: string; quantidade: number; valor_unit: number; valor_total: number; custo_unit: number | null; }
interface OpPed { id: string; numero: string; status: string; quantidade: number; progresso_pct: number; tempo_estimado_min: number; }
interface LancPed { id: string; descricao: string; valor: number; vencimento: string; pago_em: string | null; status: string; tipo: string; }

export function PaginaPedidoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { ativa, pode, flag, formato } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [agindo, setAgindo] = useState(false);
  const [confirmaCancelar, setConfirmaCancelar] = useState(false);

  const ped = useQuery({
    queryKey: ['v_pedido', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_pedido').select('*').eq('id', id).single();
      if (error) throw error;
      return data as PedidoDet;
    },
  });
  const itens = useQuery({
    queryKey: ['v_pedido_item', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_pedido_item').select('*').eq('pedido_id', id).is('deleted_at', null);
      if (error) throw error;
      return data as ItemPed[];
    },
  });
  const ops = useQuery({
    queryKey: ['v_ordem_producao', 'pedido', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_ordem_producao')
        .select('id, numero, status, quantidade, progresso_pct, tempo_estimado_min')
        .eq('pedido_id', id).is('deleted_at', null).order('numero');
      if (error) throw error;
      return data as OpPed[];
    },
  });
  const recebimentos = useQuery({
    queryKey: ['lancamento', 'pedido', id],
    enabled: !!id && !!ativa && flag('ver_financeiro'),
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamento')
        .select('id, descricao, valor, vencimento, pago_em, status, tipo')
        .eq('origem_tipo', 'pedido').eq('origem_id', id).is('deleted_at', null).order('vencimento');
      if (error) throw error;
      return data as LancPed[];
    },
  });

  async function cancelar() {
    setAgindo(true); setErro(null);
    const { error } = await supabase.rpc('cancelar_pedido', { p_pedido: id });
    setAgindo(false); setConfirmaCancelar(false);
    if (error) setErro(mensagemErro(error));
    else qc.invalidateQueries();
  }
  async function marcarEntregue() {
    setAgindo(true); setErro(null);
    const { error } = await supabase.from('pedido').update({ entregue_em: new Date().toISOString() }).eq('id', id);
    setAgindo(false);
    if (error) setErro(mensagemErro(error));
    else { qc.invalidateQueries({ queryKey: ['v_pedido'] }); ped.refetch(); }
  }
  async function registrarRecebimento(l: LancPed) {
    setErro(null);
    const { error } = await supabase.from('lancamento')
      .update({ status: 'pago', pago_em: new Date().toISOString().slice(0, 10) }).eq('id', l.id);
    if (error) setErro(mensagemErro(error));
    else qc.invalidateQueries({ queryKey: ['lancamento'] });
  }

  if (ped.isLoading) return <Carregando />;
  if (ped.isError || !ped.data) return <EstadoErro onRetry={() => ped.refetch()} />;
  const p = ped.data;

  const recs = recebimentos.data ?? [];
  const recebido = recs.filter((l) => l.tipo === 'entrada' && l.status === 'pago').reduce((s, l) => s + Number(l.valor), 0);
  const aReceber = recs.filter((l) => l.tipo === 'entrada' && l.status !== 'pago' && l.status !== 'cancelado').reduce((s, l) => s + Number(l.valor), 0);
  const lucro = p.custo_estimado != null ? p.total - (p.custo_real ?? p.custo_estimado) : null;
  const margem = lucro != null && p.total > 0 ? lucro / p.total : null;
  const podeCancelar = !['concluido', 'cancelado'].includes(p.status) && pode('pedidos', 'editar');
  const subtotalItens = (itens.data ?? []).reduce((s, i) => s + Number(i.valor_total), 0);

  return (
    <div className="pb-20 lg:pb-0">
      <Link to="/pedidos" className="mb-2 inline-block text-xs font-bold text-brand-azul hover:underline">
        ← {t('pedido.titulo')}
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-extrabold tracking-tight text-ink">{t('pedidoDet.titulo')} {p.numero}</h1>
          <Etiqueta cor={COR_STATUS_PED[p.status] ?? 'cinza'}>{t(`pedido.statusLabel.${p.status}`)}</Etiqueta>
          {p.entregue_em && <Etiqueta cor="verde">✓ {t('pedidoDet.entregue')}</Etiqueta>}
        </div>
        <p className="text-xs text-texto-2">{t('orcamento.criadoEm')} {dataCurta(p.created_at, formato)}</p>
      </div>

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {/* cliente + origem */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Cartao>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('orcamento.dadosCliente')}</p>
              <p className="text-sm font-bold text-ink">{p.cliente_snapshot?.nome ?? t('pedidoDet.semCliente')}</p>
              {(p.cliente_snapshot?.cidade || p.cliente_snapshot?.estado) && (
                <p className="text-xs text-texto-2">{[p.cliente_snapshot?.cidade, p.cliente_snapshot?.estado].filter(Boolean).join(' · ')}</p>
              )}
            </Cartao>
            <Cartao>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('pedidoDet.origem')}</p>
              {p.origem_orcamento_id ? (
                <Link to={`/orcamentos/${p.origem_orcamento_id}`} className="text-sm font-bold text-brand-azul hover:underline">
                  {t('pedidoDet.deOrcamento')} →
                </Link>
              ) : (
                <p className="text-sm font-bold text-ink">{t('pedidoDet.vendaDireta')}</p>
              )}
            </Cartao>
          </div>

          {/* itens */}
          <div className="overflow-x-auto rounded-xl border border-borda bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda bg-surface-2/60 text-left">
                  {['Item', t('produto.quantidade'), 'Valor unit.', 'Total'].map((c, i) => (
                    <th key={i} className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-texto-2 ${i >= 2 ? 'text-right' : ''}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda/70">
                {(itens.data ?? []).map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2.5 font-semibold text-ink">{i.descricao}</td>
                    <td className="px-3 py-2.5 tabular-nums">{Number(i.quantidade)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums"><Dinheiro centavos={i.valor_unit} /></td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums"><Dinheiro centavos={i.valor_total} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ordens de produção vinculadas */}
          <div>
            <h2 className="mb-2 text-sm font-bold text-ink">{t('pedidoDet.producao')} ({(ops.data ?? []).length})</h2>
            {(ops.data ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-borda py-6 text-center text-xs text-texto-2">{t('pedidoDet.semOps')}</p>
            ) : (
              <div className="space-y-2">
                {(ops.data ?? []).map((o) => (
                  <Link key={o.id} to={`/producao/${o.id}`}
                    className="flex items-center gap-3 rounded-xl border border-borda bg-white p-3 transition-colors hover:border-brand-azul">
                    <span className="font-bold text-ink">{o.numero}</span>
                    <Etiqueta cor={COR_STATUS_OP[o.status] ?? 'cinza'}>{t(`pedido.opStatus.${o.status}`)}</Etiqueta>
                    <span className="text-xs text-texto-2">{Number(o.quantidade)}× · {duracao(o.tempo_estimado_min)}</span>
                    <div className="ml-auto w-24"><BarraProgresso pct={Number(o.progresso_pct)} /></div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {p.observacoes && (
            <Acordeao titulo={t('orcamento.observacoes')}>
              <p className="text-sm text-texto-2">{p.observacoes}</p>
            </Acordeao>
          )}
        </div>

        {/* painel lateral: interno + total + entrega + recebimentos + ações */}
        <div className="space-y-3 lg:sticky lg:top-16 lg:h-fit">
          {flag('ver_custos') && lucro != null && (
            <Acordeao abertoInicial titulo={<span>{t('orcamento.resumoInterno')} <Etiqueta>🔒 {t('orcamento.interno')}</Etiqueta></span>}>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-texto-2">{t('orcamento.custoInterno')}</dt>
                  <dd className="font-semibold tabular-nums"><Dinheiro centavos={p.custo_real ?? p.custo_estimado} /></dd></div>
                <div className="flex justify-between"><dt className="text-texto-2">{t('orcamento.lucroInterno')}</dt>
                  <dd className="font-semibold tabular-nums text-ok"><Dinheiro centavos={lucro} /></dd></div>
                <div className="flex justify-between"><dt className="text-texto-2">{t('orcamento.margemInterna')}</dt>
                  <dd className="font-semibold tabular-nums">{margem != null ? percentual(margem, formato) : '•••'}</dd></div>
              </dl>
            </Acordeao>
          )}

          {/* total grande + composição do valor */}
          <div className="rounded-xl bg-ink p-4 text-white">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">{t('pedido.total')}</p>
            <p className="text-3xl font-extrabold tabular-nums"><Dinheiro centavos={p.total} /></p>
            <dl className="mt-2 space-y-0.5 text-xs text-white/70">
              <div className="flex justify-between"><dt>{t('novoPedido.subtotal')}</dt><dd className="tabular-nums"><Dinheiro centavos={subtotalItens} /></dd></div>
              {p.frete_cobrado > 0 && <div className="flex justify-between"><dt>{t('novoPedido.frete')}</dt><dd className="tabular-nums"><Dinheiro centavos={p.frete_cobrado} /></dd></div>}
              {p.entrada > 0 && <div className="flex justify-between"><dt>{t('novoPedido.entrada')}</dt><dd className="tabular-nums"><Dinheiro centavos={p.entrada} /></dd></div>}
              {p.parcelas > 1 && <div className="flex justify-between"><dt>{t('novoPedido.parcelas')}</dt><dd className="tabular-nums">{p.parcelas}×</dd></div>}
            </dl>
          </div>

          {/* entrega */}
          <Cartao>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('pedidoDet.entrega')}</p>
            <dl className="space-y-1 text-xs">
              {p.prazo_entrega && <div className="flex justify-between"><dt className="text-texto-2">{t('novoPedido.prazoEntrega')}</dt><dd className="font-semibold text-ink">{dataCurta(p.prazo_entrega, formato)}</dd></div>}
              {p.data_prevista_recebimento && <div className="flex justify-between"><dt className="text-texto-2">{t('novoPedido.dataRecebimento')}</dt><dd className="font-semibold text-ink">{dataCurta(p.data_prevista_recebimento, formato)}</dd></div>}
              <div className="flex justify-between"><dt className="text-texto-2">{t('pedidoDet.statusEntrega')}</dt>
                <dd className="font-semibold text-ink">{p.entregue_em ? `${t('pedidoDet.entregue')} ${dataCurta(p.entregue_em, formato)}` : t('pedidoDet.pendente')}</dd></div>
            </dl>
            {!p.entregue_em && p.status === 'concluido' && pode('pedidos', 'editar') && (
              <Botao variante="acento" className="mt-2 w-full !py-1.5 !text-xs" disabled={agindo} onClick={marcarEntregue}>
                ✓ {t('pedidoDet.marcarEntregue')}
              </Botao>
            )}
          </Cartao>

          {/* recebimentos (financeiro) */}
          {flag('ver_financeiro') && (
            <Cartao>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('pedidoDet.recebimentos')}</p>
                <Link to="/financeiro" className="text-[11px] font-bold text-brand-azul hover:underline">{t('pedidoDet.verFinanceiro')}</Link>
              </div>
              {recs.length === 0 ? (
                <p className="py-2 text-center text-xs text-texto-2">{t('pedidoDet.semRecebimentos')}</p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {recs.filter((l) => l.tipo === 'entrada').map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0">
                          <span className="block text-texto-2">{dataCurta(l.vencimento, formato)}</span>
                          <Dinheiro centavos={l.valor} className="font-semibold text-ink" />
                        </span>
                        {l.status === 'pago' ? (
                          <Etiqueta cor="verde">{t('financeiro.statusLabel.pago')}</Etiqueta>
                        ) : pode('financeiro', 'editar') ? (
                          <Botao variante="secundario" className="!px-2 !py-1 !text-[11px]" onClick={() => registrarRecebimento(l)}>
                            {t('pedidoDet.registrarRecebimento')}
                          </Botao>
                        ) : <Etiqueta cor="amarelo">{t('financeiro.statusLabel.pendente')}</Etiqueta>}
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-2 space-y-0.5 border-t border-borda pt-2 text-xs">
                    <div className="flex justify-between"><dt className="text-texto-2">{t('pedidoDet.recebido')}</dt><dd className="font-bold text-ok"><Dinheiro centavos={recebido} /></dd></div>
                    {aReceber > 0 && <div className="flex justify-between"><dt className="text-texto-2">{t('financeiro.aReceber')}</dt><dd className="font-bold text-alerta"><Dinheiro centavos={aReceber} /></dd></div>}
                  </dl>
                </>
              )}
            </Cartao>
          )}

          {podeCancelar && (
            confirmaCancelar ? (
              <Cartao className="!border-erro/40 !bg-erro/5">
                <p className="mb-2 text-xs font-semibold text-ink">{t('pedidoDet.confirmaCancelar')}</p>
                <div className="flex gap-2">
                  <Botao variante="secundario" className="flex-1 !py-1.5 !text-xs" onClick={() => setConfirmaCancelar(false)}>{t('acoes.cancelar')}</Botao>
                  <Botao variante="perigo" className="flex-1 !py-1.5 !text-xs" disabled={agindo} onClick={cancelar}>{t('acoes.confirmar')}</Botao>
                </div>
              </Cartao>
            ) : (
              <Botao variante="perigo" className="w-full" onClick={() => setConfirmaCancelar(true)}>{t('pedido.cancelarPedido')}</Botao>
            )
          )}
        </div>
      </div>
    </div>
  );
}
