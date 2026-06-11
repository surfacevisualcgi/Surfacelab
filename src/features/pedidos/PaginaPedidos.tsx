/**
 * Tela 10 — Pedidos & Produção (estrutura v2): kanban com cards enxutos
 * (nº + cliente + barra de progresso + chips), contador por coluna; no
 * MOBILE as colunas viram abas roláveis. Lista de pedidos na 2ª aba.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { duracao } from '@/lib/formato';
import {
  Abas, BarraProgresso, Botao, CabecalhoPagina, Carregando, Dinheiro,
  EstadoErro, EstadoVazio, Etiqueta, TabelaDados,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { ModalFalha } from './ModalFalha';

interface PedidoView {
  id: string; numero: string; status: string;
  cliente_snapshot: { nome?: string } | null;
  total: number; prazo_entrega: string | null; created_at: string;
}

interface OpView {
  id: string; numero: string; pedido_id: string | null; produto_id: string | null;
  quantidade: number; status: string; prazo: string | null;
  tempo_estimado_min: number; progresso_pct: number;
  custo_estimado: number | null; custo_real: number | null;
  pedido: { numero: string; cliente_snapshot: { nome?: string } | null } | null;
}

const COLUNAS_KANBAN = ['aguardando_aprovacao', 'preparar', 'imprimindo', 'acabamento', 'concluido'] as const;
type Coluna = (typeof COLUNAS_KANBAN)[number];

const COR_STATUS_PED: Record<string, 'cinza' | 'azul' | 'amarelo' | 'verde' | 'vermelho'> = {
  criado: 'cinza', aprovado: 'azul', em_producao: 'amarelo',
  concluido: 'verde', cancelado: 'vermelho',
};

export function PaginaPedidos() {
  const { t } = useTranslation();
  const { pode, flag } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState<'kanban' | 'lista'>('kanban');
  const [colunaMobile, setColunaMobile] = useState<Coluna>('aguardando_aprovacao');
  const [falhaOp, setFalhaOp] = useState<{ id: string; numero: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const pedidos = useLista<PedidoView>('v_pedido', { ordem: 'created_at', desc: true });
  const ops = useLista<OpView>('v_ordem_producao', {
    ordem: 'created_at', desc: false,
    selecao: '*, pedido:pedido_id (numero, cliente_snapshot)',
  });

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

  if (pedidos.isLoading || ops.isLoading) return <Carregando />;
  if (pedidos.isError) return <EstadoErro onRetry={() => pedidos.refetch()} />;

  const cartoesDe = (coluna: Coluna) =>
    (ops.data ?? []).filter((o) => o.status === coluna);

  function CartaoOp({ op }: { op: OpView }) {
    const idx = COLUNAS_KANBAN.indexOf(op.status as Coluna);
    const proxima = idx >= 0 && idx < COLUNAS_KANBAN.length - 1 ? COLUNAS_KANBAN[idx + 1] : null;
    return (
      <div className="rounded-lg border border-borda bg-white p-2.5 text-xs shadow-sm">
        <div className="flex items-start justify-between gap-1">
          <Link to={`/producao/${op.id}`} className="font-bold text-ink hover:text-brand-azul">
            {op.numero}
          </Link>
          <span className="text-[10px] text-texto-2">{Number(op.quantidade)}×</span>
        </div>
        <p className="mt-0.5 truncate text-texto-2">
          {op.pedido?.cliente_snapshot?.nome ?? op.pedido?.numero ?? '—'} · {duracao(op.tempo_estimado_min)}
        </p>
        <BarraProgresso pct={Number(op.progresso_pct)} className="mt-2" />
        {op.status === 'concluido' && flag('ver_custos') && op.custo_real != null && (
          <p className="mt-1.5">
            <span className="text-texto-2">{t('pedido.custo')}: </span>
            <Dinheiro centavos={op.custo_real} className={
              op.custo_estimado != null && op.custo_real > op.custo_estimado
                ? 'font-bold text-erro' : 'font-bold text-ok'} />
          </p>
        )}
        {pode('producao', 'editar') && op.status !== 'concluido' && op.status !== 'cancelado' && (
          <div className="mt-2 flex flex-wrap gap-1">
            {proxima && (
              <Botao variante="secundario" className="!px-2 !py-1 !text-[11px]"
                onClick={() => mover(op, proxima)}>
                → {t(`pedido.opStatus.${proxima}`)}
              </Botao>
            )}
            <Botao variante="fantasma" className="!px-2 !py-1 !text-[11px]"
              onClick={() => setFalhaOp({ id: op.id, numero: op.numero })}>
              ⚠
            </Botao>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <CabecalhoPagina titulo={t('pedido.titulo')} />
      <Abas
        abas={[
          { id: 'kanban' as const, rotulo: t('pedido.kanban') },
          { id: 'lista' as const, rotulo: t('pedido.lista') },
        ]}
        ativa={aba}
        onTrocar={setAba}
      />

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      {aba === 'kanban' && (
        (ops.data ?? []).filter((o) => o.status !== 'cancelado').length === 0 ? (
          <EstadoVazio mensagem={t('estados.vazio')} />
        ) : (
          <>
            {/* mobile: colunas viram abas roláveis com contador (v2) */}
            <div className="md:hidden">
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
                {COLUNAS_KANBAN.map((coluna) => (
                  <button key={coluna} onClick={() => setColunaMobile(coluna)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                      colunaMobile === coluna ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2'
                    }`}>
                    {t(`pedido.opStatus.${coluna}`)} ({cartoesDe(coluna).length})
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {cartoesDe(colunaMobile).length === 0 ? (
                  <p className="py-8 text-center text-xs text-texto-2">{t('estados.vazio')}</p>
                ) : (
                  cartoesDe(colunaMobile).map((op) => <CartaoOp key={op.id} op={op} />)
                )}
              </div>
            </div>

            {/* desktop: kanban de 5 colunas */}
            <div className="hidden gap-3 md:grid md:grid-cols-5">
              {COLUNAS_KANBAN.map((coluna) => {
                const cartoes = cartoesDe(coluna);
                return (
                  <div key={coluna} className="rounded-xl bg-surface-2 p-2">
                    <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-texto-2">
                      {t(`pedido.opStatus.${coluna}`)} <span className="text-texto-2/60">({cartoes.length})</span>
                    </p>
                    <div className="space-y-2">
                      {cartoes.map((op) => <CartaoOp key={op.id} op={op} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )
      )}

      {aba === 'lista' && (
        (pedidos.data ?? []).length === 0 ? (
          <EstadoVazio />
        ) : (
          <TabelaDados<PedidoView>
            colunas={[
              { titulo: t('pedido.numero'), principal: true, render: (p) => <span className="font-bold text-ink">{p.numero}</span> },
              { titulo: t('pedido.cliente'), render: (p) => p.cliente_snapshot?.nome ?? '—' },
              { titulo: t('pedido.total'), numerica: true, render: (p) => <span className="font-semibold"><Dinheiro centavos={p.total} /></span> },
              {
                titulo: t('orcamento.status'),
                render: (p) => (
                  <Etiqueta cor={COR_STATUS_PED[p.status] ?? 'cinza'}>{t(`pedido.statusLabel.${p.status}`)}</Etiqueta>
                ),
              },
            ]}
            linhas={pedidos.data!}
            chave={(p) => p.id}
            acoes={(p) =>
              !['concluido', 'cancelado'].includes(p.status) && pode('pedidos', 'editar') ? (
                <Botao variante="perigo" onClick={() => cancelarPedido(p.id)}>
                  {t('pedido.cancelarPedido')}
                </Botao>
              ) : null
            }
          />
        )
      )}

      <ModalFalha
        op={falhaOp}
        onFechar={() => setFalhaOp(null)}
        onSucesso={() => { setFalhaOp(null); qc.invalidateQueries(); }}
      />
    </div>
  );
}
