/**
 * Editar um orçamento em RASCUNHO: cabeçalho (validade/prazo/condições/frete/
 * desconto/observações) + itens (produto, qtd, preço). Ao salvar, substitui os
 * itens e chama recalcular_orcamento (servidor re-resolve custo e totais).
 * Só rascunho é editável — a imutabilidade do snapshot é garantida no banco.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, moeda, paraCentavos } from '@/lib/formato';
import { Botao, Campo, Entrada, EntradaDinheiro, Modal, Selecao } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

interface ProdutoRef { id: string; nome: string; preco_praticado: number; preco_sugerido: number | null }
interface ItemEdit { produto_id: string; descricao: string; quantidade: number; preco: string }

export function ModalEditarOrcamento({ orcamentoId, aberto, onFechar, onSalvo }: {
  orcamentoId: string; aberto: boolean; onFechar: () => void; onSalvo: () => void;
}) {
  const { t } = useTranslation();
  const { ativa, formato } = useAuth();
  const qc = useQueryClient();
  const produtos = useLista<ProdutoRef>('v_produto', { ordem: 'nome', desc: false });

  const [validade, setValidade] = useState('');
  const [prazo, setPrazo] = useState('');
  const [condicoes, setCondicoes] = useState('');
  const [frete, setFrete] = useState('');
  const [desconto, setDesconto] = useState('');
  const [obs, setObs] = useState('');
  const [itens, setItens] = useState<ItemEdit[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState(false);

  // carrega os valores atuais ao abrir
  useEffect(() => {
    if (!aberto || !orcamentoId) return;
    setCarregado(false);
    (async () => {
      const [{ data: o }, { data: its }] = await Promise.all([
        supabase.from('v_orcamento').select('validade, prazo_entrega, condicoes_pagamento, frete, desconto, observacoes').eq('id', orcamentoId).single(),
        supabase.from('v_orcamento_item').select('produto_id, descricao, quantidade, valor_unit').eq('orcamento_id', orcamentoId).is('deleted_at', null).order('ordem'),
      ]);
      setValidade(o?.validade ?? '');
      setPrazo(o?.prazo_entrega ?? '');
      setCondicoes(o?.condicoes_pagamento ?? '');
      setFrete(o?.frete ? deCentavos(o.frete) : '');
      setDesconto(o?.desconto ? deCentavos(o.desconto) : '');
      setObs(o?.observacoes ?? '');
      setItens((its ?? []).map((i) => ({
        produto_id: (i as { produto_id: string | null }).produto_id ?? '',
        descricao: (i as { descricao: string }).descricao,
        quantidade: Number((i as { quantidade: number }).quantidade),
        preco: deCentavos(Number((i as { valor_unit: number }).valor_unit)),
      })));
      setCarregado(true);
    })();
  }, [aberto, orcamentoId]);

  const resumo = useMemo(() => {
    const subtotal = itens.reduce((s, it) => s + Math.round(paraCentavos(it.preco) * (it.quantidade || 0)), 0);
    return Math.max(0, subtotal + paraCentavos(frete || '0') - paraCentavos(desconto || '0'));
  }, [itens, frete, desconto]);

  const setItem = (i: number, m: Partial<ItemEdit>) => setItens(itens.map((it, j) => (j === i ? { ...it, ...m } : it)));
  function precoDoProduto(id: string): string {
    const p = (produtos.data ?? []).find((x) => x.id === id);
    if (!p) return '';
    const c = p.preco_praticado > 0 ? p.preco_praticado : (p.preco_sugerido ?? 0);
    return c > 0 ? deCentavos(c) : '';
  }

  async function salvar() {
    if (itens.length === 0 || itens.some((it) => !it.produto_id && !it.descricao.trim())) {
      setErro(t('novoPedido.semItens')); return;
    }
    setSalvando(true); setErro(null);
    try {
      // 1) cabeçalho
      const { error: e1 } = await supabase.from('orcamento').update({
        validade: validade || null,
        prazo_entrega: prazo.trim() || null,
        condicoes_pagamento: condicoes.trim() || null,
        frete: paraCentavos(frete || '0'),
        desconto: paraCentavos(desconto || '0'),
        observacoes: obs.trim() || null,
      }).eq('id', orcamentoId);
      if (e1) throw e1;

      // 2) substitui os itens (rascunho permite)
      const { error: e2 } = await supabase.from('orcamento_item').delete().eq('orcamento_id', orcamentoId);
      if (e2) throw e2;
      const linhas = itens.map((it, idx) => ({
        tenant_id: ativa?.tenant_id, orcamento_id: orcamentoId,
        produto_id: it.produto_id || null,
        descricao: it.descricao.trim() || (produtos.data ?? []).find((p) => p.id === it.produto_id)?.nome || 'Item',
        quantidade: it.quantidade || 1,
        valor_unit: paraCentavos(it.preco || '0'),
        valor_total: Math.round(paraCentavos(it.preco || '0') * (it.quantidade || 1)),
        custo_unit: 0,
        ordem: idx + 1,
      }));
      const { error: e3 } = await supabase.from('orcamento_item').insert(linhas);
      if (e3) throw e3;

      // 3) recalcula custo + totais no servidor
      const { error: e4 } = await supabase.rpc('recalcular_orcamento', { p_orcamento: orcamentoId });
      if (e4) throw e4;

      qc.invalidateQueries({ queryKey: ['v_orcamento'] });
      qc.invalidateQueries({ queryKey: ['v_orcamento_item'] });
      onSalvo();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo={t('editarOrc.titulo')} onFechar={onFechar} largura="max-w-2xl">
      {!carregado ? (
        <p className="py-6 text-center text-sm text-texto-2">{t('estados.carregando')}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('editarOrc.itens')}</p>
          {itens.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_64px_96px_32px] items-end gap-2">
              <Campo rotulo={t('novoPedido.produto')}>
                <Selecao value={it.produto_id} onChange={(e) => setItem(i, { produto_id: e.target.value, descricao: '', preco: precoDoProduto(e.target.value) })}>
                  <option value="">— {t('novoPedido.addAvulso')} —</option>
                  {(produtos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </Selecao>
                {!it.produto_id && (
                  <Entrada className="mt-1" placeholder={t('novoPedido.descricaoAvulsa')} value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} />
                )}
              </Campo>
              <Campo rotulo={t('produto.quantidade')}>
                <Entrada type="number" min="1" step="any" value={it.quantidade || ''} onChange={(e) => setItem(i, { quantidade: Number(e.target.value) })} />
              </Campo>
              <Campo rotulo={t('novoPedido.precoUnit')}>
                <EntradaDinheiro value={it.preco} onChange={(e) => setItem(i, { preco: e.target.value })} />
              </Campo>
              <button type="button" className="pb-2.5 text-texto-2 hover:text-erro" aria-label={t('acoes.excluir')}
                onClick={() => setItens(itens.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <Botao type="button" variante="secundario" className="!px-2.5 !py-1.5 !text-xs"
            onClick={() => setItens([...itens, { produto_id: '', descricao: '', quantidade: 1, preco: '' }])}>
            + {t('editarOrc.addItem')}
          </Botao>

          <p className="pt-1 text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('editarOrc.cabecalho')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('orcamento.validade')}><Entrada type="date" value={validade} onChange={(e) => setValidade(e.target.value)} /></Campo>
            <Campo rotulo={t('orcamento.prazoEntrega')}><Entrada value={prazo} placeholder={t('novoOrc.placeholderPrazo')} onChange={(e) => setPrazo(e.target.value)} /></Campo>
            <Campo rotulo={t('orcamento.frete')}><EntradaDinheiro value={frete} onChange={(e) => setFrete(e.target.value)} /></Campo>
            <Campo rotulo={t('calculadora.desconto')}><EntradaDinheiro value={desconto} onChange={(e) => setDesconto(e.target.value)} /></Campo>
            <Campo rotulo={t('orcamento.condicoes')} className="col-span-2"><Entrada value={condicoes} placeholder={t('novoOrc.placeholderCondicoes')} onChange={(e) => setCondicoes(e.target.value)} /></Campo>
            <Campo rotulo={t('orcamento.observacoes')} className="col-span-2">
              <textarea value={obs} rows={2} onChange={(e) => setObs(e.target.value)} className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
            </Campo>
          </div>

          <div className="rounded-xl bg-surface-2 p-3 text-right">
            <span className="text-[10px] font-bold uppercase text-texto-2">{t('orcamento.totalDoc')}: </span>
            <span className="text-sm font-extrabold tabular-nums grad-texto">{moeda(resumo, formato)}</span>
          </div>

          {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={onFechar}>{t('acoes.cancelar')}</Botao>
            <Botao type="button" variante="acento" disabled={salvando} onClick={salvar}>
              {salvando ? t('estados.salvando') : t('editarOrc.salvarRecalcular')}
            </Botao>
          </div>
        </div>
      )}
    </Modal>
  );
}
