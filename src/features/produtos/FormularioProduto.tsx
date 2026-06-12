/**
 * Novo Produto em STEPPER (modal 02 do v2): Informações → Composição →
 * Preço & detalhes → Revisão. Coleta tudo em memória e grava de uma vez ao
 * finalizar (produto + composicao_item dos modelos escolhidos), evitando
 * produtos órfãos. Também exporta o modal de EDIÇÃO de identidade.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, paraCentavos } from '@/lib/formato';
import { Botao, Campo, Entrada, Etiqueta, Modal, Selecao } from '@/components/ui';
import { SelecaoCategoria } from '@/components/SelecaoCategoria';
import { useAuth } from '@/auth/AuthProvider';
import type { ProdutoView } from './PaginaProdutos';

interface DadosProduto {
  nome: string;
  sku: string;
  categoria_id: string;
  descricao: string;
  disponibilidade: string;
  tags: string;
  dimensoes: string;
  peso_g: string;
  material_principal: string;
  custo_desenvolvimento: string;
  qtd_planejada_rateio: string;
  preco_praticado: string;
}

const VAZIO: DadosProduto = {
  nome: '', sku: '', categoria_id: '', descricao: '', disponibilidade: 'sob_demanda',
  tags: '', dimensoes: '', peso_g: '', material_principal: '',
  custo_desenvolvimento: '', qtd_planejada_rateio: '', preco_praticado: '',
};

/** monta o payload do banco a partir do estado do formulário */
function paraPayload(d: DadosProduto) {
  return {
    nome: d.nome.trim(),
    sku: d.sku || null,
    categoria_id: d.categoria_id || null,
    descricao: d.descricao || null,
    disponibilidade: d.disponibilidade,
    tags: d.tags ? d.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
    dimensoes: d.dimensoes || null,
    peso_g: d.peso_g ? Number(d.peso_g) : null,
    material_principal: d.material_principal || null,
    custo_desenvolvimento: paraCentavos(d.custo_desenvolvimento || '0'),
    qtd_planejada_rateio: d.qtd_planejada_rateio ? Number(d.qtd_planejada_rateio) : 0,
    preco_praticado: paraCentavos(d.preco_praticado || '0'),
  };
}

