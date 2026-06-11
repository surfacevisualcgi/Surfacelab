/**
 * Tela 10 — Pedidos & Produção: kanban de OPs (mover via RPC, que cuida da
 * baixa de estoque no momento configurado) + lista de pedidos + registrar
 * falha (modal 08) + estimado × real.
 */
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { duracao } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Dinheiro, Entrada, EstadoErro,
  EstadoVazio, Etiqueta, Modal, Selecao, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

interface PedidoView {
  id: string; numero: string; status: string;
  cliente_snapshot: { nome?: string } | null;
  total: number; prazo_entrega: string | null; created_at: string;
}

interface OpView {
  id: string; numero: string; pedido_id: string | null; produto_id: string | null;
  quantidade: number; status: string; prazo: string | null;
  tempo_estimado_min: number; tempo_real_min: number | null;
  material_estimado_g: number; material_real_g: number | null;
  custo_estimado: number | null; custo_real: number | null;
  progresso_pct: number;
}

const COLUNAS_KANBAN = ['aguardando_aprovacao', 'preparar', 'imprimindo', 'acabamento', 'concluido'] as const;

const COR_STATUS_PED: Record<string, 'cinza' | 'azul' | 'amarelo' | 'verde' | 'vermelho'> = {
  criado: 'cinza', aprovado: 'azul', em_producao: 'amarelo',
  concluido: 'verde', cancelado: 'vermelho',
};

