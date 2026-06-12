/**
 * Novo Orçamento em stepper: Cliente → Itens → Detalhes & revisão. Monta o
 * orçamento direto de produtos (sem passar pela calculadora item-a-item),
 * com resumo ao vivo. Grava via RPC criar_orcamento_manual (servidor resolve
 * custos do cadastro). Nasce em rascunho, pronto pra enviar/aprovar.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, moeda, paraCentavos } from '@/lib/formato';
import { Botao, Campo, Entrada, Modal, Selecao } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

interface ClienteRef { id: string; nome: string; anonimizado: boolean }
interface CanalRef { id: string; nome: string }
interface ProdutoRef { id: string; nome: string; preco_praticado: number; preco_sugerido: number | null }
interface ItemOrc { avulso: boolean; produto_id: string; descricao: string; quantidade: number; preco: string }

const HOJE = new Date();
const VALIDADE_PADRAO = new Date(HOJE.getFullYear(), HOJE.getMonth(), HOJE.getDate() + 7).toISOString().slice(0, 10);

export function ModalNovoOrcamento({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { t } = useTranslation();
  const { formato } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const clientes = useLista<ClienteRef>('v_cliente', { ordem: 'nome', desc: false });
  const canais = useLista<CanalRef>('canal_venda', { ordem: 'nome', desc: false });
  const produtos = useLista<ProdutoRef>('v_produto', { ordem: 'nome', desc: false });

  const [passo, setPasso] = useState(0);
  const [clienteId, setClienteId] = useState('');
  const [canalId, setCanalId] = useState('');
  const [validade, setValidade] = useState(VALIDADE_PADRAO);
  const [itens, setItens] = useState<ItemOrc[]>([]);
  const [prazo, setPrazo] = useState('');
  const [condicoes, setCondicoes] = useState('');
  const [frete, setFrete] = useState('');
  const [desconto, setDesconto] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const passos = [t('novoPedido.passoCliente'), t('novoPedido.passoItens'), t('novoOrc.passoDetalhes')];

  const resumo = useMemo(() => {
    const subtotal = itens.reduce((s, it) => s + Math.round(paraCentavos(it.preco) * (it.quantidade || 0)), 0);
    const f = paraCentavos(frete || '0');
    const d = paraCentavos(desconto || '0');
    return { subtotal, frete: f, desconto: d, total: Math.max(0, subtotal + f - d) };
  }, [itens, frete, desconto]);

  function fechar() {
    setPasso(0); setClienteId(''); setCanalId(''); setValidade(VALIDADE_PADRAO); setItens([]);
    setPrazo(''); setCondicoes(''); setFrete(''); setDesconto(''); setObs(''); setErro(null);
    onFechar();
  }
  function precoDoProduto(produtoId: string): string {
    const p = (produtos.data ?? []).find((x) => x.id === produtoId);
    if (!p) return '';
    const c = p.preco_praticado > 0 ? p.preco_praticado : (p.preco_sugerido ?? 0);
    return c > 0 ? deCentavos(c) : '';
  }
  const setItem = (i: number, m: Partial<ItemOrc>) => setItens(itens.map((it, j) => (j === i ? { ...it, ...m } : it)));

  function avancar() {
    if (passo === 1) {
      if (itens.length === 0) { setErro(t('novoPedido.semItens')); return; }
      for (const it of itens) {
        if (it.avulso ? !it.descricao.trim() : !it.produto_id) { setErro(t('novoPedido.semItens')); return; }
        if (!it.quantidade || it.quantidade <= 0) { setErro(t('novoPedido.semItens')); return; }
      }
    }
    setErro(null);
    setPasso((p) => Math.min(2, p + 1));
  }

  async function finalizar() {
    setSalvando(true); setErro(null);
    try {
      const { data, error } = await supabase.rpc('criar_orcamento_manual', {
        p_itens: itens.map((it) => ({
          produto_id: it.produto_id || null,
          descricao: it.descricao.trim() || null,
          quantidade: it.quantidade,
          valor_unit: paraCentavos(it.preco || '0'),
        })),
        p_cliente: clienteId || null,
        p_canal: canalId || null,
        p_validade: validade || null,
        p_prazo_entrega: prazo.trim() || null,
        p_condicoes: condicoes.trim() || null,
        p_frete: resumo.frete,
        p_desconto: resumo.desconto,
        p_observacoes: obs.trim() || null,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['v_orcamento'] });
      const id = data as string;
      fechar();
      navigate(`/orcamentos/${id}`);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo={t('novoOrc.titulo')} onFechar={fechar} largura="max-w-2xl">
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

      {passo === 0 && (
        <div className="space-y-3">
          <Campo rotulo={t('pedido.cliente')} dica={t('novoPedido.clienteDica')}>
            <Selecao value={clienteId} onChange={(e) => setClienteId(e.target.value)} autoFocus>
              <option value="">{t('novoPedido.semCliente')}</option>
              {(clientes.data ?? []).filter((c) => !c.anonimizado).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('novoPedido.canal')}>
              <Selecao value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                <option value="">—</option>
                {(canais.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo={t('orcamento.validade')}>
              <Entrada type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
            </Campo>
          </div>
        </div>
      )}

      {passo === 1 && (
        <div className="space-y-2">
          {itens.map((it, i) => (
            <div key={i} className="rounded-xl border border-borda p-2.5">
              <div className="grid grid-cols-[1fr_64px_96px_32px] items-end gap-2">
                {!it.avulso ? (
                  <Campo rotulo={t('novoPedido.produto')}>
                    <Selecao value={it.produto_id} onChange={(e) => setItem(i, { produto_id: e.target.value, preco: precoDoProduto(e.target.value) })}>
                      <option value="">—</option>
                      {(produtos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </Selecao>
                  </Campo>
                ) : (
                  <Campo rotulo={t('novoPedido.descricaoAvulsa')}>
                    <Entrada value={it.descricao} autoFocus placeholder="Ex.: arte personalizada, taxa de projeto…"
                      onChange={(e) => setItem(i, { descricao: e.target.value })} />
                  </Campo>
                )}
                <Campo rotulo={t('produto.quantidade')}>
                  <Entrada type="number" min="1" step="any" value={it.quantidade || ''} onChange={(e) => setItem(i, { quantidade: Number(e.target.value) })} />
                </Campo>
                <Campo rotulo={t('novoPedido.precoUnit')}>
                  <Entrada inputMode="decimal" value={it.preco} placeholder="0,00" onChange={(e) => setItem(i, { preco: e.target.value })} />
                </Campo>
                <button type="button" aria-label={t('acoes.excluir')} className="pb-2.5 text-texto-2 hover:text-erro"
                  onClick={() => setItens(itens.filter((_, j) => j !== i))}>✕</button>
              </div>
              <p className="mt-1 text-right text-[11px] font-semibold tabular-nums text-texto-2">
                = {moeda(Math.round(paraCentavos(it.preco) * (it.quantidade || 0)), formato)}
              </p>
            </div>
          ))}
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
        </div>
      )}

      {passo === 2 && (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={t('orcamento.prazoEntrega')}>
            <Entrada value={prazo} placeholder="Ex.: 7 dias úteis" onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
          <Campo rotulo={t('orcamento.condicoes')}>
            <Entrada value={condicoes} placeholder="Ex.: 50% sinal + 50% na entrega" onChange={(e) => setCondicoes(e.target.value)} />
          </Campo>
          <Campo rotulo={t('orcamento.frete')}>
            <Entrada inputMode="decimal" value={frete} placeholder="0,00" onChange={(e) => setFrete(e.target.value)} />
          </Campo>
          <Campo rotulo={t('calculadora.desconto')}>
            <Entrada inputMode="decimal" value={desconto} placeholder="0,00" onChange={(e) => setDesconto(e.target.value)} />
          </Campo>
          <Campo rotulo={t('orcamento.observacoes')} className="col-span-2">
            <textarea value={obs} rows={2} onChange={(e) => setObs(e.target.value)}
              className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
          </Campo>
        </div>
      )}

      {/* resumo ao vivo */}
      <div className="mt-4 rounded-xl bg-surface-2 p-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          <LinhaResumo rotulo={t('novoPedido.subtotal')} valor={moeda(resumo.subtotal, formato)} />
          <LinhaResumo rotulo={t('orcamento.frete')} valor={moeda(resumo.frete, formato)} />
          <LinhaResumo rotulo={t('calculadora.desconto')} valor={moeda(resumo.desconto, formato)} />
          <div>
            <span className="block text-[10px] font-bold uppercase text-texto-2">{t('orcamento.totalDoc')}</span>
            <span className="text-sm font-extrabold tabular-nums grad-texto">{moeda(resumo.total, formato)}</span>
          </div>
        </div>
      </div>

      {erro && <p className="mt-3 text-xs font-semibold text-erro">{erro}</p>}
      <div className="mt-4 flex items-center justify-between">
        <Botao type="button" variante="fantasma" onClick={() => (passo === 0 ? fechar() : setPasso((p) => p - 1))}>
          {passo === 0 ? t('acoes.cancelar') : t('novoPedido.voltar')}
        </Botao>
        {passo < 2 ? (
          <Botao type="button" onClick={avancar}>{t('novoPedido.continuar')} →</Botao>
        ) : (
          <Botao type="button" variante="acento" disabled={salvando || itens.length === 0} onClick={finalizar}>
            {salvando ? t('estados.salvando') : t('novoOrc.criar')}
          </Botao>
        )}
      </div>
    </Modal>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <span className="block text-[10px] font-bold uppercase text-texto-2">{rotulo}</span>
      <span className="font-semibold tabular-nums text-ink">{valor}</span>
    </div>
  );
}
