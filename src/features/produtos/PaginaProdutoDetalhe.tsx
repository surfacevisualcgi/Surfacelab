/**
 * Produto detalhe redesenhado: fonte mestre comercial do produto.
 * Produto agrupa SKUs, composicao, preco, estoque local e canais.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { enviarFoto, useTenantId } from '@/lib/fotos';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import {
  custoItemComposicao,
  custoMaterial as custoMaterialComposicao,
  entradasDoProduto,
  SELECAO_COMPOSICAO,
  type ImpressoraRef as ImpressoraComposicaoRef,
  type ItemComposicao,
  type MaterialRef as MaterialComposicaoRef,
} from '@/lib/composicao';
import { calcular, entradasVazias, type EntradasCalculo, type ResultadoCalculo } from '@/core/calculo';
import { deCentavos, moeda, paraCentavos, percentual } from '@/lib/formato';
import {
  Abas,
  Acordeao,
  Botao,
  Campo,
  Carregando,
  Cartao,
  Dinheiro,
  Entrada,
  EntradaDinheiro,
  EstadoErro,
  EstadoVazio,
  Etiqueta,
  Modal,
  Selecao,
  TabelaDados,
} from '@/components/ui';
import { Foto, GaleriaFotos } from '@/components/GaleriaFotos';
import { Swatch } from '@/components/Cores';
import { ModalEditarProduto } from './FormularioProduto';
import { useAuth } from '@/auth/AuthProvider';
import type { ProdutoView } from './PaginaProdutos';

type Aba = 'resumo' | 'composicao' | 'canais' | 'historico';

interface ProdutoDetalhe extends ProdutoView {
  descricao: string | null;
  colecao_id: string | null;
  colecao_nome?: string | null;
  colecao_codigo?: string | null;
  dimensoes: string | null;
  peso_g: number | null;
  material_principal: string | null;
  tags: string[];
  cores?: { nome: string; hex: string; foto?: string }[];
  qtd_planejada_rateio: number;
  custo_desenvolvimento: number | null;
  estoque_pronto?: number | null;
}

interface ModeloRef {
  id: string;
  nome: string;
  codigo_interno: string | null;
  fotos?: string[];
  dimensoes?: string | null;
  largura_mm?: number | null;
  profundidade_mm?: number | null;
  altura_mm?: number | null;
  tempo_impressao_min: number;
  peso_peca_g: number;
  peso_suporte_g: number;
  peso_purga_g: number;
  peso_desperdicio_g: number;
  probabilidade_falha?: number | null;
  tecnologia?: 'fdm' | 'resina';
  material_recomendado_id?: string | null;
  impressora_recomendada_id?: string | null;
}

interface Variacao {
  id: string;
  nome: string;
  codigo: string | null;
  preco: number;
  estoque: number;
  cor_hex: string | null;
  cor_nome: string | null;
  foto: string | null;
  fotos: string[];
  modelo_id: string | null;
  tamanho: string | null;
  descricao: string | null;
  dimensoes: string | null;
  peso_g: number | null;
  status: string;
  venda_status: string;
  ordem: number;
  custo_atual: number | null;
  preco_sugerido: number | null;
  margem_calculada: number | null;
  lucro_calculado: number | null;
  calculo_snapshot: ResultadoCalculo | null;
  calculado_em: string | null;
  modelo?: ModeloRef | null;
}

interface ColecaoRef {
  id: string;
  nome: string;
  codigo: string | null;
}

interface CategoriaRef {
  id: string;
  nome: string;
  escopo?: string;
}

interface MaterialBaseRef {
  id: string;
  nome: string;
  tipo: string;
  unidade_consumo?: string | null;
  custo_medio?: number | null;
  custo_unitario?: number | null;
}

interface ImpressoraCalcRef extends ImpressoraComposicaoRef {
  perfil_energia_id: string | null;
}

interface CanalCalcRef {
  id: string;
  nome: string;
  taxa_marketplace: number;
  taxa_pagamento: number;
  comissao: number;
  custo_fixo_pedido?: number | null;
}

interface PerfilFiscalRef {
  id: string;
  padrao: boolean;
  aliquota_efetiva: number;
}

export function PaginaProdutoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { ativa, pode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const crudProduto = useCrud('produto', ['v_produto', 'variacao', 'produto_canal', 'composicao_item']);
  const [aba, setAba] = useState<Aba>('resumo');
  const [editandoProduto, setEditandoProduto] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const produto = useQuery({
    queryKey: ['v_produto', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_produto').select('*').eq('id', id).single();
      if (error) throw error;
      return data as ProdutoDetalhe;
    },
  });

  const composicao = useQuery({
    queryKey: ['composicao_item', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('composicao_item')
        .select(SELECAO_COMPOSICAO)
        .eq('produto_id', id)
        .is('deleted_at', null)
        .order('ordem');
      if (error) throw error;
      return data as unknown as ItemComposicao[];
    },
  });

  const variacoes = useQuery({
    queryKey: ['variacao', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variacao')
        .select('*, modelo:modelo_id (id, nome, codigo_interno, fotos, dimensoes, largura_mm, profundidade_mm, altura_mm, tecnologia, tempo_impressao_min, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g, probabilidade_falha, material_recomendado_id, impressora_recomendada_id)')
        .eq('produto_id', id)
        .is('deleted_at', null)
        .order('ordem')
        .order('nome');
      if (error) throw error;
      return data as Variacao[];
    },
  });

  const categorias = useLista<CategoriaRef>('categoria', { ordem: 'nome', desc: false });
  const colecoes = useLista<ColecaoRef>('colecao', { ordem: 'nome', desc: false });
  const materiais = useLista<MaterialBaseRef>('material', { ordem: 'nome', desc: false });

  const totalComposicao = useMemo(
    () => (composicao.data ?? []).reduce((s, item) => s + custoItemComposicao(item) * Number(item.quantidade), 0),
    [composicao.data],
  );

  async function salvarFotos(fotos: string[]) {
    const { error } = await supabase.from('produto').update({ fotos }).eq('id', id);
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ['v_produto'] });
  }

  async function aposMudarComposicao() {
    await qc.invalidateQueries({ queryKey: ['composicao_item', id] });
    const { data } = await supabase
      .from('composicao_item')
      .select(SELECAO_COMPOSICAO)
      .eq('produto_id', id)
      .is('deleted_at', null);
    const novoTotal = ((data ?? []) as unknown as ItemComposicao[])
      .reduce((s, it) => s + custoItemComposicao(it) * Number(it.quantidade), 0);
    await supabase.from('produto').update({ custo_atual: novoTotal }).eq('id', id);
    await qc.invalidateQueries({ queryKey: ['v_produto'] });
  }

  async function confirmarExclusaoProduto() {
    if (!produto.data) return;
    try {
      await crudProduto.excluir.mutateAsync(produto.data.id);
      setConfirmandoExclusao(false);
      navigate('/produtos');
    } catch (erro) {
      window.alert(mensagemErro(erro));
    }
  }

  async function salvarProdutoRapido(valores: Record<string, unknown>) {
    if (!pode('produtos', 'editar') || !id) return;
    const { error } = await supabase.from('produto').update(valores).eq('id', id);
    if (error) {
      window.alert(mensagemErro(error));
      return;
    }
    await qc.invalidateQueries({ queryKey: ['v_produto'] });
  }

  if (produto.isLoading || composicao.isLoading || variacoes.isLoading) return <Carregando />;
  if (produto.isError || !produto.data) return <EstadoErro onRetry={() => produto.refetch()} />;

  const p = produto.data;
  const skus = variacoes.data ?? [];
  const preco = mediaValores(skus.map((s) => Number(s.preco || s.preco_sugerido || 0)).filter((v) => v > 0));
  const custoMedio = mediaValores(skus.map((s) => Number(s.custo_atual || 0)).filter((v) => v > 0));
  const margens = skus.map((s) => margemVariacao(s)).filter((v): v is number => v != null);
  const margem = margens.length > 0 ? mediaValores(margens) : null;
  const estoqueLocal = skus.length > 0
    ? skus.reduce((s, v) => s + Number(v.estoque ?? 0), 0)
    : Number(p.estoque_pronto ?? 0);
  const pendencias = pendenciasProduto(p, skus, composicao.data ?? [], preco, margem, estoqueLocal);
  const categoria = categorias.data?.find((c) => c.id === p.categoria_id)?.nome;

  return (
    <div className="flex min-h-0 flex-col gap-4 xl:h-[calc(100dvh-112px)] xl:overflow-hidden">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-texto-2">Produtos / ficha mestre</p>
          <Entrada
            defaultValue={p.nome}
            disabled={!pode('produtos', 'editar')}
            className="!h-auto !border-0 !bg-transparent !px-0 !py-0 !text-2xl !font-extrabold !tracking-tight !text-ink shadow-none focus:!border-0"
            onBlur={(e) => e.target.value.trim() !== p.nome && salvarProdutoRapido({ nome: e.target.value.trim() || p.nome })}
          />
          <div className="mt-1 flex max-w-sm items-center gap-2">
            <Selecao
              value={p.colecao_id ?? ''}
              disabled={!pode('produtos', 'editar')}
              className="!h-8 !border-0 !bg-transparent !px-0 !py-0 !text-sm !font-bold !text-texto-2"
              onChange={(e) => salvarProdutoRapido({ colecao_id: e.target.value || null })}
            >
              <option value="">Sem colecao</option>
              {(colecoes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {p.sku && <Etiqueta>{p.sku}</Etiqueta>}
            <Etiqueta cor={p.status === 'ativo' ? 'verde' : p.status === 'rascunho' ? 'amarelo' : 'cinza'}>{p.status}</Etiqueta>
            <Etiqueta cor={p.disponibilidade === 'pronta_entrega' ? 'verde' : 'cinza'}>
              {p.disponibilidade === 'pronta_entrega' ? 'Pronta entrega' : 'Sob demanda'}
            </Etiqueta>
            <Etiqueta cor={pendencias.length ? 'amarelo' : 'verde'}>Cadastro {Math.max(0, 100 - pendencias.length * 12)}%</Etiqueta>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="acento" onClick={() => navigate(`/calculadora?produto=${p.id}`)}>
            <Icone d={ICONS.calc} /> Calcular preco
          </Botao>
          <Botao variante="secundario" onClick={() => navigate(`/calculadora?produto=${p.id}`)}>
            <Icone d={ICONS.doc} /> Criar orcamento
          </Botao>
          {pode('produtos', 'editar') && (
            <Botao variante="secundario" onClick={() => setEditandoProduto(true)}>
              <Icone d={ICONS.edit} /> Editar
            </Botao>
          )}
          {pode('produtos', 'excluir') && (
            <Botao variante="perigo" onClick={() => setConfirmandoExclusao(true)} disabled={crudProduto.excluir.isPending}>
              <Icone d={ICONS.trash} /> Excluir
            </Botao>
          )}
        </div>
      </section>

      <Abas<Aba>
        abas={[
          { id: 'resumo', rotulo: 'Resumo' },
          { id: 'composicao', rotulo: 'Composicao' },
          { id: 'canais', rotulo: 'Canais' },
          { id: 'historico', rotulo: 'Historico' },
        ]}
        ativa={aba}
        onTrocar={setAba}
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        {aba === 'resumo' && (
          <AbaResumo
            produto={p}
            categoria={categoria}
            categorias={(categorias.data ?? []).filter((c) => !c.escopo || c.escopo === 'produto')}
            materiais={materiais.data ?? []}
            preco={preco}
            custoMedio={custoMedio}
            margem={margem}
            estoqueLocal={estoqueLocal}
            variacoes={skus}
            colecoes={colecoes.data ?? []}
            composicao={composicao.data ?? []}
            totalComposicao={totalComposicao}
            pendencias={pendencias}
            onFotos={salvarFotos}
            onProdutoMudou={() => qc.invalidateQueries({ queryKey: ['v_produto'] })}
            onMudarVariacoes={() => qc.invalidateQueries({ queryKey: ['variacao', id] })}
          />
        )}
        {aba === 'composicao' && (
          <AbaComposicao
            produtoId={p.id}
            itens={composicao.data ?? []}
            total={totalComposicao}
            custosVisiveis={p.custos_visiveis}
            aoMudar={aposMudarComposicao}
          />
        )}
        {aba === 'canais' && <AbaPublicacoes produtoId={p.id} />}
        {aba === 'historico' && <AbaHistoricoProduto produtoId={p.id} />}
      </main>

      <ModalEditarProduto
        produto={p}
        aberto={editandoProduto}
        onFechar={() => setEditandoProduto(false)}
        onSalvo={() => {
          setEditandoProduto(false);
          qc.invalidateQueries({ queryKey: ['v_produto'] });
        }}
      />
      <Modal aberto={confirmandoExclusao} titulo="Excluir produto" onFechar={() => setConfirmandoExclusao(false)}>
        <div className="space-y-4">
          <div className="rounded-xl border border-erro/20 bg-erro/5 p-3">
            <p className="text-sm font-extrabold text-ink">Tem certeza que deseja excluir este produto?</p>
            <p className="mt-1 text-sm text-texto-2">Produto: {p.nome}</p>
            <p className="mt-2 text-xs text-texto-2">
              Ele deixara de aparecer nas listas e buscas, mas o registro sera mantido internamente como excluido.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Botao
              type="button"
              variante="secundario"
              onClick={() => setConfirmandoExclusao(false)}
              disabled={crudProduto.excluir.isPending}
            >
              Cancelar
            </Botao>
            <Botao
              type="button"
              variante="perigo"
              onClick={confirmarExclusaoProduto}
              disabled={crudProduto.excluir.isPending}
            >
              {crudProduto.excluir.isPending ? 'Excluindo...' : 'Excluir produto'}
            </Botao>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AbaResumo({
  produto,
  categoria,
  categorias,
  materiais,
  preco,
  custoMedio,
  margem,
  estoqueLocal,
  variacoes,
  colecoes,
  composicao,
  totalComposicao,
  pendencias,
  onFotos,
  onProdutoMudou,
  onMudarVariacoes,
}: {
  produto: ProdutoDetalhe;
  categoria?: string | null;
  categorias: CategoriaRef[];
  materiais: MaterialBaseRef[];
  preco: number;
  custoMedio: number;
  margem: number | null;
  estoqueLocal: number;
  variacoes: Variacao[];
  colecoes: ColecaoRef[];
  composicao: ItemComposicao[];
  totalComposicao: number;
  pendencias: string[];
  onFotos: (fotos: string[]) => Promise<void>;
  onProdutoMudou: () => void;
  onMudarVariacoes: () => void;
}) {
  const { ativa, formato, pode } = useAuth();
  const [novaColecao, setNovaColecao] = useState(false);
  const [novaCor, setNovaCor] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const podeEditar = pode('produtos', 'editar');

  async function salvarProduto(valores: Record<string, unknown>) {
    if (!podeEditar) return;
    setErro(null);
    const { error } = await supabase.from('produto').update(valores).eq('id', produto.id);
    if (error) {
      setErro(mensagemErro(error));
      return;
    }
    onProdutoMudou();
  }

  async function criarColecao(nome: string) {
    if (!ativa?.tenant_id || !nome.trim()) return;
    const codigo = abreviarSku(nome, 'COL');
    const { data, error } = await supabase
      .from('colecao')
      .insert({ tenant_id: ativa.tenant_id, nome: nome.trim(), codigo })
      .select('id')
      .single();
    if (error) {
      setErro(mensagemErro(error));
      return;
    }
    await salvarProduto({ colecao_id: data.id });
    setNovaColecao(false);
  }

  async function salvarCor(nome: string, hex: string) {
    if (!nome.trim()) return;
    await salvarProduto({ cores: [...(produto.cores ?? []), { nome: nome.trim(), hex }] });
    setNovaCor(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <GaleriaFotos
          fotos={produto.fotos ?? []}
          prefixo={`produtos/${produto.id}`}
          podeEditar={pode('produtos', 'editar')}
          onChange={onFotos}
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ResumoMetrica rotulo="Preco base" valor={preco > 0 ? <Dinheiro centavos={preco} /> : '-'} destaque />
            <ResumoMetrica rotulo="Custo medio" valor={custoMedio > 0 ? <Dinheiro centavos={custoMedio} /> : '-'} />
            <ResumoMetrica rotulo="Margem media" valor={margem != null ? percentual(margem, formato) : '-'} />
            <ResumoMetrica rotulo="Estoque" valor={estoqueLocal.toLocaleString()} />
          </div>

          <Cartao>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-ink">Informacoes do produto</h2>
                <p className="text-xs text-texto-2">Ficha mestre editavel diretamente no resumo.</p>
              </div>
              <Etiqueta cor={pendencias.length ? 'amarelo' : 'verde'}>
                {pendencias.length ? `${pendencias.length} pendencias` : 'Completo'}
              </Etiqueta>
            </div>
            {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}
            <div className="grid gap-3 lg:grid-cols-3">
              <Campo rotulo="Nome">
                <Entrada
                  defaultValue={produto.nome}
                  disabled={!podeEditar}
                  className="!h-11 !text-lg !font-extrabold"
                  onBlur={(e) => e.target.value.trim() !== produto.nome && salvarProduto({ nome: e.target.value.trim() || produto.nome })}
                />
              </Campo>
              <Campo rotulo="Colecao">
                <div className="flex gap-2">
                  <Selecao
                    value={produto.colecao_id ?? ''}
                    disabled={!podeEditar}
                    onChange={(e) => salvarProduto({ colecao_id: e.target.value || null })}
                  >
                    <option value="">Sem colecao</option>
                    {colecoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </Selecao>
                  {podeEditar && <Botao type="button" variante="secundario" onClick={() => setNovaColecao(true)}>+</Botao>}
                </div>
              </Campo>
              <Campo rotulo="Categoria">
                <Selecao
                  value={produto.categoria_id ?? ''}
                  disabled={!podeEditar}
                  onChange={(e) => salvarProduto({ categoria_id: e.target.value || null })}
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="Status">
                <Selecao
                  value={produto.status}
                  disabled={!podeEditar}
                  onChange={(e) => salvarProduto({ status: e.target.value })}
                >
                  <option value="ativo">Ativo</option>
                  <option value="rascunho">Rascunho</option>
                  <option value="arquivado">Arquivado</option>
                </Selecao>
              </Campo>
              <Campo rotulo="Disponibilidade">
                <Selecao
                  value={produto.disponibilidade}
                  disabled={!podeEditar}
                  onChange={(e) => salvarProduto({ disponibilidade: e.target.value })}
                >
                  <option value="sob_demanda">Sob demanda</option>
                  <option value="pronta_entrega">Pronta entrega</option>
                </Selecao>
              </Campo>
              <Campo rotulo="Material base">
                <Selecao
                  value={produto.material_principal ?? ''}
                  disabled={!podeEditar}
                  onChange={(e) => salvarProduto({ material_principal: e.target.value || null })}
                >
                  <option value="">Sem material</option>
                  {materiais
                    .filter((m) => ['filamento', 'resina'].includes(m.tipo))
                    .map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                </Selecao>
              </Campo>
            </div>
            <div className="mt-3">
              <Campo rotulo="Cores">
                <div className="flex flex-wrap items-center gap-2">
                  {(produto.cores ?? []).map((cor, indice) => (
                    <span key={`${cor.nome}-${indice}`} className="inline-flex items-center gap-1.5 rounded-full border border-borda bg-white px-2 py-1 text-xs font-semibold text-ink">
                      <Swatch hex={cor.hex} nome={cor.nome} tamanho="size-4" />
                      {cor.nome}
                    </span>
                  ))}
                  {podeEditar && <Botao type="button" variante="secundario" className="!px-2.5 !py-1.5 !text-xs" onClick={() => setNovaCor(true)}>+ Adicionar cor</Botao>}
                  {(produto.cores ?? []).length === 0 && !podeEditar && <Etiqueta cor="cinza">Sem cores</Etiqueta>}
                </div>
              </Campo>
            </div>
            <div className="mt-3">
              <Campo rotulo="Descricao do produto">
                <textarea
                  defaultValue={produto.descricao ?? ''}
                  disabled={!podeEditar}
                  rows={3}
                  className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm text-ink disabled:bg-surface-2"
                  onBlur={(e) => e.target.value !== (produto.descricao ?? '') && salvarProduto({ descricao: e.target.value || null })}
                />
              </Campo>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {categoria && <Etiqueta>{categoria}</Etiqueta>}
              {(produto.tags ?? []).map((tag) => <Etiqueta key={tag}>{tag}</Etiqueta>)}
            </div>
          </Cartao>
        </div>
      </div>

      <VariacoesOperacionais
        produto={produto}
        variacoes={variacoes}
        colecoes={colecoes}
        composicao={composicao}
        totalComposicao={totalComposicao}
        onMudar={onMudarVariacoes}
      />
      <ModalNovaColecao aberto={novaColecao} onFechar={() => setNovaColecao(false)} onSalvar={criarColecao} />
      <ModalNovaCor aberto={novaCor} onFechar={() => setNovaCor(false)} onSalvar={salvarCor} />
    </div>
  );
}

function ModalNovaColecao({
  aberto,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  onFechar: () => void;
  onSalvar: (nome: string) => void;
}) {
  const [nome, setNome] = useState('');
  return (
    <Modal aberto={aberto} titulo="Nova colecao" onFechar={onFechar}>
      <div className="space-y-3">
        <Campo rotulo="Nome da colecao">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao type="button" onClick={() => { onSalvar(nome); setNome(''); }}>Salvar colecao</Botao>
        </div>
      </div>
    </Modal>
  );
}

function ModalNovaCor({
  aberto,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  onFechar: () => void;
  onSalvar: (nome: string, hex: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [hex, setHex] = useState('#b9a0e8');
  return (
    <Modal aberto={aberto} titulo="Adicionar cor" onFechar={onFechar}>
      <div className="space-y-3">
        <Campo rotulo="Nome da cor">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Bege, lilas, preto..." autoFocus />
        </Campo>
        <Campo rotulo="Codigo da cor">
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-borda bg-white p-1"
          />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao type="button" onClick={() => { onSalvar(nome, hex); setNome(''); }}>Adicionar cor</Botao>
        </div>
      </div>
    </Modal>
  );
}

function VariacoesOperacionais({
  produto,
  variacoes,
  colecoes,
  composicao,
  totalComposicao,
  onMudar,
}: {
  produto: ProdutoDetalhe;
  variacoes: Variacao[];
  colecoes: ColecaoRef[];
  composicao: ItemComposicao[];
  totalComposicao: number;
  onMudar: () => void;
}) {
  const { ativa, formato, pode } = useAuth();
  const modelos = useLista<ModeloRef>('modelo_3d', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, codigo_interno, fotos, dimensoes, largura_mm, profundidade_mm, altura_mm, tecnologia, tempo_impressao_min, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g, probabilidade_falha, material_recomendado_id, impressora_recomendada_id',
  });
  const materiais = useLista<MaterialBaseRef>('material', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, tipo, unidade_consumo, custo_medio, custo_unitario',
  });
  const [detalhe, setDetalhe] = useState<Partial<Variacao> | null>(null);
  const [calculando, setCalculando] = useState<Variacao | null>(null);
  const [gerandoModelos, setGerandoModelos] = useState(false);
  const [excluindo, setExcluindo] = useState<Variacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const podeEditar = pode('produtos', 'editar');
  const colecao = colecoes.find((c) => c.id === produto.colecao_id) ?? null;
  const tamanhosPadrao = ['Unico', 'PP', 'P', 'M', 'G', 'GG'];
  const materiaisPorId = useMemo(() => new Map((materiais.data ?? []).map((m) => [m.id, m])), [materiais.data]);
  const estoqueTotal = variacoes.reduce((s, v) => s + Number(v.estoque ?? 0), 0);

  async function salvarCampo(id: string, valores: Record<string, unknown>) {
    setErro(null);
    const { error } = await supabase.from('variacao').update(valores).eq('id', id).eq('produto_id', produto.id);
    if (error) {
      setErro(mensagemErro(error));
      return;
    }
    onMudar();
  }

  async function adicionarVariacao(tamanho: string) {
    if (!ativa?.tenant_id) return;
    const nome = tamanho === 'Unico' ? 'Tamanho unico' : `Tamanho ${tamanho}`;
    const codigo = gerarSkuVariacao(produto, colecao, { tamanho, cor_nome: null }, variacoes);
    const { error } = await supabase.from('variacao').insert({
      tenant_id: ativa.tenant_id,
      produto_id: produto.id,
      nome,
      tamanho,
      codigo,
      preco: produto.preco_praticado || produto.preco_sugerido || 0,
      estoque: 0,
      venda_status: 'sob_encomenda',
      status: 'ativo',
      ordem: variacoes.length + 1,
    });
    if (error) setErro(mensagemErro(error));
    else onMudar();
  }

  async function confirmarExclusaoVariacao() {
    if (!excluindo) return;
    await salvarCampo(excluindo.id, { deleted_at: new Date().toISOString() });
    setExcluindo(null);
  }

  return (
    <Cartao>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-ink">Variacoes</h2>
          <p className="text-xs text-texto-2">
            Tamanhos/dimensoes vendaveis com SKU unico, estoque, preco, status comercial e modelo 3D vinculado.
          </p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" onClick={() => setGerandoModelos(true)}>
              <Icone d={ICONS.cube} /> Gerar dos modelos 3D
            </Botao>
            {tamanhosPadrao.map((tamanho) => (
              <Botao key={tamanho} variante="secundario" className="!px-2.5 !py-1.5 !text-xs" onClick={() => adicionarVariacao(tamanho)}>
                + {tamanho}
              </Botao>
            ))}
          </div>
        )}
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <ResumoMetrica rotulo="Variacoes" valor={variacoes.length} />
        <ResumoMetrica rotulo="Estoque total" valor={estoqueTotal.toLocaleString()} />
        <ResumoMetrica rotulo="Composicao" valor={totalComposicao > 0 ? <Dinheiro centavos={totalComposicao} /> : '-'} />
      </div>

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      {variacoes.length === 0 ? (
        <EstadoVazio mensagem="Adicione tamanho unico ou variacoes PP/P/M/G/GG para vender este produto." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borda bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda bg-surface-2/70 text-left">
                {['Variacao', 'SKU', 'Modelo 3D', 'Material', 'Dimensoes', 'Peso', 'Custo', 'Estoque', 'Status venda', 'Preco', 'Status', ''].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-borda/70">
              {variacoes.map((v) => (
                <tr key={v.id} className="hover:bg-surface-2/50">
                  <td className="min-w-56 px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      {(v.fotos?.[0] ?? v.foto) ? (
                        <Foto path={v.fotos?.[0] ?? v.foto!} alt={v.nome} className="size-9 rounded-lg object-cover" />
                      ) : v.cor_hex ? (
                        <Swatch hex={v.cor_hex} nome={v.nome} tamanho="size-5" />
                      ) : (
                        <span className="size-9 rounded-lg bg-surface-2" />
                      )}
                      <div className="grid min-w-0 grid-cols-[1fr_72px] gap-1">
                        <Entrada
                          defaultValue={v.nome}
                          disabled={!podeEditar}
                          className="!py-1 !text-xs"
                          onBlur={(e) => e.target.value !== v.nome && salvarCampo(v.id, { nome: e.target.value || 'Variacao' })}
                        />
                        <Entrada
                          defaultValue={v.tamanho ?? ''}
                          disabled={!podeEditar}
                          placeholder="Tam."
                          className="!py-1 !text-xs"
                          onBlur={(e) => e.target.value !== (v.tamanho ?? '') && salvarCampo(v.id, { tamanho: e.target.value || null })}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="min-w-44 px-2.5 py-2">
                    <Entrada
                      defaultValue={v.codigo ?? gerarSkuVariacao(produto, colecao, v, variacoes)}
                      disabled={!podeEditar}
                      className="!py-1 font-mono !text-xs"
                      onBlur={(e) => e.target.value !== (v.codigo ?? '') && salvarCampo(v.id, { codigo: normalizarSku(e.target.value) })}
                    />
                  </td>
                  <td className="min-w-52 px-2.5 py-2">
                    <Selecao
                      defaultValue={v.modelo_id ?? ''}
                      disabled={!podeEditar}
                      className="!py-1 !text-xs"
                      onChange={(e) => salvarCampo(v.id, { modelo_id: e.target.value || null })}
                    >
                      <option value="">Sem modelo</option>
                      {(modelos.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </Selecao>
                  </td>
                  <td className="min-w-32 px-2.5 py-2 text-xs font-semibold text-texto-2">
                    {materialModelo(v.modelo, materiaisPorId, produto) || '-'}
                  </td>
                  <td className="min-w-36 px-2.5 py-2 text-xs font-semibold text-texto-2">
                    {dimensoesModelo(v.modelo) || v.dimensoes || '-'}
                  </td>
                  <td className="min-w-24 px-2.5 py-2 text-xs font-semibold tabular-nums text-texto-2">
                    {pesoModelo(v.modelo) > 0 ? `${pesoModelo(v.modelo).toLocaleString(formato.locale)} g` : v.peso_g ? `${v.peso_g} g` : '-'}
                  </td>
                  <td className="min-w-28 px-2.5 py-2 text-right text-xs font-bold tabular-nums text-ink">
                    {v.custo_atual ? <Dinheiro centavos={v.custo_atual} /> : '-'}
                  </td>
                  <td className="w-24 px-2.5 py-2">
                    <Entrada
                      type="number"
                      min="0"
                      defaultValue={v.estoque}
                      disabled={!podeEditar}
                      className="!py-1 text-right !text-xs"
                      onBlur={(e) => Number(e.target.value) !== Number(v.estoque) && salvarCampo(v.id, { estoque: Number(e.target.value || 0) })}
                    />
                  </td>
                  <td className="min-w-36 px-2.5 py-2">
                    <Selecao
                      defaultValue={v.venda_status ?? 'sob_encomenda'}
                      disabled={!podeEditar}
                      className="!py-1 !text-xs"
                      onChange={(e) => salvarCampo(v.id, { venda_status: e.target.value })}
                    >
                      <option value="em_estoque">Em estoque</option>
                      <option value="pre_venda">Pre-venda</option>
                      <option value="sob_encomenda">Sob encomenda</option>
                    </Selecao>
                  </td>
                  <td className="min-w-32 px-2.5 py-2">
                    <Entrada
                      defaultValue={deCentavos(v.preco ?? 0)}
                      disabled={!podeEditar}
                      className="!py-1 text-right !text-xs"
                      onBlur={(e) => paraCentavos(e.target.value) !== Number(v.preco ?? 0) && salvarCampo(v.id, { preco: paraCentavos(e.target.value) })}
                    />
                  </td>
                  <td className="min-w-28 px-2.5 py-2">
                    <Selecao
                      defaultValue={v.status ?? 'ativo'}
                      disabled={!podeEditar}
                      className="!py-1 !text-xs"
                      onChange={(e) => salvarCampo(v.id, { status: e.target.value })}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="rascunho">Rascunho</option>
                      <option value="arquivado">Arquivado</option>
                    </Selecao>
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Botao variante="fantasma" className="!px-2 !py-1 !text-xs" onClick={() => setDetalhe(v)}>Detalhes</Botao>
                      {podeEditar && <Botao variante="fantasma" className="!px-2 !py-1 !text-xs" onClick={() => setCalculando(v)}>Calcular</Botao>}
                      {podeEditar && <Botao variante="perigo" className="!px-2 !py-1 !text-xs" onClick={() => setExcluindo(v)}>Excluir</Botao>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalSku produtoId={produto.id} sku={detalhe} onFechar={() => setDetalhe(null)} onSalvo={() => { setDetalhe(null); onMudar(); }} />
      <ModalCalculoVariacao
        produto={produto}
        variacao={calculando}
        composicao={composicao}
        onFechar={() => setCalculando(null)}
        onSalvo={() => { setCalculando(null); onMudar(); }}
      />
      <ModalSkusModelos
        aberto={gerandoModelos}
        produtoId={produto.id}
        produto={produto}
        colecao={colecao}
        variacoes={variacoes}
        onFechar={() => setGerandoModelos(false)}
        onSalvo={() => { setGerandoModelos(false); onMudar(); }}
      />
      <Modal aberto={!!excluindo} titulo="Excluir variacao" onFechar={() => setExcluindo(null)}>
        <div className="space-y-4">
          <div className="rounded-xl border border-erro/20 bg-erro/5 p-3">
            <p className="text-sm font-extrabold text-ink">Tem certeza que deseja excluir esta variacao?</p>
            <p className="mt-1 text-sm text-texto-2">{excluindo?.nome}</p>
            <p className="mt-2 text-xs text-texto-2">
              Ela deixara de aparecer na ficha do produto, mantendo o registro interno como excluido.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setExcluindo(null)}>Cancelar</Botao>
            <Botao type="button" variante="perigo" onClick={confirmarExclusaoVariacao}>Excluir variacao</Botao>
          </div>
        </div>
      </Modal>
    </Cartao>
  );
}

function ModalCalculoVariacao({
  produto,
  variacao,
  composicao,
  onFechar,
  onSalvo,
}: {
  produto: ProdutoDetalhe;
  variacao: Variacao | null;
  composicao: ItemComposicao[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const { ativa, formato } = useAuth();
  const materiais = useLista<MaterialComposicaoRef>('material', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, tipo, unidade_consumo, custo_medio, custo_unitario',
  });
  const impressoras = useLista<ImpressoraCalcRef>('impressora', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, valor_aquisicao, vida_util_horas, consumo_w, manutencao_hora, perfil_energia_id',
  });
  const energias = useLista<{ id: string; tarifa_kwh: number }>('perfil_energia', {
    ordem: 'created_at',
    desc: false,
    selecao: 'id, tarifa_kwh',
  });
  const canais = useLista<CanalCalcRef>('canal_venda', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, taxa_marketplace, taxa_pagamento, comissao, custo_fixo_pedido',
  });
  const fiscais = useLista<PerfilFiscalRef>('perfil_fiscal', {
    ordem: 'padrao',
    desc: true,
    selecao: 'id, padrao, aliquota_efetiva',
  });
  const custosFixos = useLista<{ id: string; valor_mensal: number; ativo: boolean; ratear?: boolean }>('custo_fixo', {
    ordem: 'created_at',
    desc: false,
    selecao: 'id, valor_mensal, ativo, ratear',
  });
  const margemInicial = Math.round((variacao?.margem_calculada ?? tenantCenarioPadrao(ativa).margem) * 100);
  const [margemPct, setMargemPct] = useState(margemInicial);
  const [canalId, setCanalId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setMargemPct(Math.round((variacao?.margem_calculada ?? tenantCenarioPadrao(ativa).margem) * 100));
    setCanalId('');
    setErro(null);
    setSalvando(false);
  }, [ativa, variacao?.id, variacao?.margem_calculada]);

  const entradas = useMemo(() => {
    if (!variacao) return null;
    return montarEntradasVariacao({
      produto,
      variacao,
      composicao,
      materiais: materiais.data ?? [],
      impressoras: impressoras.data ?? [],
      energias: energias.data ?? [],
      canal: (canais.data ?? []).find((c) => c.id === canalId) ?? null,
      fiscal: (fiscais.data ?? []).find((f) => f.padrao) ?? (fiscais.data ?? [])[0] ?? null,
      custosFixos: custosFixos.data ?? [],
      ativa,
      margem: Math.min(0.95, Math.max(0, margemPct / 100)),
    });
  }, [
    ativa,
    canalId,
    canais.data,
    composicao,
    custosFixos.data,
    energias.data,
    fiscais.data,
    impressoras.data,
    margemPct,
    materiais.data,
    produto,
    variacao,
  ]);

  const resultado = useMemo(() => entradas ? calcular(entradas) : null, [entradas]);

  async function salvarCalculo() {
    if (!variacao || !resultado) return;
    setSalvando(true);
    setErro(null);
    const { error } = await supabase
      .from('variacao')
      .update({
        custo_atual: resultado.custoUnitario,
        preco_sugerido: resultado.precoUnitario,
        preco: resultado.precoUnitario,
        margem_calculada: resultado.margem,
        lucro_calculado: resultado.lucro,
        calculo_snapshot: resultado,
        calculado_em: new Date().toISOString(),
      })
      .eq('id', variacao.id)
      .eq('produto_id', produto.id);
    setSalvando(false);
    if (error) {
      setErro(mensagemErro(error));
      return;
    }
    onSalvo();
  }

  return (
    <Modal aberto={!!variacao} titulo={`Calcular ${variacao?.nome ?? 'variacao'}`} onFechar={onFechar} largura="max-w-5xl">
      {!variacao || !resultado ? (
        <Carregando />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <ResumoMetrica rotulo="Custo unitario" valor={moeda(resultado.custoUnitario, formato)} />
            <ResumoMetrica rotulo="Preco sugerido" valor={moeda(resultado.precoUnitario, formato)} destaque />
            <ResumoMetrica rotulo="Lucro liquido" valor={moeda(resultado.lucro, formato)} />
            <ResumoMetrica rotulo="Margem liquida" valor={percentual(resultado.margem, formato)} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Campo rotulo="Margem desejada">
              <div className="flex items-center gap-2">
                <Entrada
                  type="number"
                  min="0"
                  max="95"
                  step="1"
                  value={margemPct}
                  onChange={(e) => setMargemPct(Number(e.target.value || 0))}
                />
                <span className="text-sm font-bold text-texto-2">%</span>
              </div>
            </Campo>
            <Campo rotulo="Canal/taxas">
              <Selecao value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                <option value="">Sem canal</option>
                {(canais.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Origem do custo">
              <div className="rounded-lg border border-borda bg-surface-2 px-3 py-2 text-sm font-semibold text-ink">
                {variacao.modelo ? variacao.modelo.nome : 'Sem modelo 3D'} + composicao
              </div>
            </Campo>
          </div>

          {resultado.alertas.length > 0 && (
            <div className="rounded-xl border border-aviso/30 bg-aviso/10 p-3">
              <p className="text-xs font-extrabold uppercase text-aviso">Alertas</p>
              <div className="mt-2 space-y-1">
                {resultado.alertas.map((alerta) => <p key={alerta} className="text-sm text-ink">{alerta}</p>)}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-borda bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda bg-surface-2/70 text-left">
                  {['Item', 'Explicacao', 'Total'].map((h) => (
                    <th key={h} className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda/70">
                {resultado.itens.map((item) => (
                  <tr key={item.chave}>
                    <td className="px-3 py-2 font-bold text-ink">{item.descricao}</td>
                    <td className="max-w-xl px-3 py-2 text-xs text-texto-2">{item.explicacao}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-ink">{moeda(item.total, formato)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={onFechar} disabled={salvando}>Cancelar</Botao>
            <Botao type="button" onClick={salvarCalculo} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar valor na variacao'}
            </Botao>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ModalSku({
  produtoId,
  sku,
  onFechar,
  onSalvo,
}: {
  produtoId: string;
  sku: Partial<Variacao> | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const { ativa } = useAuth();
  const tenantId = useTenantId();
  const modelos = useLista<ModeloRef>('modelo_3d', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, codigo_interno, fotos, dimensoes, largura_mm, profundidade_mm, altura_mm, tempo_impressao_min, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g',
  });
  const [corHex, setCorHex] = useState<string | null>(sku?.cor_hex ?? null);
  const [fotos, setFotos] = useState<string[]>(sku?.fotos?.length ? sku.fotos : sku?.foto ? [sku.foto] : []);
  const [skuAutomatico, setSkuAutomatico] = useState(!sku?.id);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function anexarFoto(arquivos: FileList | null) {
    if (!arquivos?.[0] || !tenantId) return;
    setEnviando(true);
    setErro(null);
    try {
      const path = await enviarFoto(tenantId, `produtos/${produtoId}/variacoes`, arquivos[0]);
      setFotos((atuais) => [...atuais, path]);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sku) return;
    const f = new FormData(e.currentTarget);
    const valores = {
      tenant_id: ativa?.tenant_id,
      produto_id: produtoId,
      nome: f.get('nome') as string,
      codigo: (f.get('codigo') as string) || null,
      modelo_id: (f.get('modelo_id') as string) || null,
      tamanho: (f.get('tamanho') as string) || null,
      preco: paraCentavos(f.get('preco') as string),
      estoque: Number(f.get('estoque') || 0),
      status: f.get('status') as string,
      venda_status: f.get('venda_status') as string,
      cor_nome: (f.get('cor_nome') as string) || null,
      cor_hex: corHex,
      foto: fotos[0] ?? null,
      fotos,
      dimensoes: (f.get('dimensoes') as string) || null,
      peso_g: f.get('peso_g') ? Number(f.get('peso_g')) : null,
      descricao: (f.get('descricao') as string) || null,
    };
    const { error } = sku.id
      ? await supabase.from('variacao').update(valores).eq('id', sku.id)
      : await supabase.from('variacao').insert(valores);
    if (error) setErro(mensagemErro(error));
    else onSalvo();
  }

  return (
    <Modal aberto={!!sku} titulo={sku?.id ? 'Detalhes da variacao' : 'Nova variacao'} onFechar={onFechar} largura="max-w-3xl">
      {sku && (
        <form onSubmit={salvar} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px]">
          <div className="space-y-3">
            <Campo rotulo="Nome da variacao">
              <Entrada name="nome" required defaultValue={sku.nome ?? ''} placeholder="Ex.: P branco, M rosa, kit dourado" />
            </Campo>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Campo rotulo="SKU">
                <Entrada name="codigo" defaultValue={sku.codigo ?? gerarSkuBase([])} readOnly={skuAutomatico && !sku.id} />
              </Campo>
              <Campo rotulo="Automatico">
                <label className="flex h-10 items-center gap-2 rounded-lg border border-borda px-3 text-sm font-semibold text-ink">
                  <input type="checkbox" checked={skuAutomatico} onChange={(e) => setSkuAutomatico(e.target.checked)} />
                  SKU automatico
                </label>
              </Campo>
              <Campo rotulo="Tamanho">
                <Entrada name="tamanho" defaultValue={sku.tamanho ?? ''} placeholder="P, M, G" />
              </Campo>
              <Campo rotulo="Status">
                <Selecao name="status" defaultValue={sku.status ?? 'ativo'}>
                  <option value="ativo">Ativo</option>
                  <option value="rascunho">Rascunho</option>
                  <option value="arquivado">Arquivado</option>
                </Selecao>
              </Campo>
            </div>
            <Campo rotulo="Status de venda">
              <Selecao name="venda_status" defaultValue={sku.venda_status ?? 'sob_encomenda'}>
                <option value="em_estoque">Em estoque</option>
                <option value="pre_venda">Pre-venda</option>
                <option value="sob_encomenda">Sob encomenda</option>
              </Selecao>
            </Campo>
            <div className="grid gap-3 md:grid-cols-2">
              <Campo rotulo="Modelo 3D tecnico">
                <Selecao name="modelo_id" defaultValue={sku.modelo_id ?? ''}>
                  <option value="">-</option>
                  {(modelos.data ?? []).map((m) => <option key={m.id} value={m.id}>{[m.codigo_interno, m.nome].filter(Boolean).join(' - ')}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="Nome da cor">
                <Entrada name="cor_nome" defaultValue={sku.cor_nome ?? ''} placeholder="Branco, Rosa, Dourado..." />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Campo rotulo="Cor">
                <input
                  type="color"
                  value={corHex ?? '#cccccc'}
                  onChange={(e) => setCorHex(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-lg border border-borda bg-white p-1"
                />
              </Campo>
              <Campo rotulo="Preco">
                <EntradaDinheiro name="preco" defaultCentavos={sku.preco ?? 0} />
              </Campo>
              <Campo rotulo="Estoque inicial">
                <Entrada name="estoque" type="number" min="0" defaultValue={sku.estoque ?? 0} />
              </Campo>
              <Campo rotulo="Peso (g)">
                <Entrada name="peso_g" type="number" min="0" step="any" defaultValue={sku.peso_g ?? ''} />
              </Campo>
            </div>
            <Campo rotulo="Dimensoes">
              <Entrada name="dimensoes" defaultValue={sku.dimensoes ?? ''} placeholder="12 x 12 x 10 cm" />
            </Campo>
            <Campo rotulo="Descricao">
              <textarea name="descricao" rows={2} defaultValue={sku.descricao ?? ''} className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
            </Campo>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => anexarFoto(e.target.files)} />
            {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={onFechar}>Cancelar</Botao>
              <Botao type="submit">Salvar variacao</Botao>
            </div>
          </div>
          <aside className="rounded-xl border border-borda bg-surface-2 p-3">
            <p className="text-[11px] font-extrabold uppercase text-texto-2">Preview</p>
            <div className="mt-3 rounded-xl border border-borda bg-white p-3">
              {fotos[0] ? <Foto path={fotos[0]} alt="" className="aspect-square w-full rounded-lg object-cover" /> : <div className="aspect-square rounded-lg bg-surface-2" />}
              <p className="mt-3 truncate text-sm font-extrabold text-ink">{sku.nome || 'Nova variacao'}</p>
              <p className="text-xs font-semibold text-texto-2">{sku.codigo || 'SKU automatico'}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                <Etiqueta cor="verde">Vendavel</Etiqueta>
                {fotos.length === 0 && <Etiqueta cor="amarelo">Sem foto</Etiqueta>}
              </div>
            </div>
            <Botao type="button" variante="secundario" disabled={enviando} className="mt-3 w-full" onClick={() => inputRef.current?.click()}>
              {enviando ? 'Enviando...' : '+ Foto da variacao'}
            </Botao>
          </aside>
        </form>
      )}
    </Modal>
  );
}

function ModalSkusModelos({
  aberto,
  produtoId,
  produto,
  colecao,
  variacoes,
  onFechar,
  onSalvo,
}: {
  aberto: boolean;
  produtoId: string;
  produto: ProdutoDetalhe;
  colecao: ColecaoRef | null;
  variacoes: Variacao[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const { ativa } = useAuth();
  const modelos = useLista<ModeloRef>('modelo_3d', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, codigo_interno, fotos, dimensoes, largura_mm, profundidade_mm, altura_mm, tempo_impressao_min, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g',
  });
  const vinculados = useMemo(() => new Set(variacoes.map((v) => v.modelo_id).filter(Boolean)), [variacoes]);
  const disponiveis = (modelos.data ?? []).filter((m) => !vinculados.has(m.id));
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function alternar(id: string, ativo: boolean) {
    setSelecionados((atuais) => ativo ? [...atuais, id] : atuais.filter((x) => x !== id));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const modelosSelecionados = disponiveis.filter((m) => selecionados.includes(m.id));
      const linhas = modelosSelecionados.map((m, indice) => ({
        tenant_id: ativa?.tenant_id,
        produto_id: produtoId,
        nome: m.nome,
        codigo: gerarSkuVariacao(produto, colecao, { tamanho: tamanhoModelo(m), cor_nome: null, modelo_id: m.id }, [
          ...variacoes,
          ...modelosSelecionados.slice(0, indice).map((modelo, i) => ({
            id: modelo.id,
            codigo: gerarSkuModelo(modelo, variacoes.length + i),
          } as Variacao)),
        ]),
        modelo_id: m.id,
        tamanho: tamanhoModelo(m),
        preco: 0,
        estoque: 0,
        status: 'ativo',
        venda_status: 'sob_encomenda',
        ordem: variacoes.length + indice + 1,
        cor_nome: null,
        cor_hex: null,
        foto: m.fotos?.[0] ?? null,
        fotos: m.fotos ?? [],
        dimensoes: tamanhoModelo(m),
        peso_g: pesoModelo(m),
      }));
      if (linhas.length > 0) {
        const { error } = await supabase.from('variacao').insert(linhas);
        if (error) throw error;
      }
      setSelecionados([]);
      onSalvo();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo="Gerar variacoes dos modelos 3D" onFechar={onFechar} largura="max-w-4xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm text-texto-2">
          Selecione modelos 3D cadastrados. Cada modelo vira uma variacao vendavel ligada ao arquivo tecnico, mantendo peso, dimensoes e foto base.
        </p>
        <Etiqueta>{selecionados.length} selecionados</Etiqueta>
      </div>
      {disponiveis.length === 0 ? (
        <EstadoVazio mensagem="Todos os modelos 3D disponiveis ja estao vinculados a variacoes deste produto." />
      ) : (
        <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-borda">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda bg-surface-2 text-left">
                <th className="px-3 py-2 text-[10px] font-extrabold uppercase text-texto-2">Usar</th>
                <th className="px-3 py-2 text-[10px] font-extrabold uppercase text-texto-2">Modelo 3D</th>
                <th className="px-3 py-2 text-[10px] font-extrabold uppercase text-texto-2">Dimensoes</th>
                <th className="px-3 py-2 text-[10px] font-extrabold uppercase text-texto-2">Peso</th>
                <th className="px-3 py-2 text-[10px] font-extrabold uppercase text-texto-2">SKU sugerido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda/70">
              {disponiveis.map((m, i) => (
                <tr key={m.id} className="hover:bg-surface-2/60">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selecionados.includes(m.id)} onChange={(e) => alternar(m.id, e.target.checked)} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {m.fotos?.[0] ? <Foto path={m.fotos[0]} alt={m.nome} className="size-10 rounded-lg object-cover" /> : <span className="size-10 rounded-lg bg-surface-2" />}
                      <span>
                        <span className="block font-extrabold text-ink">{m.nome}</span>
                        <span className="block text-[11px] text-texto-2">{m.codigo_interno ?? 'Sem codigo tecnico'}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-texto-2">{tamanhoModelo(m) || '-'}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-ink">{pesoModelo(m).toLocaleString('pt-BR')} g</td>
                  <td className="px-3 py-2 font-semibold text-texto-2">{gerarSkuModelo(m, variacoes.length + i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {erro && <p className="mt-3 text-xs font-semibold text-erro">{erro}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Botao type="button" variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao type="button" disabled={salvando || selecionados.length === 0} onClick={salvar}>
          {salvando ? 'Salvando...' : 'Criar SKUs'}
        </Botao>
      </div>
    </Modal>
  );
}

function AbaComposicao({
  produtoId,
  itens,
  total,
  custosVisiveis,
  aoMudar,
}: {
  produtoId: string;
  itens: ItemComposicao[];
  total: number;
  custosVisiveis: boolean;
  aoMudar: () => Promise<void>;
}) {
  const { pode } = useAuth();
  const crudItem = useCrud('composicao_item');
  const modelos = useLista<{ id: string; nome: string }>('modelo_3d', { ordem: 'nome', desc: false });
  const materiais = useLista<{ id: string; nome: string; tipo: string }>('material', { ordem: 'nome', desc: false });
  const tarefas = useLista<{ id: string; nome: string }>('tarefa_mao_obra', { ordem: 'nome', desc: false });
  const [editando, setEditando] = useState<Partial<ItemComposicao> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const tipoSel = (editando?.tipo ?? 'componente') as ItemComposicao['tipo'];

  async function salvarItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    const tipo = f.get('tipo') as ItemComposicao['tipo'];
    const valores: Record<string, unknown> = {
      produto_id: produtoId,
      tipo,
      quantidade: Number(f.get('quantidade')),
      unidade: (f.get('unidade') as string) || 'un',
      modelo_id: tipo === 'modelo_impresso' ? (f.get('modelo_id') as string) || null : null,
      material_id: ['componente', 'embalagem', 'modelo_impresso'].includes(tipo) ? (f.get('material_id') as string) || null : null,
      tarefa_id: tipo === 'mao_de_obra' ? (f.get('tarefa_id') as string) || null : null,
      tempo_min: tipo === 'mao_de_obra' ? Number(f.get('tempo_min') || 0) : null,
      descricao: (f.get('descricao') as string) || null,
      custo_manual: tipo === 'servico' ? paraCentavos(f.get('custo_manual') as string) : null,
    };
    try {
      if (editando.id) await crudItem.atualizar.mutateAsync({ id: editando.id, ...valores });
      else await crudItem.criar.mutateAsync(valores);
      setEditando(null);
      setErro(null);
      await aoMudar();
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function removerItem(itemId: string) {
    await crudItem.excluir.mutateAsync(itemId);
    await aoMudar();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Cartao>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-ink">Composicao / BOM</h2>
            <p className="text-xs text-texto-2">Modelos, materiais, embalagem, servicos e mao de obra que formam o produto.</p>
          </div>
          {pode('produtos', 'editar') && <Botao onClick={() => setEditando({})}>+ Adicionar item</Botao>}
        </div>
        {itens.length === 0 ? (
          <EstadoVazio mensagem="Sem composicao. Adicione os itens para calcular custo e preco com confianca." />
        ) : (
          <TabelaDados<ItemComposicao>
            colunas={[
              {
                titulo: 'Item',
                principal: true,
                render: (item) => {
                  const nome = item.tipo === 'modelo_impresso' ? item.modelo?.nome
                    : item.tipo === 'mao_de_obra' ? item.tarefa?.nome
                    : item.material?.nome ?? item.descricao;
                  return <span className="font-semibold text-ink">{nome ?? '-'}</span>;
                },
              },
              { titulo: 'Tipo', render: (item) => <Etiqueta cor={item.tipo === 'modelo_impresso' ? 'roxo' : 'cinza'}>{item.tipo.replaceAll('_', ' ')}</Etiqueta> },
              { titulo: 'Qtd.', numerica: true, render: (item) => `${Number(item.quantidade)} ${item.unidade}` },
              { titulo: 'Custo unit.', numerica: true, render: (item) => <Dinheiro centavos={custosVisiveis ? custoItemComposicao(item) : null} /> },
              { titulo: 'Subtotal', numerica: true, render: (item) => <Dinheiro centavos={custosVisiveis ? Math.round(custoItemComposicao(item) * Number(item.quantidade)) : null} /> },
            ]}
            linhas={itens}
            chave={(item) => item.id}
            acoes={(item) => pode('produtos', 'editar') ? (
              <span className="whitespace-nowrap">
                <Botao variante="fantasma" onClick={() => setEditando(item)}>Editar</Botao>
                <Botao variante="fantasma" onClick={() => removerItem(item.id)}>Excluir</Botao>
              </span>
            ) : null}
          />
        )}
      </Cartao>
      <aside className="space-y-3">
        <Cartao>
          <p className="text-[11px] font-extrabold uppercase text-texto-2">Total da composicao</p>
          <p className="mt-1 text-3xl font-black grad-texto tabular-nums"><Dinheiro centavos={custosVisiveis ? total : null} /></p>
          <p className="mt-1 text-xs text-texto-2">{itens.length} itens cadastrados</p>
        </Cartao>
        <Acordeao titulo="Como isso conecta">
          <p className="text-xs text-texto-2">A composicao alimenta custo, calculadora, reserva de insumos, OP e lucro real.</p>
        </Acordeao>
      </aside>

      <Modal aberto={!!editando} titulo="Item da composicao" onFechar={() => setEditando(null)} largura="max-w-xl">
        {editando && (
          <form onSubmit={salvarItem} className="space-y-3" key={editando.id ?? 'novo'}>
            <Campo rotulo="Tipo">
              <Selecao name="tipo" value={tipoSel} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as ItemComposicao['tipo'] })}>
                {(['modelo_impresso', 'componente', 'embalagem', 'mao_de_obra', 'servico'] as const).map((tp) => <option key={tp} value={tp}>{tp.replaceAll('_', ' ')}</option>)}
              </Selecao>
            </Campo>
            {tipoSel === 'modelo_impresso' && (
              <>
                <Campo rotulo="Modelo 3D">
                  <Selecao name="modelo_id" required defaultValue={editando.modelo_id ?? ''}>
                    <option value="">-</option>
                    {(modelos.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </Selecao>
                </Campo>
                <Campo rotulo="Material (opcional)">
                  <Selecao name="material_id" defaultValue={editando.material_id ?? ''}>
                    <option value="">Usar recomendado</option>
                    {(materiais.data ?? []).filter((m) => m.tipo === 'filamento' || m.tipo === 'resina').map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </Selecao>
                </Campo>
              </>
            )}
            {(tipoSel === 'componente' || tipoSel === 'embalagem') && (
              <Campo rotulo="Material">
                <Selecao name="material_id" required defaultValue={editando.material_id ?? ''}>
                  <option value="">-</option>
                  {(materiais.data ?? []).filter((m) => tipoSel === 'embalagem' ? m.tipo === 'embalagem' : m.tipo !== 'filamento' && m.tipo !== 'resina')
                    .map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </Selecao>
              </Campo>
            )}
            {tipoSel === 'mao_de_obra' && (
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Tarefa">
                  <Selecao name="tarefa_id" required defaultValue={editando.tarefa_id ?? ''}>
                    <option value="">-</option>
                    {(tarefas.data ?? []).map((tf) => <option key={tf.id} value={tf.id}>{tf.nome}</option>)}
                  </Selecao>
                </Campo>
                <Campo rotulo="Tempo (min)">
                  <Entrada name="tempo_min" type="number" min="0" defaultValue={editando.tempo_min ?? 15} />
                </Campo>
              </div>
            )}
            {tipoSel === 'servico' && (
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Descricao"><Entrada name="descricao" required defaultValue={editando.descricao ?? ''} /></Campo>
                <Campo rotulo="Custo"><EntradaDinheiro name="custo_manual" defaultCentavos={Number(editando.custo_manual ?? 0)} /></Campo>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Quantidade"><Entrada name="quantidade" type="number" step="any" min="0.0001" required defaultValue={editando.quantidade ?? 1} /></Campo>
              <Campo rotulo="Unidade"><Entrada name="unidade" defaultValue={editando.unidade ?? 'un'} /></Campo>
            </div>
            {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>Cancelar</Botao>
              <Botao type="submit">Salvar</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function AbaPublicacoes({ produtoId }: { produtoId: string }) {
  const canais = [
    { nome: 'Mercado Livre', status: 'Publicado', cor: 'verde' as const, preco: 'R$ 99,90', estoque: '24', pendencia: 'Ok' },
    { nome: 'Shopee', status: 'Pendente', cor: 'amarelo' as const, preco: '-', estoque: '-', pendencia: 'Categoria remota' },
    { nome: 'Shopify', status: 'Rascunho', cor: 'cinza' as const, preco: 'R$ 89,90', estoque: '102', pendencia: 'Nao conectado' },
    { nome: 'Amazon', status: 'Nao publicado', cor: 'cinza' as const, preco: '-', estoque: '-', pendencia: 'Planejado' },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Cartao>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-ink">Canais e publicacoes</h2>
            <p className="text-xs text-texto-2">Produto continua mestre; cada canal pode ter titulo, preco, estoque e status especificos.</p>
          </div>
        </div>
        <TabelaDados<(typeof canais)[number]>
          colunas={[
            { titulo: 'Canal', principal: true, render: (c) => <span className="font-semibold text-ink">{c.nome}</span> },
            { titulo: 'Status', render: (c) => <Etiqueta cor={c.cor}>{c.status}</Etiqueta> },
            { titulo: 'SKU remoto', render: () => '-' },
            { titulo: 'Preco', render: (c) => c.preco },
            { titulo: 'Estoque enviado', numerica: true, render: (c) => c.estoque },
            { titulo: 'Pendencias', render: (c) => c.pendencia },
          ]}
          linhas={canais}
          chave={(c) => c.nome}
        />
      </Cartao>
      <aside className="space-y-3">
        <Cartao>
          <h2 className="text-sm font-extrabold text-ink">Publicacao selecionada</h2>
          <dl className="mt-3 space-y-2 text-xs">
            <Info rotulo="Produto interno" valor={produtoId.slice(0, 8)} />
            <Info rotulo="Listing remoto" valor="MLB-123456" />
            <Info rotulo="Categoria" valor="Casa > Organizadores" />
            <Info rotulo="Ultima sync" valor="Ainda nao sincronizado" />
          </dl>
        </Cartao>
        <Cartao>
          <h2 className="text-sm font-extrabold text-ink">Campos por canal</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['Titulo', 'Descricao', 'Fotos', 'Categoria', 'Preco', 'Estoque', 'Status'].map((x) => <Etiqueta key={x}>{x}</Etiqueta>)}
          </div>
        </Cartao>
      </aside>
    </div>
  );
}

function AbaHistoricoProduto({ produtoId }: { produtoId: string }) {
  const eventos = [
    { titulo: 'Produto criado', detalhe: 'Cadastro mestre iniciado', tipo: 'Cadastro' },
    { titulo: 'Preco atualizado', detalhe: 'Custo/preco recalculado pela calculadora', tipo: 'Preco' },
    { titulo: 'SKU ajustado', detalhe: 'Saldo local revisado no inventario', tipo: 'Estoque' },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Cartao>
        <h2 className="text-sm font-extrabold text-ink">Historico operacional</h2>
        <div className="mt-4 space-y-3">
          {eventos.map((ev) => (
            <div key={ev.titulo} className="flex gap-3 rounded-xl border border-borda bg-white p-3">
              <span className="mt-1 size-2.5 rounded-full bg-brand-roxo" />
              <div>
                <p className="font-extrabold text-ink">{ev.titulo}</p>
                <p className="text-xs text-texto-2">{ev.detalhe}</p>
                <Etiqueta>{ev.tipo}</Etiqueta>
              </div>
            </div>
          ))}
        </div>
      </Cartao>
      <Cartao>
        <h2 className="text-sm font-extrabold text-ink">Conexoes futuras</h2>
        <p className="mt-2 text-xs text-texto-2">
          Esta aba deve agregar orcamentos, pedidos, OPs, movimentacoes e publicacoes ligadas ao produto {produtoId.slice(0, 8)}.
        </p>
      </Cartao>
    </div>
  );
}

function ResumoMetrica({ rotulo, valor, destaque = false }: { rotulo: string; valor: React.ReactNode; destaque?: boolean }) {
  return (
    <Cartao className="p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{rotulo}</p>
      <p className={`mt-1 truncate text-xl font-black tabular-nums ${destaque ? 'grad-texto' : 'text-ink'}`}>{valor}</p>
    </Cartao>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-texto-2">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{valor || '-'}</dd>
    </div>
  );
}

function mediaValores(valores: number[]) {
  if (valores.length === 0) return 0;
  return Math.round(valores.reduce((s, v) => s + v, 0) / valores.length);
}

function margemVariacao(variacao: Variacao) {
  if (typeof variacao.margem_calculada === 'number') return variacao.margem_calculada;
  const preco = Number(variacao.preco || variacao.preco_sugerido || 0);
  const custo = Number(variacao.custo_atual || 0);
  if (preco <= 0 || custo <= 0) return null;
  return (preco - custo) / preco;
}

function pendenciasProduto(
  produto: ProdutoDetalhe,
  variacoes: Variacao[],
  composicao: ItemComposicao[],
  preco: number,
  margem: number | null,
  estoqueLocal: number,
) {
  const pendencias: string[] = [];
  if (!produto.fotos?.[0]) pendencias.push('Sem foto');
  if (!produto.sku && variacoes.length === 0) pendencias.push('Sem SKU');
  if (variacoes.length === 0) pendencias.push('Sem variacao');
  if (composicao.length === 0) pendencias.push('Sem composicao');
  if (!preco || preco <= 0) pendencias.push('Sem preco');
  if (produto.custos_visiveis && (!produto.custo_atual || produto.custo_atual <= 0)) pendencias.push('Sem custo');
  if (margem != null && margem < 0) pendencias.push('Margem negativa');
  else if (margem != null && margem < 0.25) pendencias.push('Margem baixa');
  if (produto.disponibilidade === 'pronta_entrega' && estoqueLocal <= 0) pendencias.push('Sem estoque');
  if (!produto.dimensoes || !produto.peso_g) pendencias.push('Dimensoes/peso');
  return pendencias;
}

function tenantCenarioPadrao(ativa: ReturnType<typeof useAuth>['ativa']) {
  const cenarios = ativa?.tenant.cenarios_precificacao ?? [];
  const bruto = cenarios[1] ?? cenarios[0] ?? {};
  return {
    margem: numeroFracao((bruto as Record<string, unknown>).margem, 0.35),
    probabilidadeFalha: numeroFracao(
      (bruto as Record<string, unknown>).probabilidade_falha ?? (bruto as Record<string, unknown>).probabilidadeFalha,
      0.05,
    ),
    provisao: numeroFracao((bruto as Record<string, unknown>).provisao, 0.03),
  };
}

function montarEntradasVariacao({
  produto,
  variacao,
  composicao,
  materiais,
  impressoras,
  energias,
  canal,
  fiscal,
  custosFixos,
  ativa,
  margem,
}: {
  produto: ProdutoDetalhe;
  variacao: Variacao;
  composicao: ItemComposicao[];
  materiais: MaterialComposicaoRef[];
  impressoras: ImpressoraCalcRef[];
  energias: { id: string; tarifa_kwh: number }[];
  canal: CanalCalcRef | null;
  fiscal: PerfilFiscalRef | null;
  custosFixos: { valor_mensal: number; ativo: boolean; ratear?: boolean }[];
  ativa: ReturnType<typeof useAuth>['ativa'];
  margem: number;
}) {
  const materiaisPorId = new Map(materiais.map((m) => [m.id, m]));
  const impressora = escolherImpressora(variacao.modelo, impressoras);
  const tarifa = tarifaImpressora(impressora, energias);
  const padrao = tenantCenarioPadrao(ativa);
  const e = entradasVazias();

  e.qtdProduzida = 1;
  e.qtdVendavel = 1;

  if (variacao.modelo) {
    const modelo = variacao.modelo;
    const material = modelo.material_recomendado_id ? materiaisPorId.get(modelo.material_recomendado_id) : undefined;
    e.materiais.push({
      descricao: `${modelo.nome}${material ? ` - ${material.nome}` : ''}`,
      tecnologia: modelo.tecnologia ?? 'fdm',
      pesoPecaG: Number(modelo.peso_peca_g || 0),
      pesoSuporteG: Number(modelo.peso_suporte_g || 0),
      pesoPurgaG: Number(modelo.peso_purga_g || 0),
      pesoDesperdicioG: Number(modelo.peso_desperdicio_g || 0),
      custoUnitario: custoMaterialComposicao(material ?? null),
    });
    e.probabilidadeFalha = Number(modelo.probabilidade_falha ?? padrao.probabilidadeFalha);

    if (impressora) {
      const amortizacao = Number(impressora.vida_util_horas) > 0
        ? Number(impressora.valor_aquisicao) / Number(impressora.vida_util_horas)
        : 0;
      e.maquinas.push({
        descricao: impressora.nome,
        tempoImpressaoMin: Number(modelo.tempo_impressao_min || 0),
        custoHora: Math.round(amortizacao + Number(impressora.manutencao_hora || 0)),
        consumoW: Number(impressora.consumo_w || 0),
        tarifaKwh: tarifa,
      });
    }
  }

  const entradasComposicao = entradasDoProduto(composicao, 1, materiaisPorId, impressora, tarifa);
  juntarEntradasCalculo(e, entradasComposicao);

  e.margemDesejada = margem;
  e.probabilidadeFalha = e.probabilidadeFalha || padrao.probabilidadeFalha;
  e.provisao = padrao.provisao;
  e.descontoAtacado = 0.1;

  if (Number(produto.custo_desenvolvimento ?? 0) > 0 && Number(produto.qtd_planejada_rateio ?? 0) > 0) {
    e.desenvolvimento = {
      custoTotal: Number(produto.custo_desenvolvimento),
      qtdPlanejadaRateio: Number(produto.qtd_planejada_rateio),
    };
  }

  e.taxas = {
    canal: Number(canal?.taxa_marketplace ?? 0),
    pagamento: Number(canal?.taxa_pagamento ?? 0),
    comissao: Number(canal?.comissao ?? 0),
    aliquota: Number(fiscal?.aliquota_efetiva ?? 0),
  };

  if (canal && Number(canal.custo_fixo_pedido ?? 0) > 0) {
    e.custosExtras.push({
      descricao: `${canal.nome} - custo fixo por pedido`,
      quantidade: 1,
      unidade: 'pedido',
      custoUnitario: Number(canal.custo_fixo_pedido),
    });
  }

  const totalFixo = custosFixos
    .filter((c) => c.ativo && c.ratear !== false)
    .reduce((s, c) => s + Number(c.valor_mensal || 0), 0);
  if (totalFixo > 0 && ativa) {
    const criterio = ativa.tenant.criterio_rateio_custo_fixo;
    if (criterio === 'faturamento') {
      e.custosFixos = {
        criterio: 'faturamento',
        custoFixoMensal: totalFixo,
        faturamentoMensalEsperado: Number(ativa.tenant.faturamento_mensal_esperado),
      };
    } else if (criterio === 'pedido') {
      e.custosFixos = { criterio: 'pedido', custoPorPedido: Math.round(totalFixo / 30) };
    }
  }

  return e;
}

function juntarEntradasCalculo(alvo: EntradasCalculo, extra: EntradasCalculo) {
  alvo.materiais.push(...extra.materiais);
  alvo.componentes.push(...extra.componentes);
  alvo.embalagens.push(...extra.embalagens);
  alvo.servicos.push(...extra.servicos);
  alvo.maquinas.push(...extra.maquinas);
  alvo.maoDeObra.push(...extra.maoDeObra);
  alvo.custosExtras.push(...extra.custosExtras);
  alvo.probabilidadeFalha = Math.max(alvo.probabilidadeFalha, extra.probabilidadeFalha);
}

function escolherImpressora(modelo: ModeloRef | null | undefined, impressoras: ImpressoraCalcRef[]) {
  if (!impressoras.length) return null;
  return impressoras.find((i) => i.id === modelo?.impressora_recomendada_id) ?? impressoras[0];
}

function tarifaImpressora(impressora: ImpressoraCalcRef | null, energias: { id: string; tarifa_kwh: number }[]) {
  if (impressora?.perfil_energia_id) {
    return Number(energias.find((e) => e.id === impressora.perfil_energia_id)?.tarifa_kwh ?? 0);
  }
  return Number(energias[0]?.tarifa_kwh ?? 0);
}

function numeroFracao(valor: unknown, fallback: number) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return fallback;
  return Math.min(0.95, Math.max(0, numero));
}

function tamanhoModelo(modelo?: ModeloRef | null) {
  if (!modelo) return '';
  if (modelo.dimensoes) return modelo.dimensoes;
  const dims = [modelo.largura_mm, modelo.profundidade_mm, modelo.altura_mm].filter((v) => v != null && Number(v) > 0);
  return dims.length ? `${dims.join(' x ')} mm` : '';
}

function dimensoesModelo(modelo?: ModeloRef | null) {
  return tamanhoModelo(modelo);
}

function materialModelo(modelo: ModeloRef | null | undefined, materiais: Map<string, MaterialBaseRef>, produto: ProdutoDetalhe) {
  if (modelo?.material_recomendado_id) {
    return materiais.get(modelo.material_recomendado_id)?.nome ?? 'Material recomendado';
  }
  return produto.material_principal ?? '';
}

function pesoModelo(modelo?: ModeloRef | null) {
  if (!modelo) return 0;
  return Number(modelo.peso_peca_g || 0)
    + Number(modelo.peso_suporte_g || 0)
    + Number(modelo.peso_purga_g || 0)
    + Number(modelo.peso_desperdicio_g || 0);
}

function gerarSkuModelo(modelo: ModeloRef, indice = 0) {
  const base = modelo.codigo_interno || modelo.nome || 'SKU';
  const prefixo = normalizarSku(base).slice(0, 24);
  return `${prefixo || 'SKU'}-${String(indice + 1).padStart(3, '0')}`;
}

function gerarSkuBase(variacoes: Partial<Variacao>[]) {
  return `SKU-${String((variacoes.length || 0) + 1).padStart(3, '0')}`;
}

function gerarSkuVariacao(
  produto: ProdutoDetalhe,
  colecao: ColecaoRef | null,
  variacao: Partial<Variacao>,
  existentes: Partial<Variacao>[],
) {
  const partes = [
    abreviarSku(produto.nome, 'PRD'),
    abreviarSku(colecao?.codigo || colecao?.nome || produto.colecao_codigo || produto.colecao_nome || '', 'GER'),
    abreviarSku(variacao.cor_nome || primeiraCorProduto(produto), 'SEM'),
    abreviarSku(produto.material_principal || '', 'MAT'),
    abreviarTamanho(variacao.tamanho || ''),
  ];
  const base = normalizarSku(partes.filter(Boolean).join('-'));
  const usados = new Set(
    existentes
      .map((v) => normalizarSku(v.codigo || ''))
      .filter(Boolean),
  );
  if (!usados.has(base)) return base;
  let indice = 2;
  while (usados.has(`${base}-${indice}`)) indice += 1;
  return `${base}-${indice}`;
}

function normalizarSku(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();
}

function abreviarSku(valor: string | null | undefined, fallback: string) {
  const limpo = normalizarSku(valor ?? '');
  if (!limpo) return fallback;
  const mapaCores: Record<string, string> = {
    BEGE: 'BG',
    BEIGE: 'BG',
    BRANCO: 'BR',
    WHITE: 'BR',
    PRETO: 'PT',
    BLACK: 'PT',
    ROSA: 'RSA',
    PINK: 'RSA',
    ROXO: 'RX',
    PURPLE: 'RX',
    AZUL: 'AZL',
    BLUE: 'AZL',
    VERDE: 'VRD',
    GREEN: 'VRD',
    VERMELHO: 'VRM',
    RED: 'VRM',
    AMARELO: 'AMR',
    YELLOW: 'AMR',
    DOURADO: 'DRD',
    GOLD: 'DRD',
    PRATA: 'PRT',
    SILVER: 'PRT',
  };
  if (mapaCores[limpo]) return mapaCores[limpo];
  const palavras = limpo.split('-').filter(Boolean);
  if (palavras.length === 1) return palavras[0].slice(0, 3);
  const iniciais = palavras.map((p) => p[0]).join('');
  return (iniciais + palavras.join('')).slice(0, 3);
}

function abreviarTamanho(valor: string) {
  const limpo = normalizarSku(valor);
  if (!limpo || limpo === 'UNICO' || limpo === 'TAMANHO-UNICO') return 'UN';
  if (['PP', 'P', 'M', 'G', 'GG'].includes(limpo)) return limpo;
  return limpo.slice(0, 3);
}

function primeiraCorProduto(produto: ProdutoDetalhe) {
  const primeira = produto.cores?.find((cor) => cor?.nome)?.nome;
  return primeira || null;
}

function Icone({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  cube: 'M12 2 3.5 6.8v10.4L12 22l8.5-4.8V6.8L12 2Zm0 2.3 5.9 3.3L12 10.9 6.1 7.6 12 4.3ZM5.5 9.4l5.5 3.1v6.4l-5.5-3.1V9.4Zm7.5 9.5v-6.4l5.5-3.1v6.4L13 18.9Z',
  calc: 'M5 3h14v18H5V3Zm2 2v4h10V5H7Zm0 7h3v2H7v-2Zm5 0h2v2h-2v-2Zm4 0h2v6h-2v-6ZM7 16h3v2H7v-2Zm5 0h2v2h-2v-2Z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6Zm0 2.5L17.5 8H14V4.5Z',
  edit: 'M4 17.5V21h3.5L18.1 10.4l-3.5-3.5L4 17.5ZM16 5.5 17.5 4 21 7.5 19.5 9 16 5.5Z',
  stock: 'M4 7h16v13H4V7Zm2 2v9h12V9H6Zm3-5h6v2H9V4Z',
  channels: 'M4 4h16v4H4V4Zm0 6h7v10H4V10Zm9 0h7v10h-7V10Z',
  trash: 'M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z',
};
