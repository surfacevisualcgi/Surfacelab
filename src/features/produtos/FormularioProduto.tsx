/**
 * Formularios de produto.
 * Produto e o agrupador comercial; variacao/SKU e a unidade vendavel ligada a
 * um modelo 3D tecnico quando existir.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { paraCentavos } from '@/lib/formato';
import { Botao, Campo, Entrada, EntradaDinheiro, Etiqueta, Modal, Selecao } from '@/components/ui';
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

interface ModeloSkuRef {
  id: string;
  nome: string;
  codigo_interno: string | null;
  fotos: string[];
  dimensoes: string | null;
  largura_mm: number | null;
  profundidade_mm: number | null;
  altura_mm: number | null;
  peso_peca_g: number;
  peso_suporte_g: number;
  peso_purga_g: number;
  peso_desperdicio_g: number;
}

interface SkuInicial {
  modelo_id: string;
  nome: string;
  codigo: string;
  tamanho: string;
  cor_nome: string;
  cor_hex: string;
  preco: string;
  estoque: string;
}

const VAZIO: DadosProduto = {
  nome: '',
  sku: '',
  categoria_id: '',
  descricao: '',
  disponibilidade: 'sob_demanda',
  tags: '',
  dimensoes: '',
  peso_g: '',
  material_principal: '',
  custo_desenvolvimento: '',
  qtd_planejada_rateio: '',
  preco_praticado: '',
};

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

export function ModalNovoProduto({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { t } = useTranslation();
  const { ativa } = useAuth();
  const navigate = useNavigate();
  const crud = useCrud('produto', ['v_produto', 'variacao']);
  const modelos = useLista<ModeloSkuRef>('modelo_3d', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, codigo_interno, fotos, dimensoes, largura_mm, profundidade_mm, altura_mm, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g',
  });

  const [passo, setPasso] = useState(0);
  const [d, setD] = useState<DadosProduto>(VAZIO);
  const [skus, setSkus] = useState<SkuInicial[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const modelosPorId = useMemo(() => new Map((modelos.data ?? []).map((m) => [m.id, m])), [modelos.data]);
  const set = (campo: keyof DadosProduto, v: string) => setD((x) => ({ ...x, [campo]: v }));
  const passos = [t('novoProduto.passoInfo'), 'Modelos 3D e SKUs', t('novoProduto.passoPreco'), t('novoProduto.passoRevisao')];

  function fechar() {
    setPasso(0);
    setD(VAZIO);
    setSkus([]);
    setErro(null);
    onFechar();
  }

  function avancar() {
    setErro(null);
    if (passo === 0 && !d.nome.trim()) {
      setErro(t('novoProduto.semNome'));
      return;
    }
    setPasso((p) => Math.min(3, p + 1));
  }

  async function finalizar() {
    setSalvando(true);
    setErro(null);
    try {
      const { id } = await crud.criar.mutateAsync({ ...paraPayload(d), status: 'ativo' });
      const skusValidos = skus.filter((s) => s.modelo_id);
      const linhasSku = skusValidos.map((s, indice) => {
        const modelo = modelosPorId.get(s.modelo_id);
        return {
          tenant_id: ativa?.tenant_id,
          produto_id: id,
          nome: s.nome.trim() || modelo?.nome || 'Variacao',
          codigo: s.codigo.trim() || gerarSkuInicial(d.nome, modelo, indice),
          modelo_id: s.modelo_id,
          tamanho: s.tamanho || tamanhoModelo(modelo),
          preco: paraCentavos(s.preco || d.preco_praticado || '0'),
          estoque: Number(s.estoque || 0),
          status: 'ativo',
          venda_status: Number(s.estoque || 0) > 0 ? 'em_estoque' : 'sob_encomenda',
          ordem: indice + 1,
          cor_nome: s.cor_nome || null,
          cor_hex: s.cor_hex || null,
          foto: modelo?.fotos?.[0] ?? null,
          fotos: modelo?.fotos ?? [],
          dimensoes: tamanhoModelo(modelo),
          peso_g: modelo ? pesoModelo(modelo) : null,
        };
      });
      if (linhasSku.length > 0) {
        const { error } = await supabase.from('variacao').insert(linhasSku);
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
    <Modal aberto={aberto} titulo={t('produto.novo')} onFechar={fechar} largura="max-w-4xl">
      <div className="mb-4 flex items-center gap-1">
        {passos.map((nome, i) => (
          <div key={nome} className="flex flex-1 items-center gap-1">
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              i < passo ? 'bg-ok text-white' : i === passo ? 'grad-acento text-white' : 'bg-surface-2 text-texto-2'
            }`}>{i < passo ? 'ok' : i + 1}</span>
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
          <div className="grid gap-3 sm:grid-cols-2">
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
            <Entrada value={d.tags} onChange={(e) => set('tags', e.target.value)} placeholder="porta-joias, decoracao, presente" />
          </Campo>
        </div>
      )}

      {passo === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-texto-2">
            Selecione modelos 3D ja cadastrados. Cada modelo selecionado vira uma variacao/SKU vendavel com ponte tecnica para custo, peso e dimensoes.
          </p>
          {skus.map((sku, i) => {
            const modelo = modelosPorId.get(sku.modelo_id);
            return (
              <div key={`${sku.modelo_id || 'novo'}-${i}`} className="rounded-xl border border-borda bg-surface-2 p-3">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_90px_32px]">
                  <Selecao
                    value={sku.modelo_id}
                    onChange={(e) => setSkus(skus.map((x, j) => j === i ? skuDaSelecao(modelosPorId.get(e.target.value), d.nome, j, x) : x))}
                  >
                    <option value="">Selecione um modelo 3D</option>
                    {(modelos.data ?? []).map((m) => <option key={m.id} value={m.id}>{[m.codigo_interno, m.nome].filter(Boolean).join(' - ')}</option>)}
                  </Selecao>
                  <Entrada value={sku.nome} onChange={(e) => setSkus(skus.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} placeholder="Nome da variacao" />
                  <Entrada value={sku.codigo} onChange={(e) => setSkus(skus.map((x, j) => j === i ? { ...x, codigo: e.target.value } : x))} placeholder="SKU" />
                  <Entrada value={sku.estoque} onChange={(e) => setSkus(skus.map((x, j) => j === i ? { ...x, estoque: e.target.value } : x))} type="number" min="0" placeholder="Estoque" />
                  <button type="button" className="text-texto-2 hover:text-erro" onClick={() => setSkus(skus.filter((_, j) => j !== i))}>x</button>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-4">
                  <Entrada value={sku.tamanho} onChange={(e) => setSkus(skus.map((x, j) => j === i ? { ...x, tamanho: e.target.value } : x))} placeholder="Tamanho/dimensoes" />
                  <Entrada value={sku.cor_nome} onChange={(e) => setSkus(skus.map((x, j) => j === i ? { ...x, cor_nome: e.target.value } : x))} placeholder="Cor" />
                  <input type="color" value={sku.cor_hex || '#b9a0e8'} onChange={(e) => setSkus(skus.map((x, j) => j === i ? { ...x, cor_hex: e.target.value } : x))} className="h-10 w-full rounded-lg border border-borda bg-white p-1" />
                  <EntradaDinheiro value={sku.preco} onChange={(e) => setSkus(skus.map((x, j) => j === i ? { ...x, preco: e.target.value } : x))} />
                </div>
                {modelo && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Etiqueta>{tamanhoModelo(modelo) || 'Sem dimensoes'}</Etiqueta>
                    <Etiqueta>{pesoModelo(modelo).toLocaleString('pt-BR')} g</Etiqueta>
                    {modelo.codigo_interno && <Etiqueta>{modelo.codigo_interno}</Etiqueta>}
                  </div>
                )}
              </div>
            );
          })}
          <Botao type="button" variante="secundario" className="!px-2.5 !py-1.5 !text-xs" onClick={() => setSkus([...skus, skuDaSelecao(null, d.nome, skus.length)])}>
            + Adicionar SKU a partir de modelo 3D
          </Botao>
        </div>
      )}

      {passo === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo={t('novoProduto.precoPraticado')}>
            <EntradaDinheiro value={d.preco_praticado} onChange={(e) => set('preco_praticado', e.target.value)} />
          </Campo>
          <Campo rotulo={t('novoProduto.materialPrincipal')}>
            <Entrada value={d.material_principal} onChange={(e) => set('material_principal', e.target.value)} placeholder="PLA, PETG" />
          </Campo>
          <Campo rotulo={t('novoProduto.dimensoes')}>
            <Entrada value={d.dimensoes} onChange={(e) => set('dimensoes', e.target.value)} placeholder="140 x 140 x 210 mm" />
          </Campo>
          <Campo rotulo={t('novoProduto.peso')}>
            <Entrada type="number" min="0" step="any" value={d.peso_g} onChange={(e) => set('peso_g', e.target.value)} />
          </Campo>
          <Campo rotulo={t('novoProduto.custoDesenvolvimento')}>
            <EntradaDinheiro value={d.custo_desenvolvimento} onChange={(e) => set('custo_desenvolvimento', e.target.value)} />
          </Campo>
          <Campo rotulo={t('novoProduto.qtdRateio')} dica="Amortiza o desenvolvimento por N vendas">
            <Entrada type="number" min="0" value={d.qtd_planejada_rateio} onChange={(e) => set('qtd_planejada_rateio', e.target.value)} />
          </Campo>
        </div>
      )}

      {passo === 3 && (
        <div className="space-y-2 text-sm">
          <p className="mb-1 text-xs text-texto-2">{t('novoProduto.revisaoDica')}</p>
          <ResumoLinha rotulo={t('produto.nome')} valor={d.nome || '-'} />
          <ResumoLinha rotulo={t('produto.sku')} valor={d.sku || '-'} />
          <ResumoLinha rotulo={t('novoProduto.tipo')} valor={t(`produto.dispLabel.${d.disponibilidade}`)} />
          <ResumoLinha rotulo="SKUs ligados a modelos 3D" valor={`${skus.filter((s) => s.modelo_id).length}`} />
          <ResumoLinha rotulo={t('novoProduto.precoPraticado')} valor={d.preco_praticado ? `R$ ${d.preco_praticado}` : '-'} />
        </div>
      )}

      {erro && <p className="mt-3 text-xs font-semibold text-erro">{erro}</p>}
      <div className="mt-4 flex items-center justify-between">
        <Botao type="button" variante="fantasma" onClick={() => passo === 0 ? fechar() : setPasso((p) => p - 1)}>
          {passo === 0 ? t('acoes.cancelar') : t('novoProduto.voltar')}
        </Botao>
        {passo < 3 ? (
          <Botao type="button" onClick={avancar}>{t('novoProduto.continuar')} -&gt;</Botao>
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
          <EntradaDinheiro name="custo_desenvolvimento" defaultCentavos={produto.custo_desenvolvimento ?? 0} />
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

function skuDaSelecao(modelo: ModeloSkuRef | undefined | null, produtoNome: string, indice: number, atual?: SkuInicial): SkuInicial {
  return {
    modelo_id: modelo?.id ?? '',
    nome: atual?.nome || modelo?.nome || '',
    codigo: atual?.codigo || gerarSkuInicial(produtoNome, modelo, indice),
    tamanho: atual?.tamanho || tamanhoModelo(modelo),
    cor_nome: atual?.cor_nome || '',
    cor_hex: atual?.cor_hex || '#b9a0e8',
    preco: atual?.preco || '',
    estoque: atual?.estoque || '0',
  };
}

function tamanhoModelo(modelo?: ModeloSkuRef | null) {
  if (!modelo) return '';
  if (modelo.dimensoes) return modelo.dimensoes;
  const dims = [modelo.largura_mm, modelo.profundidade_mm, modelo.altura_mm].filter((v) => v != null && Number(v) > 0);
  return dims.length ? `${dims.join(' x ')} mm` : '';
}

function pesoModelo(modelo: ModeloSkuRef) {
  return Number(modelo.peso_peca_g || 0)
    + Number(modelo.peso_suporte_g || 0)
    + Number(modelo.peso_purga_g || 0)
    + Number(modelo.peso_desperdicio_g || 0);
}

function gerarSkuInicial(produtoNome: string, modelo?: ModeloSkuRef | null, indice = 0) {
  const base = modelo?.codigo_interno || modelo?.nome || produtoNome || 'SKU';
  const prefixo = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
    .slice(0, 24);
  return `${prefixo || 'SKU'}-${String(indice + 1).padStart(3, '0')}`;
}