// ----------------------------------------------------------- Novo (stepper)
export function ModalNovoProduto({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { t } = useTranslation();
  const { ativa } = useAuth();
  const navigate = useNavigate();
  const crud = useCrud('produto', ['v_produto']);
  const modelos = useLista<{ id: string; nome: string }>('modelo_3d', { ordem: 'nome', desc: false });

  const [passo, setPasso] = useState(0);
  const [d, setD] = useState<DadosProduto>(VAZIO);
  const [comp, setComp] = useState<{ modelo_id: string; quantidade: number }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const set = (campo: keyof DadosProduto, v: string) => setD((x) => ({ ...x, [campo]: v }));
  const passos = [t('novoProduto.passoInfo'), t('novoProduto.passoComposicao'), t('novoProduto.passoPreco'), t('novoProduto.passoRevisao')];

  function fechar() {
    setPasso(0); setD(VAZIO); setComp([]); setErro(null); onFechar();
  }

  function avancar() {
    setErro(null);
    if (passo === 0 && !d.nome.trim()) { setErro(t('novoProduto.semNome')); return; }
    setPasso((p) => Math.min(3, p + 1));
  }

  async function finalizar() {
    setSalvando(true);
    setErro(null);
    try {
      const { id } = await crud.criar.mutateAsync({ ...paraPayload(d), status: 'ativo' });
      // composição inicial: modelos impressos escolhidos
      const linhas = comp.filter((c) => c.modelo_id).map((c) => ({
        tenant_id: ativa?.tenant_id, produto_id: id, tipo: 'modelo_impresso',
        modelo_id: c.modelo_id, quantidade: c.quantidade || 1, unidade: 'un',
      }));
      if (linhas.length > 0) {
        const { error } = await supabase.from('composicao_item').insert(linhas);
        if (error) throw error;
      }
      fechar();
      navigate(`/produtos/${id}`);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo={t('produto.novo')} onFechar={fechar} largura="max-w-xl">
      {/* indicador de passos */}
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
          <Campo rotulo={t('produto.nome')}>
            <Entrada value={d.nome} onChange={(e) => set('nome', e.target.value)} autoFocus />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('produto.sku')}><Entrada value={d.sku} onChange={(e) => set('sku', e.target.value)} /></Campo>
            <Campo rotulo={t('novoProduto.tipo')}>
              <Selecao value={d.disponibilidade} onChange={(e) => set('disponibilidade', e.target.value)}>
                <option value="sob_demanda">{t('produto.dispLabel.sob_demanda')}</option>
                <option value="pronta_entrega">{t('produto.dispLabel.pronta_entrega')}</option>
              </Selecao>
            </Campo>
          </div>
          <Campo rotulo={t('categoria.rotulo')}>
            <SelecaoCategoria escopo="produto" valor={d.categoria_id} onChange={(v) => set('categoria_id', v)} />
          </Campo>
          <Campo rotulo={t('formModelo.descricao')}>
            <textarea value={d.descricao} onChange={(e) => set('descricao', e.target.value)} rows={3}
              className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
          </Campo>
          <Campo rotulo={t('novoProduto.tags')}>
            <Entrada value={d.tags} onChange={(e) => set('tags', e.target.value)} placeholder="luminária, decoração, presente" />
          </Campo>
        </div>
      )}

      {passo === 1 && (
        <div className="space-y-2">
          <p className="text-xs text-texto-2">{t('novoProduto.semModelos')}</p>
          {comp.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_32px] items-center gap-2">
              <Selecao value={c.modelo_id}
                onChange={(e) => setComp(comp.map((x, j) => j === i ? { ...x, modelo_id: e.target.value } : x))}>
                <option value="">—</option>
                {(modelos.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Selecao>
              <Entrada type="number" min="1" step="any" value={c.quantidade}
                onChange={(e) => setComp(comp.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x))} />
              <button type="button" className="text-texto-2 hover:text-erro"
                onClick={() => setComp(comp.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <Botao type="button" variante="secundario" className="!px-2.5 !py-1.5 !text-xs"
            onClick={() => setComp([...comp, { modelo_id: '', quantidade: 1 }])}>
            + {t('novoProduto.addModelo')}
          </Botao>
        </div>
      )}

      {passo === 2 && (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={t('novoProduto.precoPraticado')}>
            <Entrada inputMode="decimal" value={d.preco_praticado} onChange={(e) => set('preco_praticado', e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo rotulo={t('novoProduto.materialPrincipal')}>
            <Entrada value={d.material_principal} onChange={(e) => set('material_principal', e.target.value)} placeholder="PLA, PETG…" />
          </Campo>
          <Campo rotulo={t('novoProduto.dimensoes')}>
            <Entrada value={d.dimensoes} onChange={(e) => set('dimensoes', e.target.value)} placeholder="14 × 14 × 21 cm" />
          </Campo>
          <Campo rotulo={t('novoProduto.peso')}>
            <Entrada type="number" min="0" step="any" value={d.peso_g} onChange={(e) => set('peso_g', e.target.value)} />
          </Campo>
          <Campo rotulo={t('novoProduto.custoDesenvolvimento')}>
            <Entrada inputMode="decimal" value={d.custo_desenvolvimento} onChange={(e) => set('custo_desenvolvimento', e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo rotulo={t('novoProduto.qtdRateio')} dica="Amortiza o desenvolvimento por N vendas">
            <Entrada type="number" min="0" value={d.qtd_planejada_rateio} onChange={(e) => set('qtd_planejada_rateio', e.target.value)} />
          </Campo>
        </div>
      )}

      {passo === 3 && (
        <div className="space-y-2 text-sm">
          <p className="mb-1 text-xs text-texto-2">{t('novoProduto.revisaoDica')}</p>
          <ResumoLinha rotulo={t('produto.nome')} valor={d.nome || '—'} />
          <ResumoLinha rotulo={t('produto.sku')} valor={d.sku || '—'} />
          <ResumoLinha rotulo={t('novoProduto.tipo')} valor={t(`produto.dispLabel.${d.disponibilidade}`)} />
          <ResumoLinha rotulo={t('novoProduto.modelosImpressos')} valor={`${comp.filter((c) => c.modelo_id).length}`} />
          <ResumoLinha rotulo={t('novoProduto.precoPraticado')} valor={d.preco_praticado ? `R$ ${d.preco_praticado}` : '—'} />
        </div>
      )}

      {erro && <p className="mt-3 text-xs font-semibold text-erro">{erro}</p>}
      <div className="mt-4 flex items-center justify-between">
        <Botao type="button" variante="fantasma" onClick={() => passo === 0 ? fechar() : setPasso((p) => p - 1)}>
          {passo === 0 ? t('acoes.cancelar') : t('novoProduto.voltar')}
        </Botao>
        {passo < 3 ? (
          <Botao type="button" onClick={avancar}>{t('novoProduto.continuar')} →</Botao>
        ) : (
          <Botao type="button" variante="acento" disabled={salvando} onClick={finalizar}>
            {salvando ? t('estados.salvando') : t('novoProduto.criar')}
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

// ------------------------------------------------- Editar identidade (modal)
export function ModalEditarProduto({ produto, aberto, onFechar, onSalvo }: {
  produto: ProdutoView & { descricao?: string | null; categoria_id?: string | null; dimensoes?: string | null;
    peso_g?: number | null; material_principal?: string | null; tags?: string[]; custo_desenvolvimento?: number | null;
    qtd_planejada_rateio?: number | null };
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const { t } = useTranslation();
  const crud = useCrud('produto', ['v_produto']);
  const [categoriaId, setCategoriaId] = useState(produto.categoria_id ?? '');
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await crud.atualizar.mutateAsync({
        id: produto.id,
        nome: f.get('nome') as string,
        sku: (f.get('sku') as string) || null,
        categoria_id: categoriaId || null,
        descricao: (f.get('descricao') as string) || null,
        disponibilidade: f.get('disponibilidade') as string,
        status: f.get('status') as string,
        tags: (f.get('tags') as string) ? (f.get('tags') as string).split(',').map((s) => s.trim()).filter(Boolean) : [],
        dimensoes: (f.get('dimensoes') as string) || null,
        peso_g: f.get('peso_g') ? Number(f.get('peso_g')) : null,
        material_principal: (f.get('material_principal') as string) || null,
        custo_desenvolvimento: paraCentavos((f.get('custo_desenvolvimento') as string) || '0'),
        qtd_planejada_rateio: f.get('qtd_planejada_rateio') ? Number(f.get('qtd_planejada_rateio')) : 0,
      });
      setErro(null);
      onSalvo();
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  return (
    <Modal aberto={aberto} titulo={t('editarProduto.titulo')} onFechar={onFechar} largura="max-w-xl">
      <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
        <Campo rotulo={t('produto.nome')} className="col-span-2">
          <Entrada name="nome" required defaultValue={produto.nome} />
        </Campo>
        <Campo rotulo={t('produto.sku')}><Entrada name="sku" defaultValue={produto.sku ?? ''} /></Campo>
        <Campo rotulo="Status">
          <Selecao name="status" defaultValue={produto.status}>
            <option value="ativo">Ativo</option>
            <option value="rascunho">Rascunho</option>
            <option value="arquivado">Arquivado</option>
          </Selecao>
        </Campo>
        <Campo rotulo={t('categoria.rotulo')}>
          <SelecaoCategoria escopo="produto" valor={categoriaId} onChange={setCategoriaId} />
        </Campo>
        <Campo rotulo={t('produto.disponibilidade')}>
          <Selecao name="disponibilidade" defaultValue={produto.disponibilidade}>
            <option value="sob_demanda">{t('produto.dispLabel.sob_demanda')}</option>
            <option value="pronta_entrega">{t('produto.dispLabel.pronta_entrega')}</option>
          </Selecao>
        </Campo>
        <Campo rotulo={t('formModelo.descricao')} className="col-span-2">
          <textarea name="descricao" rows={2} defaultValue={produto.descricao ?? ''}
            className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
        </Campo>
        <Campo rotulo={t('novoProduto.materialPrincipal')}>
          <Entrada name="material_principal" defaultValue={produto.material_principal ?? ''} />
        </Campo>
        <Campo rotulo={t('novoProduto.dimensoes')}>
          <Entrada name="dimensoes" defaultValue={produto.dimensoes ?? ''} />
        </Campo>
        <Campo rotulo={t('novoProduto.peso')}>
          <Entrada name="peso_g" type="number" min="0" step="any" defaultValue={produto.peso_g ?? ''} />
        </Campo>
        <Campo rotulo={t('novoProduto.tags')}>
          <Entrada name="tags" defaultValue={(produto.tags ?? []).join(', ')} />
        </Campo>
        <Campo rotulo={t('novoProduto.custoDesenvolvimento')}>
          <Entrada name="custo_desenvolvimento" inputMode="decimal" defaultValue={deCentavos(produto.custo_desenvolvimento ?? 0)} />
        </Campo>
        <Campo rotulo={t('novoProduto.qtdRateio')}>
          <Entrada name="qtd_planejada_rateio" type="number" min="0" defaultValue={produto.qtd_planejada_rateio ?? 0} />
        </Campo>
        {erro && <p className="col-span-2 text-xs font-semibold text-erro">{erro}</p>}
        <div className="col-span-2 flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>{t('acoes.cancelar')}</Botao>
          <Botao type="submit">{t('acoes.salvar')}</Botao>
        </div>
      </form>
      <p className="mt-2 text-[11px] text-texto-2"><Etiqueta>dica</Etiqueta> {t('produto.dicaComposicao')}</p>
    </Modal>
  );
}