export function PaginaPedidos() {
  const { t } = useTranslation();
  const { pode, flag } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState<'kanban' | 'lista'>('kanban');
  const [falhaOp, setFalhaOp] = useState<OpView | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const pedidos = useLista<PedidoView>('v_pedido', { ordem: 'created_at', desc: true });
  const ops = useLista<OpView>('v_ordem_producao', { ordem: 'created_at', desc: false });
  const materiais = useLista<{ id: string; nome: string }>('material', { ordem: 'nome', desc: false });

  async function mover(op: OpView, status: string) {
    setErro(null);
    const { error } = await supabase.rpc('mover_ordem_producao', { p_op: op.id, p_status: status });
    if (error) setErro(mensagemErro(error));
    qc.invalidateQueries({ queryKey: ['v_ordem_producao'] });
    qc.invalidateQueries({ queryKey: ['v_pedido'] });
    qc.invalidateQueries({ queryKey: ['material'] });
  }

  async function cancelarPedido(id: string) {
    setErro(null);
    const { error } = await supabase.rpc('cancelar_pedido', { p_pedido: id });
    if (error) setErro(mensagemErro(error));
    qc.invalidateQueries();
  }

  async function registrarFalha(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!falhaOp) return;
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.rpc('registrar_falha', {
      p_op: falhaOp.id,
      p_motivo: f.get('motivo') as string,
      p_etapa: (f.get('etapa') as string) || null,
      p_material: (f.get('material_id') as string) || null,
      p_desperdicio_g: Number(f.get('desperdicio_g') || 0),
      p_tempo_perdido_min: Number(f.get('tempo_perdido_min') || 0),
      p_reimprimir: f.get('reimprimir') === 'on',
    });
    if (error) setErro(mensagemErro(error));
    else {
      setFalhaOp(null);
      qc.invalidateQueries();
    }
  }

  if (pedidos.isLoading || ops.isLoading) return <Carregando />;
  if (pedidos.isError) return <EstadoErro onRetry={() => pedidos.refetch()} />;

  return (
    <div>
      <CabecalhoPagina titulo={t('pedido.titulo')} />
      <div className="mb-4 flex gap-1 border-b border-borda">
        {(['kanban', 'lista'] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
              aba === a ? 'border-brand-roxo text-ink' : 'border-transparent text-texto-2 hover:text-ink'}`}>
            {a === 'kanban' ? t('pedido.kanban') : t('pedido.lista')}
          </button>
        ))}
      </div>

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      {aba === 'kanban' && (
        (ops.data ?? []).filter((o) => o.status !== 'cancelado').length === 0 ? (
          <EstadoVazio mensagem={t('estados.vazio')} />
        ) : (
          <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
            {COLUNAS_KANBAN.map((coluna) => {
              const cartoes = (ops.data ?? []).filter((o) => o.status === coluna);
              return (
                <div key={coluna} className="min-w-44 rounded-xl bg-surface-2 p-2">
                  <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-texto-2">
                    {t(`pedido.opStatus.${coluna}`)} <span className="text-texto-2/60">({cartoes.length})</span>
                  </p>
                  <div className="space-y-2">
                    {cartoes.map((op) => {
                      const idx = COLUNAS_KANBAN.indexOf(op.status as typeof COLUNAS_KANBAN[number]);
                      const proxima = idx >= 0 && idx < COLUNAS_KANBAN.length - 1 ? COLUNAS_KANBAN[idx + 1] : null;
                      return (
                        <div key={op.id} className="rounded-lg border border-borda bg-white p-2.5 text-xs shadow-sm">
                          <p className="font-bold text-ink">{op.numero}</p>
                          <p className="mt-0.5 text-texto-2">
                            {Number(op.quantidade)}× · {duracao(op.tempo_estimado_min)}
                          </p>
                          {coluna === 'concluido' && flag('ver_custos') && op.custo_real != null && (
                            <p className="mt-1">
                              <span className="text-texto-2">{t('pedido.custo')}: </span>
                              <Dinheiro centavos={op.custo_real} className={
                                op.custo_estimado != null && op.custo_real > op.custo_estimado
                                  ? 'font-bold text-erro' : 'font-bold text-ok'} />
                            </p>
                          )}
                          {pode('producao', 'editar') && coluna !== 'concluido' && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {proxima && (
                                <Botao variante="secundario" className="!px-2 !py-1 !text-[11px]"
                                  onClick={() => mover(op, proxima)}>
                                  → {t(`pedido.opStatus.${proxima}`)}
                                </Botao>
                              )}
                              <Botao variante="fantasma" className="!px-2 !py-1 !text-[11px]"
                                onClick={() => setFalhaOp(op)}>
                                ⚠ {t('pedido.registrarFalha')}
                              </Botao>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {aba === 'lista' && (
        (pedidos.data ?? []).length === 0 ? (
          <EstadoVazio />
        ) : (
          <Tabela cabecalhos={[t('pedido.numero'), t('pedido.cliente'), t('pedido.total'), t('orcamento.status'), '']}>
            {pedidos.data!.map((p) => (
              <tr key={p.id} className="hover:bg-surface-2/50">
                <td className="px-3 py-2.5 font-bold text-ink">{p.numero}</td>
                <td className="px-3 py-2.5">{p.cliente_snapshot?.nome ?? '—'}</td>
                <td className="px-3 py-2.5 font-semibold"><Dinheiro centavos={p.total} /></td>
                <td className="px-3 py-2.5">
                  <Etiqueta cor={COR_STATUS_PED[p.status] ?? 'cinza'}>{t(`pedido.statusLabel.${p.status}`)}</Etiqueta>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {!['concluido', 'cancelado'].includes(p.status) && pode('pedidos', 'editar') && (
                    <Botao variante="perigo" onClick={() => cancelarPedido(p.id)}>
                      {t('pedido.cancelarPedido')}
                    </Botao>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
        )
      )}

      <Modal aberto={!!falhaOp} titulo={`${t('pedido.registrarFalha')} — ${falhaOp?.numero ?? ''}`} onFechar={() => setFalhaOp(null)}>
        <form onSubmit={registrarFalha} className="space-y-3">
          <Campo rotulo="Motivo">
            <Entrada name="motivo" required placeholder="Ex.: descolou da mesa na camada 40" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Etapa">
              <Entrada name="etapa" placeholder="impressão / acabamento…" />
            </Campo>
            <Campo rotulo="Material desperdiçado">
              <Selecao name="material_id" defaultValue="">
                <option value="">—</option>
                {(materiais.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Desperdício (g/ml)">
              <Entrada name="desperdicio_g" type="number" min="0" step="any" defaultValue={0} />
            </Campo>
            <Campo rotulo="Tempo perdido (min)">
              <Entrada name="tempo_perdido_min" type="number" min="0" defaultValue={0} />
            </Campo>
          </div>
          <label className="flex items-center gap-2 text-sm text-texto">
            <input type="checkbox" name="reimprimir" className="accent-brand-azul" />
            Reimprimir a peça
          </label>
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setFalhaOp(null)}>{t('acoes.cancelar')}</Botao>
            <Botao type="submit">{t('acoes.confirmar')}</Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}
