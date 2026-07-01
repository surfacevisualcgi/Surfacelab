/**
 * Novo Pedido MANUAL em stepper (P1 ⭐ do plano): Cliente → Itens →
 * Pagamento & entrega → Revisão, com RESUMO AO VIVO em todos os passos.
 * Venda direta (WhatsApp, balcão, feira) que não passou por orçamento.
 * A gravação é a RPC `criar_pedido_manual` (servidor manda nos custos,
 * reserva estoque, gera OPs e o contas a receber).
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, moeda, paraCentavos } from '@/lib/formato';
import { Botao, Campo, Entrada, EntradaDinheiro, Modal, Selecao } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

interface ClienteRef { id: string; nome: string; anonimizado: boolean }
interface CanalRef { id: string; nome: string }
interface ProdutoRef {
  id: string; nome: string; preco_praticado: number;
  preco_sugerido: number | null; disponibilidade: string;
}

interface ItemPedido {
  avulso: boolean;      // sem produto cadastrado (serviço, taxa…) — não gera OP
  produto_id: string;
  descricao: string;    // obrigatório no avulso
  quantidade: number;
  preco: string;        // texto editável em reais ("12,50")
}

interface Pagamento {
  entrada: string;
  parcelas: number;
  data_recebimento: string;
  prazo_entrega: string;
  frete: string;
  observacoes: string;
}

const PAGAMENTO_VAZIO: Pagamento = {
  entrada: '', parcelas: 1, data_recebimento: '', prazo_entrega: '',
  frete: '', observacoes: '',
};

export function ModalNovoPedido({ aberto, onFechar, onCriado }: {
  aberto: boolean;
  onFechar: () => void;
  onCriado?: (pedidoId: string) => void;
}) {
  const { t } = useTranslation();
  const { formato } = useAuth();
  const qc = useQueryClient();

  const clientes = useLista<ClienteRef>('v_cliente', { ordem: 'nome', desc: false });
  const canais = useLista<CanalRef>('canal_venda', { ordem: 'nome', desc: false });
  const produtos = useLista<ProdutoRef>('v_produto', { ordem: 'nome', desc: false });

  const [passo, setPasso] = useState(0);
  const [clienteId, setClienteId] = useState('');
  const [canalId, setCanalId] = useState('');
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [pag, setPag] = useState<Pagamento>(PAGAMENTO_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const passos = [
    t('novoPedido.passoCliente'), t('novoPedido.passoItens'),
    t('novoPedido.passoPagamento'), t('novoPedido.passoRevisao'),
  ];

  // ---------- resumo ao vivo (recalculado a cada digitação) ----------
  const resumo = useMemo(() => {
    const subtotal = itens.reduce(
      (s, it) => s + Math.round(paraCentavos(it.preco) * (it.quantidade || 0)), 0);
    const frete = paraCentavos(pag.frete || '0');
    const total = subtotal + frete;
    const entrada = paraCentavos(pag.entrada || '0');
    return {
      subtotal, frete, total, entrada,
      saldo: Math.max(0, total - entrada),
      comProducao: itens.filter((it) => it.produto_id).length,
    };
  }, [itens, pag.frete, pag.entrada]);

  function fechar() {
    setPasso(0); setClienteId(''); setCanalId(''); setItens([]);
    setPag(PAGAMENTO_VAZIO); setErro(null); onFechar();
  }

  /** preço default ao escolher um produto: praticado → sugerido → vazio */
  function precoDoProduto(produtoId: string): string {
    const p = (produtos.data ?? []).find((x) => x.id === produtoId);
    if (!p) return '';
    const c = p.preco_praticado > 0 ? p.preco_praticado : (p.preco_sugerido ?? 0);
    return c > 0 ? deCentavos(c) : '';
  }

  function setItem(i: number, mudancas: Partial<ItemPedido>) {
    setItens(itens.map((it, j) => (j === i ? { ...it, ...mudancas } : it)));
  }

  function validarPasso(): string | null {
    if (passo === 1) {
      if (itens.length === 0) return t('novoPedido.semItens');
      for (const it of itens) {
        if (it.avulso ? !it.descricao.trim() : !it.produto_id) return t('novoPedido.semItens');
        if (!it.quantidade || it.quantidade <= 0) return t('novoPedido.semItens');
      }
    }
    if (passo === 2 && resumo.entrada > resumo.total) {
      return t('novoPedido.entradaMaiorQueTotal');
    }
    return null;
  }

  function avancar() {
    const e = validarPasso();
    if (e) { setErro(e); return; }
    setErro(null);
    setPasso((p) => Math.min(3, p + 1));
  }

  async function finalizar() {
    setSalvando(true);
    setErro(null);
    try {
      const { data, error } = await supabase.rpc('criar_pedido_manual', {
        p_itens: itens.map((it) => ({
          produto_id: it.produto_id || null,
          descricao: it.descricao.trim() || null,
          quantidade: it.quantidade,
          valor_unit: paraCentavos(it.preco || '0'),
        })),
        p_cliente: clienteId || null,
        p_canal: canalId || null,
        p_entrada: resumo.entrada,
        p_parcelas: pag.parcelas || 1,
        p_prazo_entrega: pag.prazo_entrega || null,
        p_frete_cobrado: resumo.frete,
        p_data_prevista_recebimento: pag.data_recebimento || null,
        p_observacoes: pag.observacoes.trim() || null,
      });
      if (error) throw error;
      // o pedido mexe em produção, estoque e financeiro — sincroniza tudo
      qc.invalidateQueries({ queryKey: ['v_pedido'] });
      qc.invalidateQueries({ queryKey: ['v_ordem_producao'] });
      qc.invalidateQueries({ queryKey: ['material'] });
      qc.invalidateQueries({ queryKey: ['lancamento'] });
      const id = data as string;
      fechar();
      onCriado?.(id);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const nomeCliente = clienteId
    ? (clientes.data ?? []).find((c) => c.id === clienteId)?.nome ?? '—'
    : t('novoPedido.semCliente');

  return (
    <Modal aberto={aberto} titulo={t('novoPedido.titulo')} onFechar={fechar} largura="max-w-2xl">
      {/* indicador de passos (mesmo padrão do Novo Produto) */}
      <div className="mb-4 flex items-center gap-1">
        {passos.map((nome, i) => (
          <div key={i} className="flex flex-1 items-center gap-1">
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              i < passo ? 'bg-ok text-white' : i === passo ? 'grad-acento text-white' : 'bg-surface-2 text-texto-2'
            }`}>{i < passo ? '✓' : i + 1}</span>
            <span className={`truncate text-[11px] font-semibold ${i === passo ? 'text-ink' : 'text-texto-2'}`}>{nome}</span>
            {i < passos.length - 1 && <span className="h-px flex-1 bg-borda" />}
          </div>
        ))}
      </div>

      {/* ---------------- passo 0: cliente & canal ---------------- */}
      {passo === 0 && (
        <div className="space-y-3">
          <Campo rotulo={t('pedido.cliente')} dica={t('novoPedido.clienteDica')}>
            <Selecao value={clienteId} onChange={(e) => setClienteId(e.target.value)} autoFocus>
              <option value="">{t('novoPedido.semCliente')}</option>
              {(clientes.data ?? []).filter((c) => !c.anonimizado).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo={t('novoPedido.canal')}>
            <Selecao value={canalId} onChange={(e) => setCanalId(e.target.value)}>
              <option value="">—</option>
              {(canais.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </Campo>
        </div>
      )}

      {/* ---------------- passo 1: itens ---------------- */}
      {passo === 1 && (
        <div className="space-y-2">
          {itens.map((it, i) => {
            const totalLinha = Math.round(paraCentavos(it.preco) * (it.quantidade || 0));
            return (
              <div key={i} className="rounded-xl border border-borda p-2.5">
                <div className="grid grid-cols-[1fr_64px_96px_32px] items-end gap-2">
                  {!it.avulso ? (
                    <Campo rotulo={t('novoPedido.produto')}>
                      <Selecao value={it.produto_id}
                        onChange={(e) => setItem(i, {
                          produto_id: e.target.value,
                          descricao: '',
                          preco: precoDoProduto(e.target.value),
                        })}>
                        <option value="">—</option>
                        {(produtos.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                      </Selecao>
                    </Campo>
                  ) : (
                    <Campo rotulo={t('novoPedido.descricaoAvulsa')}>
                      <Entrada value={it.descricao} autoFocus
                        placeholder="Ex.: pintura personalizada, taxa de arte…"
                        onChange={(e) => setItem(i, { descricao: e.target.value })} />
                    </Campo>
                  )}
                  <Campo rotulo={t('produto.quantidade')}>
                    <Entrada type="number" min="1" step="any" value={it.quantidade || ''}
                      onChange={(e) => setItem(i, { quantidade: Number(e.target.value) })} />
                  </Campo>
                  <Campo rotulo={t('novoPedido.precoUnit')}>
                    <EntradaDinheiro value={it.preco}
                      onChange={(e) => setItem(i, { preco: e.target.value })} />
                  </Campo>
                  <button type="button" aria-label={t('acoes.excluir')}
                    className="pb-2.5 text-texto-2 hover:text-erro"
                    onClick={() => setItens(itens.filter((_, j) => j !== i))}>✕</button>
                </div>
                <p className="mt-1 text-right text-[11px] font-semibold tabular-nums text-texto-2">
                  = {moeda(totalLinha, formato)}
                </p>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Botao type="button" variante="secundario" className="!px-2.5 !py-1.5 !text-xs"
              onClick={() => setItens([...itens, { avulso: false, produto_id: '', descricao: '', quantidade: 1, preco: '' }])}>
              + {t('novoPedido.addProduto')}
            </Botao>
            <Botao type="button" variante="fantasma" className="!px-2.5 !py-1.5 !text-xs"
              onClick={() => setItens([...itens, { avulso: true, produto_id: '', descricao: '', quantidade: 1, preco: '' }])}>
              + {t('novoPedido.addAvulso')}
            </Botao>
          </div>
          <p className="text-[11px] text-texto-2">{t('novoPedido.avulsoDica')}</p>
        </div>
      )}

      {/* ---------------- passo 2: pagamento & entrega ---------------- */}
      {passo === 2 && (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={t('novoPedido.entrada')} dica={t('novoPedido.entradaDica')}>
            <EntradaDinheiro value={pag.entrada}
              onChange={(e) => setPag({ ...pag, entrada: e.target.value })} />
          </Campo>
          <Campo rotulo={t('novoPedido.parcelas')}>
            <Selecao value={pag.parcelas}
              onChange={(e) => setPag({ ...pag, parcelas: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
                <option key={n} value={n}>{n === 1 ? 'À vista (1×)' : `${n}×`}</option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo={t('novoPedido.dataRecebimento')}>
            <Entrada type="date" value={pag.data_recebimento}
              onChange={(e) => setPag({ ...pag, data_recebimento: e.target.value })} />
          </Campo>
          <Campo rotulo={t('novoPedido.prazoEntrega')}>
            <Entrada type="date" value={pag.prazo_entrega}
              onChange={(e) => setPag({ ...pag, prazo_entrega: e.target.value })} />
          </Campo>
          <Campo rotulo={t('novoPedido.freteCobrado')}>
            <EntradaDinheiro value={pag.frete}
              onChange={(e) => setPag({ ...pag, frete: e.target.value })} />
          </Campo>
          <Campo rotulo={t('novoPedido.observacoes')} className="col-span-2">
            <textarea value={pag.observacoes} rows={2}
              onChange={(e) => setPag({ ...pag, observacoes: e.target.value })}
              className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
          </Campo>
        </div>
      )}

      {/* ---------------- passo 3: revisão ---------------- */}
      {passo === 3 && (
        <div className="space-y-2 text-sm">
          <ResumoLinha rotulo={t('pedido.cliente')} valor={nomeCliente} />
          <ResumoLinha rotulo={t('novoPedido.passoItens')}
            valor={t('novoPedido.itensResumo', { n: itens.length, ops: resumo.comProducao })} />
          {itens.map((it, i) => (
            <p key={i} className="pl-2 text-xs text-texto-2">
              {it.quantidade}× {it.produto_id
                ? (produtos.data ?? []).find((p) => p.id === it.produto_id)?.nome
                : it.descricao}
              {' — '}{moeda(Math.round(paraCentavos(it.preco) * it.quantidade), formato)}
            </p>
          ))}
          {resumo.entrada > 0 && (
            <ResumoLinha rotulo={t('novoPedido.entrada')} valor={moeda(resumo.entrada, formato)} />
          )}
          {pag.parcelas > 1 && (
            <ResumoLinha rotulo={t('novoPedido.parcelas')} valor={`${pag.parcelas}×`} />
          )}
          {/* o que acontece ao criar — transparência (diferencial do produto) */}
          <div className="mt-2 rounded-xl border border-brand-roxo/30 bg-brand-roxo/5 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-roxo">
              {t('novoPedido.efeitosTitulo')}
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px] text-texto-2">
              {resumo.comProducao > 0 && <li>• {t('novoPedido.efeitoOp')}</li>}
              <li>• {t('novoPedido.efeitoFinanceiro')}</li>
              <li>• {t('novoPedido.efeitoSnapshot')}</li>
            </ul>
          </div>
        </div>
      )}

      {/* ---------------- resumo ao vivo (todos os passos) ---------------- */}
      <div className="mt-4 rounded-xl bg-surface-2 p-3">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-texto-2">
          {t('novoPedido.resumo')}
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <LinhaResumoVivo rotulo={t('novoPedido.subtotal')} valor={moeda(resumo.subtotal, formato)} />
          <LinhaResumoVivo rotulo={t('novoPedido.frete')} valor={moeda(resumo.frete, formato)} />
          <LinhaResumoVivo rotulo={t('novoPedido.saldoRestante')} valor={moeda(resumo.saldo, formato)} />
          <div>
            <span className="block text-[10px] font-bold uppercase text-texto-2">{t('novoPedido.totalPedido')}</span>
            <span className="text-sm font-extrabold tabular-nums grad-texto">{moeda(resumo.total, formato)}</span>
          </div>
        </div>
      </div>

      {erro && <p className="mt-3 text-xs font-semibold text-erro">{erro}</p>}
      <div className="mt-4 flex items-center justify-between">
        <Botao type="button" variante="fantasma"
          onClick={() => (passo === 0 ? fechar() : setPasso((p) => p - 1))}>
          {passo === 0 ? t('acoes.cancelar') : t('novoPedido.voltar')}
        </Botao>
        {passo < 3 ? (
          <Botao type="button" onClick={avancar}>{t('novoPedido.continuar')} →</Botao>
        ) : (
          <Botao type="button" variante="acento" disabled={salvando || itens.length === 0} onClick={finalizar}>
            {salvando ? t('estados.salvando') : t('novoPedido.criar')}
          </Botao>
        )}
      </div>
    </Modal>
  );
}

function ResumoLinha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between border-b border-borda/60 py-1.5">
      <span className="text-texto-2">{rotulo}</span>
      <span className="font-semibold text-ink">{valor}</span>
    </div>
  );
}

function LinhaResumoVivo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <span className="block text-[10px] font-bold uppercase text-texto-2">{rotulo}</span>
      <span className="font-semibold tabular-nums text-ink">{valor}</span>
    </div>
  );
}
