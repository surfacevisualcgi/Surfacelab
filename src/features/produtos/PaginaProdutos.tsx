/**
 * Produtos: cadastro mestre comercial.
 * Visao em cards para catalogo visual e lista para operacao diaria.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mensagemErro, useCrud, useLista } from '@/lib/dados';
import { percentual } from '@/lib/formato';
import {
  Botao,
  Carregando,
  Dinheiro,
  Entrada,
  EstadoErro,
  EstadoVazio,
  Etiqueta,
  Modal,
  Selecao,
} from '@/components/ui';
import { FotoOuPlaceholder } from '@/components/GaleriaFotos';
import { ModalNovoProduto } from './FormularioProduto';
import { useAuth } from '@/auth/AuthProvider';

export interface ProdutoView {
  id: string;
  sku: string | null;
  nome: string;
  status: string;
  categoria_id: string | null;
  colecao_id?: string | null;
  colecao_nome?: string | null;
  colecao_codigo?: string | null;
  cores?: { nome: string; hex: string; foto?: string }[];
  disponibilidade: string;
  fotos: string[];
  custo_atual: number | null;
  preco_sugerido: number | null;
  preco_praticado: number;
  estoque_pronto?: number | null;
  custos_visiveis: boolean;
}

interface VariacaoResumo {
  id: string;
  produto_id: string;
  nome: string;
  codigo: string | null;
  modelo_id: string | null;
  modelo?: {
    nome: string;
    codigo_interno: string | null;
  } | null;
  tamanho: string | null;
  cor_nome: string | null;
  estoque: number;
  preco: number;
  foto: string | null;
  fotos: string[];
  status: string;
  custo_atual: number | null;
  preco_sugerido: number | null;
  margem_calculada: number | null;
}

interface ProdutoCanalResumo {
  id: string;
  produto_id: string;
  canal_id: string;
}

interface ColecaoRef {
  id: string;
  nome: string;
  codigo: string | null;
}

interface ProdutoOperacional extends ProdutoView {
  skuCount: number;
  estoqueLocal: number;
  canaisCount: number;
  precoOperacional: number | null;
  margem: number | null;
  pendencias: string[];
  prontoPct: number;
  skuPrincipal: string | null;
}

type ModoVisual = 'cards' | 'lista' | 'skus';

export function PaginaProdutos() {
  const { pode, formato } = useAuth();
  const navigate = useNavigate();
  const lista = useLista<ProdutoView>('v_produto', { ordem: 'nome', desc: false });
  const crud = useCrud('produto', ['v_produto', 'variacao', 'produto_canal']);
  const categorias = useLista<{ id: string; nome: string; escopo: string }>('categoria', { ordem: 'nome', desc: false });
  const colecoes = useLista<ColecaoRef>('colecao', { ordem: 'nome', desc: false });
  const variacoes = useLista<VariacaoResumo>('variacao', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, produto_id, nome, codigo, modelo_id, tamanho, cor_nome, estoque, preco, custo_atual, preco_sugerido, margem_calculada, foto, fotos, status, modelo:modelo_id (nome, codigo_interno)',
  });
  const produtoCanais = useLista<ProdutoCanalResumo>('produto_canal', {
    ordem: 'created_at',
    desc: false,
    selecao: 'id, produto_id, canal_id',
  });
  const [novo, setNovo] = useState(false);
  const [modo, setModo] = useState<ModoVisual>('cards');
  const [busca, setBusca] = useState('');
  const [filtroDisp, setFiltroDisp] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroColecao, setFiltroColecao] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroOperacao, setFiltroOperacao] = useState('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<ProdutoOperacional | null>(null);

  const categoriasProduto = (categorias.data ?? []).filter((c) => c.escopo === 'produto');

  const produtos = useMemo(() => {
    const varsPorProduto = agruparPor(variacoes.data ?? [], (v) => v.produto_id);
    const canaisPorProduto = agruparPor(produtoCanais.data ?? [], (pc) => pc.produto_id);
    return (lista.data ?? []).map<ProdutoOperacional>((p) => {
      const vars = varsPorProduto.get(p.id) ?? [];
      const canais = canaisPorProduto.get(p.id) ?? [];
      const precoVariacao = mediaNumerica(vars.map((v) => Number(v.preco || v.preco_sugerido || 0)).filter((v) => v > 0));
      const custoVariacao = mediaNumerica(vars.map((v) => Number(v.custo_atual || 0)).filter((v) => v > 0));
      const precoOperacional = p.preco_praticado > 0 ? p.preco_praticado : precoVariacao ?? p.preco_sugerido;
      const estoqueLocal = vars.length > 0
        ? vars.reduce((s, v) => s + Number(v.estoque ?? 0), 0)
        : Number(p.estoque_pronto ?? 0);
      const margemCalculada = mediaNumerica(vars.map((v) => margemVariacaoResumo(v)).filter((v): v is number => v != null));
      const margem =
        margemCalculada ??
        (p.custos_visiveis && precoOperacional && p.custo_atual != null && precoOperacional > 0
          ? (precoOperacional - p.custo_atual) / precoOperacional
          : custoVariacao && precoOperacional && precoOperacional > 0
            ? (precoOperacional - custoVariacao) / precoOperacional
            : null);
      const pendencias = pendenciasProduto(p, vars, canais.length, precoOperacional, margem);
      return {
        ...p,
        skuCount: vars.length,
        estoqueLocal,
        canaisCount: canais.length,
        precoOperacional: precoOperacional ?? null,
        margem,
        pendencias,
        prontoPct: Math.round(((8 - Math.min(8, pendencias.length)) / 8) * 100),
        skuPrincipal: vars.find((v) => v.codigo)?.codigo ?? p.sku,
      };
    });
  }, [lista.data, variacoes.data, produtoCanais.data]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      const categoriaNome = categoriasProduto.find((c) => c.id === p.categoria_id)?.nome ?? '';
      const vars = (variacoes.data ?? []).filter((v) => v.produto_id === p.id);
      const textoVariacoes = vars
        .flatMap((v) => [v.nome, v.codigo, v.tamanho, v.cor_nome, v.modelo?.nome, v.modelo?.codigo_interno])
        .filter(Boolean)
        .join(' ');
      const texto = [p.nome, p.sku, p.skuPrincipal, categoriaNome, p.colecao_nome, p.colecao_codigo, textoVariacoes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const operacaoOk =
        !filtroOperacao ||
        (filtroOperacao === 'com_estoque' && p.estoqueLocal > 0) ||
        (filtroOperacao === 'sem_estoque' && p.estoqueLocal <= 0) ||
        (filtroOperacao === 'com_canal' && p.canaisCount > 0) ||
        (filtroOperacao === 'sem_canal' && p.canaisCount === 0) ||
        (filtroOperacao === 'incompleto' && p.pendencias.length > 0) ||
        (filtroOperacao === 'margem_baixa' && p.margem != null && p.margem < 0.25) ||
        (filtroOperacao === 'sem_foto' && !p.fotos?.[0]) ||
        (filtroOperacao === 'sem_sku' && p.skuCount === 0 && !p.sku);
      return (
        (!termo || texto.includes(termo)) &&
        (!filtroDisp || p.disponibilidade === filtroDisp) &&
        (!filtroCategoria || p.categoria_id === filtroCategoria) &&
        (!filtroColecao || p.colecao_id === filtroColecao) &&
        (!filtroStatus || p.status === filtroStatus) &&
        operacaoOk
      );
    });
  }, [produtos, busca, filtroDisp, filtroCategoria, filtroColecao, filtroStatus, filtroOperacao, categoriasProduto, variacoes.data]);

  const kpis = useMemo(() => ({
    ativos: produtos.filter((p) => p.status === 'ativo').length,
    skus: produtos.reduce((s, p) => s + p.skuCount, 0),
    estoque: produtos.reduce((s, p) => s + p.estoqueLocal, 0),
    pendencias: produtos.filter((p) => p.pendencias.length > 0).length,
  }), [produtos]);
  const temFiltros = !!(filtroDisp || filtroCategoria || filtroColecao || filtroStatus || filtroOperacao);

  const skusFiltrados = useMemo(() => {
    const produtosPorId = new Map(filtrados.map((p) => [p.id, p]));
    return (variacoes.data ?? [])
      .filter((v) => produtosPorId.has(v.produto_id))
      .map((v) => ({ sku: v, produto: produtosPorId.get(v.produto_id)! }));
  }, [filtrados, variacoes.data]);

  async function confirmarExclusaoProduto() {
    if (!produtoParaExcluir) return;
    try {
      await crud.excluir.mutateAsync(produtoParaExcluir.id);
      setProdutoParaExcluir(null);
    } catch (erro) {
      window.alert(mensagemErro(erro));
    }
  }

  if (lista.isLoading || variacoes.isLoading || produtoCanais.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div className="flex min-h-0 flex-col gap-3 sm:gap-4 xl:h-[calc(100dvh-112px)] xl:overflow-hidden">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-texto-2">Catalogo mestre</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Produtos</h1>
          <p className="mt-1 hidden max-w-3xl text-sm text-texto-2 sm:block">
            Gerencie o que vende, SKUs, estoque local, composicao, preco e preparacao para canais.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Botao variante="secundario" onClick={() => navigate('/canais/shopify')}>
            <Icone d={ICONS.channels} /> Canais
          </Botao>
          {pode('produtos', 'criar') && (
            <Botao className="flex-1 sm:flex-none" onClick={() => setNovo(true)}>
              <Icone d={ICONS.plus} /> Novo produto
            </Botao>
          )}
        </div>
      </section>

      <section className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
        <KpiProduto rotulo="Produtos ativos" valor={kpis.ativos.toLocaleString()} detalhe="cadastros vendaveis" tom="blue" />
        <KpiProduto rotulo="SKUs" valor={kpis.skus.toLocaleString()} detalhe="variacoes cadastradas" tom="purple" />
        <KpiProduto rotulo="Estoque pronto" valor={kpis.estoque.toLocaleString()} detalhe="unidades locais" tom="green" />
        <KpiProduto rotulo="Pendencias" valor={kpis.pendencias.toLocaleString()} detalhe="precisam revisao" tom={kpis.pendencias ? 'red' : 'plain'} />
      </section>

      <section className="rounded-xl border border-borda bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex gap-2">
              <Entrada placeholder="Buscar produto, SKU, categoria ou colecao..." value={busca} onChange={(e) => setBusca(e.target.value)} />
              <Botao
                type="button"
                variante="secundario"
                className="shrink-0 sm:hidden"
                onClick={() => setFiltrosAbertos((aberto) => !aberto)}
              >
                <Icone d={ICONS.filter} /> {temFiltros ? 'Filtros *' : 'Filtros'}
              </Botao>
            </div>
            <div className={`${filtrosAbertos ? 'grid' : 'hidden'} min-w-0 gap-2 sm:grid sm:grid-cols-2 xl:grid-cols-[145px_145px_145px_145px_180px]`}>
              <Selecao value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="">Todas categorias</option>
              {categoriasProduto.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
              <Selecao value={filtroColecao} onChange={(e) => setFiltroColecao(e.target.value)}>
              <option value="">Todas colecoes</option>
              {(colecoes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
              <Selecao value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos status</option>
              <option value="ativo">Ativo</option>
              <option value="rascunho">Rascunho</option>
              <option value="arquivado">Arquivado</option>
              </Selecao>
              <Selecao value={filtroDisp} onChange={(e) => setFiltroDisp(e.target.value)}>
              <option value="">Disponibilidade</option>
              <option value="pronta_entrega">Pronta entrega</option>
              <option value="sob_demanda">Sob demanda</option>
              </Selecao>
              <Selecao value={filtroOperacao} onChange={(e) => setFiltroOperacao(e.target.value)}>
              <option value="">Operacao</option>
              <option value="com_estoque">Com estoque</option>
              <option value="sem_estoque">Sem estoque</option>
              <option value="com_canal">Com canal</option>
              <option value="sem_canal">Sem canal</option>
              <option value="incompleto">Cadastro incompleto</option>
              <option value="margem_baixa">Margem baixa</option>
              <option value="sem_foto">Sem foto</option>
              <option value="sem_sku">Sem SKU</option>
              </Selecao>
            </div>
          </div>
          <div className="flex shrink-0 rounded-lg border border-borda bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setModo('cards')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-extrabold ${
                modo === 'cards' ? 'bg-white text-ink shadow-sm' : 'text-texto-2 hover:text-ink'
              }`}
            >
              <Icone d={ICONS.grid} /> Cards
            </button>
            <button
              type="button"
              onClick={() => setModo('lista')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-extrabold ${
                modo === 'lista' ? 'bg-white text-ink shadow-sm' : 'text-texto-2 hover:text-ink'
              }`}
            >
              <Icone d={ICONS.list} /> Lista
            </button>
            <button
              type="button"
              onClick={() => setModo('skus')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-extrabold ${
                modo === 'skus' ? 'bg-white text-ink shadow-sm' : 'text-texto-2 hover:text-ink'
              }`}
            >
              <Icone d={ICONS.tag} /> SKUs
            </button>
          </div>
        </div>
      </section>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {filtrados.length === 0 ? (
          <EstadoVazio
            mensagem={busca || filtroOperacao || filtroCategoria || filtroColecao ? 'Nenhum produto encontrado para os filtros atuais.' : undefined}
            acao={pode('produtos', 'criar') ? <Botao onClick={() => setNovo(true)}>+ Novo produto</Botao> : undefined}
          />
        ) : modo === 'skus' ? (
          <ProdutosSkus linhas={skusFiltrados} formato={formato} />
        ) : modo === 'cards' ? (
          <ProdutosCards
            produtos={filtrados}
            categorias={categoriasProduto}
            formato={formato}
            podeEditar={pode('produtos', 'editar')}
            podeExcluir={pode('produtos', 'excluir')}
            excluindo={crud.excluir.isPending}
            onExcluir={setProdutoParaExcluir}
            onCalcular={(produto) => navigate(`/calculadora?produto=${produto.id}`)}
            onAbrir={(produto) => navigate(`/produtos/${produto.id}`)}
          />
        ) : (
          <ProdutosLista
            produtos={filtrados}
            categorias={categoriasProduto}
            formato={formato}
            podeEditar={pode('produtos', 'editar')}
            podeExcluir={pode('produtos', 'excluir')}
            excluindo={crud.excluir.isPending}
            onExcluir={setProdutoParaExcluir}
            onCalcular={(produto) => navigate(`/calculadora?produto=${produto.id}`)}
            onAbrir={(produto) => navigate(`/produtos/${produto.id}`)}
          />
        )}
      </main>

      <ModalNovoProduto aberto={novo} onFechar={() => setNovo(false)} />
      <ModalConfirmarExclusaoProduto
        produto={produtoParaExcluir}
        excluindo={crud.excluir.isPending}
        onCancelar={() => setProdutoParaExcluir(null)}
        onConfirmar={confirmarExclusaoProduto}
      />
    </div>
  );
}

function ModalConfirmarExclusaoProduto({
  produto,
  excluindo,
  onCancelar,
  onConfirmar,
}: {
  produto: ProdutoOperacional | null;
  excluindo: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Modal aberto={!!produto} titulo="Excluir produto" onFechar={onCancelar}>
      <div className="space-y-4">
        <div className="rounded-xl border border-erro/20 bg-erro/5 p-3">
          <p className="text-sm font-extrabold text-ink">Tem certeza que deseja excluir este produto?</p>
          <p className="mt-1 text-sm text-texto-2">
            {produto ? `Produto: ${produto.nome}` : ''}
          </p>
          <p className="mt-2 text-xs text-texto-2">
            Ele deixara de aparecer nas listas e buscas, mas o registro sera mantido internamente como excluido.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onCancelar} disabled={excluindo}>
            Cancelar
          </Botao>
          <Botao type="button" variante="perigo" onClick={onConfirmar} disabled={excluindo}>
            {excluindo ? 'Excluindo...' : 'Excluir produto'}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function ProdutosCards({
  produtos,
  categorias,
  formato,
  podeEditar,
  podeExcluir,
  excluindo,
  onExcluir,
  onCalcular,
  onAbrir,
}: {
  produtos: ProdutoOperacional[];
  categorias: { id: string; nome: string }[];
  formato: ReturnType<typeof useAuth>['formato'];
  podeEditar: boolean;
  podeExcluir: boolean;
  excluindo: boolean;
  onExcluir: (produto: ProdutoOperacional) => void;
  onCalcular: (produto: ProdutoOperacional) => void;
  onAbrir: (produto: ProdutoOperacional) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {produtos.map((p) => (
        <article
          key={p.id}
          className="group overflow-hidden rounded-lg border border-borda bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="relative">
            <Link to={`/produtos/${p.id}`} className="block">
              <FotoOuPlaceholder path={p.fotos?.[0]} alt={p.nome} className="aspect-square w-full object-cover" />
            </Link>
            <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
              <Etiqueta cor={p.disponibilidade === 'pronta_entrega' ? 'verde' : 'cinza'}>
                {p.disponibilidade === 'pronta_entrega' ? 'Pronta entrega' : 'Sob demanda'}
              </Etiqueta>
              {p.pendencias.length > 0 && <Etiqueta cor="amarelo">{p.pendencias.length} pend.</Etiqueta>}
            </div>
            {podeEditar && (
              <div className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1 text-texto-2 opacity-0 shadow-sm transition group-hover:opacity-100">
                <Icone d={ICONS.more} />
              </div>
            )}
          </div>
          <div className="p-1.5">
            <div className="flex items-start justify-between gap-1.5">
              <div className="min-w-0">
                <Link to={`/produtos/${p.id}`} className="block truncate text-xs font-extrabold text-ink group-hover:text-brand-azul">
                  {p.nome}
                </Link>
                <p className="mt-0.5 truncate text-[10px] font-semibold text-texto-2">
                  {p.skuPrincipal ?? 'SKU pendente'} · {categorias.find((c) => c.id === p.categoria_id)?.nome ?? 'Sem categoria'}
                </p>
              </div>
              <StatusDot status={p.status} />
            </div>

            <div className="mt-1.5 grid grid-cols-3 gap-1">
              <MiniMetric rotulo="Preco" valor={p.precoOperacional ? <Dinheiro centavos={p.precoOperacional} /> : '-'} />
              <MiniMetric rotulo="Estoque" valor={p.estoqueLocal.toLocaleString()} />
              <MiniMetric rotulo="Margem" valor={p.margem != null ? percentual(p.margem, formato) : '-'} />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <Etiqueta cor={p.skuCount > 0 ? 'roxo' : 'amarelo'}>{p.skuCount} SKUs</Etiqueta>
              <Etiqueta cor={p.canaisCount > 0 ? 'azul' : 'cinza'}>{p.canaisCount} canais</Etiqueta>
              {p.colecao_nome && <Etiqueta cor="cinza">{p.colecao_nome}</Etiqueta>}
              {p.pendencias.slice(0, 1).map((alerta) => <Etiqueta key={alerta} cor="amarelo">{alerta}</Etiqueta>)}
            </div>

            <div className="mt-1.5 flex items-center justify-between border-t border-borda/70 pt-1.5">
              <span className="text-[10px] font-semibold text-texto-2">Cadastro {p.prontoPct}%</span>
              <div className="flex gap-1">
                <IconButton title="Calcular" d={ICONS.calc} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCalcular(p); }} />
                <IconButton title="Estoque" d={ICONS.stock} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAbrir(p); }} />
                <IconButton title="Editar" d={ICONS.edit} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAbrir(p); }} />
                {podeExcluir && (
                  <IconButton
                    title="Excluir"
                    d={ICONS.trash}
                    disabled={excluindo}
                    danger
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onExcluir(p);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ProdutosLista({
  produtos,
  categorias,
  formato,
  podeEditar,
  podeExcluir,
  excluindo,
  onExcluir,
  onCalcular,
  onAbrir,
}: {
  produtos: ProdutoOperacional[];
  categorias: { id: string; nome: string }[];
  formato: ReturnType<typeof useAuth>['formato'];
  podeEditar: boolean;
  podeExcluir: boolean;
  excluindo: boolean;
  onExcluir: (produto: ProdutoOperacional) => void;
  onCalcular: (produto: ProdutoOperacional) => void;
  onAbrir: (produto: ProdutoOperacional) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-borda bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-borda px-4 py-3">
        <div>
          <h2 className="text-sm font-extrabold text-ink">Lista operacional</h2>
          <p className="text-xs text-texto-2">Use para revisar preco, margem, estoque e pendencias em lote.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borda bg-surface-2/70 text-left">
              {['', 'Produto', 'SKUs', 'Categoria', 'Colecao', 'Estoque', 'Custo', 'Preco', 'Margem', 'Canais', 'Status', 'Pendencias', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda/70">
            {produtos.map((p) => (
              <tr key={p.id} className="hover:bg-surface-2/50">
                <td className="px-3 py-2.5"><input type="checkbox" className="rounded border-borda" /></td>
                <td className="min-w-64 px-3 py-2.5">
                  <Link to={`/produtos/${p.id}`} className="flex items-center gap-2">
                    <FotoOuPlaceholder path={p.fotos?.[0]} alt={p.nome} className="size-11 rounded-lg object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold text-ink">{p.nome}</span>
                      <span className="block truncate text-[11px] font-semibold text-texto-2">{p.skuPrincipal ?? 'SKU pendente'}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5"><Etiqueta cor={p.skuCount > 0 ? 'roxo' : 'amarelo'}>{p.skuCount}</Etiqueta></td>
                <td className="px-3 py-2.5 text-texto-2">{categorias.find((c) => c.id === p.categoria_id)?.nome ?? '-'}</td>
                <td className="px-3 py-2.5 text-texto-2">{p.colecao_nome ?? '-'}</td>
                <td className="px-3 py-2.5 font-bold tabular-nums text-ink">{p.estoqueLocal}</td>
                <td className="px-3 py-2.5 tabular-nums"><Dinheiro centavos={p.custo_atual} /></td>
                <td className="px-3 py-2.5 font-bold tabular-nums"><Dinheiro centavos={p.precoOperacional} /></td>
                <td className={`px-3 py-2.5 font-bold tabular-nums ${p.margem != null && p.margem < 0.25 ? 'text-erro' : 'text-ink'}`}>
                  {p.margem != null ? percentual(p.margem, formato) : '-'}
                </td>
                <td className="px-3 py-2.5"><Etiqueta cor={p.canaisCount > 0 ? 'azul' : 'cinza'}>{p.canaisCount}</Etiqueta></td>
                <td className="px-3 py-2.5"><Etiqueta cor={p.status === 'ativo' ? 'verde' : p.status === 'rascunho' ? 'amarelo' : 'cinza'}>{p.status}</Etiqueta></td>
                <td className="max-w-56 px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {p.pendencias.length === 0 ? <Etiqueta cor="verde">Ok</Etiqueta> : p.pendencias.slice(0, 2).map((x) => <Etiqueta key={x} cor="amarelo">{x}</Etiqueta>)}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {podeEditar && (
                    <div className="flex justify-end gap-1">
                      <Link to={`/produtos/${p.id}`}><IconButton title="Ver" d={ICONS.eye} /></Link>
                      <IconButton title="Calcular" d={ICONS.calc} onClick={() => onCalcular(p)} />
                      <IconButton title="Editar" d={ICONS.edit} onClick={() => onAbrir(p)} />
                      {podeExcluir && (
                        <IconButton
                          title="Excluir"
                          d={ICONS.trash}
                          disabled={excluindo}
                          danger
                          onClick={() => onExcluir(p)}
                        />
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProdutosSkus({
  linhas,
  formato,
}: {
  linhas: { sku: VariacaoResumo; produto: ProdutoOperacional }[];
  formato: ReturnType<typeof useAuth>['formato'];
}) {
  if (linhas.length === 0) {
    return <EstadoVazio mensagem="Nenhum SKU encontrado para os filtros atuais." />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-borda bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-borda px-4 py-3">
        <div>
          <h2 className="text-sm font-extrabold text-ink">SKUs / variacoes vendaveis</h2>
          <p className="text-xs text-texto-2">Use esta visao para operar por modelo 3D, cor, tamanho, estoque e preco.</p>
        </div>
        <Etiqueta>{linhas.length} SKUs</Etiqueta>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borda bg-surface-2/70 text-left">
              {['SKU', 'Produto pai', 'Modelo 3D', 'Cor/Tamanho', 'Estoque', 'Preco', 'Margem produto', 'Status'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda/70">
            {linhas.map(({ sku, produto }) => (
              <tr key={sku.id} className="hover:bg-surface-2/50">
                <td className="min-w-64 px-3 py-2.5">
                  <Link to={`/produtos/${produto.id}`} className="flex items-center gap-2">
                    <FotoOuPlaceholder path={sku.fotos?.[0] ?? sku.foto ?? produto.fotos?.[0]} alt={sku.nome} className="size-11 rounded-lg object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold text-ink">{sku.codigo ?? 'SKU pendente'}</span>
                      <span className="block truncate text-[11px] font-semibold text-texto-2">{sku.nome}</span>
                    </span>
                  </Link>
                </td>
                <td className="min-w-52 px-3 py-2.5">
                  <Link to={`/produtos/${produto.id}`} className="font-semibold text-ink hover:text-brand-azul">{produto.nome}</Link>
                  <span className="block text-[11px] text-texto-2">{produto.sku ?? 'Produto sem codigo'}</span>
                </td>
                <td className="min-w-52 px-3 py-2.5">
                  <span className="font-semibold text-ink">{sku.modelo?.nome ?? '-'}</span>
                  <span className="block text-[11px] text-texto-2">{sku.modelo?.codigo_interno ?? (sku.modelo_id ? 'Modelo vinculado' : 'Sem modelo 3D')}</span>
                </td>
                <td className="px-3 py-2.5 text-texto-2">{[sku.cor_nome, sku.tamanho].filter(Boolean).join(' / ') || '-'}</td>
                <td className="px-3 py-2.5 font-bold tabular-nums text-ink">{sku.estoque}</td>
                <td className="px-3 py-2.5 font-bold tabular-nums"><Dinheiro centavos={sku.preco || produto.precoOperacional} /></td>
                <td className={`px-3 py-2.5 font-bold tabular-nums ${produto.margem != null && produto.margem < 0.25 ? 'text-erro' : 'text-ink'}`}>
                  {produto.margem != null ? percentual(produto.margem, formato) : '-'}
                </td>
                <td className="px-3 py-2.5"><Etiqueta cor={sku.status === 'ativo' ? 'verde' : sku.status === 'rascunho' ? 'amarelo' : 'cinza'}>{sku.status}</Etiqueta></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pendenciasProduto(
  p: ProdutoView,
  variacoes: VariacaoResumo[],
  canaisCount: number,
  preco: number | null | undefined,
  margem: number | null,
) {
  const pendencias: string[] = [];
  if (!p.fotos?.[0]) pendencias.push('Sem foto');
  if (!p.sku && variacoes.length === 0) pendencias.push('Sem SKU');
  if (variacoes.length === 0) pendencias.push('Sem variacao');
  if (!preco || preco <= 0) pendencias.push('Sem preco');
  if (p.custos_visiveis && (!p.custo_atual || p.custo_atual <= 0)) pendencias.push('Sem custo');
  if (margem != null && margem < 0) pendencias.push('Margem negativa');
  else if (margem != null && margem < 0.25) pendencias.push('Margem baixa');
  if (p.disponibilidade === 'pronta_entrega') {
    const estoque = variacoes.length ? variacoes.reduce((s, v) => s + Number(v.estoque ?? 0), 0) : Number(p.estoque_pronto ?? 0);
    if (estoque <= 0) pendencias.push('Sem estoque');
  }
  if (canaisCount === 0) pendencias.push('Sem canal');
  return pendencias;
}

function mediaNumerica(valores: number[]) {
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((s, v) => s + v, 0) / valores.length);
}

function margemVariacaoResumo(variacao: VariacaoResumo) {
  if (typeof variacao.margem_calculada === 'number') return variacao.margem_calculada;
  const preco = Number(variacao.preco || variacao.preco_sugerido || 0);
  const custo = Number(variacao.custo_atual || 0);
  if (preco <= 0 || custo <= 0) return null;
  return (preco - custo) / preco;
}

function agruparPor<T>(linhas: T[], chave: (linha: T) => string) {
  const mapa = new Map<string, T[]>();
  for (const linha of linhas) {
    const k = chave(linha);
    mapa.set(k, [...(mapa.get(k) ?? []), linha]);
  }
  return mapa;
}

function KpiProduto({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe: string; tom: 'blue' | 'purple' | 'green' | 'red' | 'plain' }) {
  const estilos = {
    blue: 'border-brand-azul/15 bg-brand-azul/5 text-brand-azul',
    purple: 'border-brand-roxo/15 bg-brand-roxo/5 text-brand-roxo',
    green: 'border-ok/15 bg-ok/5 text-ok',
    red: 'border-erro/15 bg-erro/5 text-erro',
    plain: 'border-borda bg-white text-ink',
  }[tom];
  return (
    <div className={`min-w-36 rounded-xl border p-3 shadow-sm sm:min-w-0 sm:p-4 ${estilos}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{rotulo}</p>
      <p className="mt-1 text-xl font-black tabular-nums sm:text-2xl">{valor}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-texto-2">{detalhe}</p>
    </div>
  );
}

function MiniMetric({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-md bg-surface-2 px-1.5 py-1">
      <p className="text-[8px] font-extrabold uppercase text-texto-2">{rotulo}</p>
      <p className="truncate text-[10px] font-black tabular-nums text-ink">{valor}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls = status === 'ativo' ? 'bg-ok' : status === 'rascunho' ? 'bg-alerta' : 'bg-texto-2';
  return <span className={`mt-1 size-2 shrink-0 rounded-full ${cls}`} title={status} />;
}

function IconButton({
  title,
  d,
  danger = false,
  disabled = false,
  onClick,
}: {
  title: string;
  d: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  if (!onClick) {
    return (
      <span
        title={title}
        className={`inline-flex size-5 items-center justify-center rounded-md border bg-white transition ${
          danger
            ? 'border-erro/30 text-erro hover:bg-erro/5'
            : 'border-borda text-texto-2 hover:bg-surface-2 hover:text-ink'
        }`}
      >
        <Icone d={d} />
      </span>
    );
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-5 items-center justify-center rounded-md border bg-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? 'border-erro/30 text-erro hover:bg-erro/5'
          : 'border-borda text-texto-2 hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <Icone d={d} />
    </button>
  );
}

function Icone({ d }: { d: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z',
  channels: 'M4 4h16v4H4V4Zm0 6h7v10H4V10Zm9 0h7v10h-7V10Z',
  tag: 'M3 11V4h7l11 11-6 6L3 11Zm5-3a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z',
  grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  list: 'M4 6h2v2H4V6Zm4 0h12v2H8V6ZM4 11h2v2H4v-2Zm4 0h12v2H8v-2ZM4 16h2v2H4v-2Zm4 0h12v2H8v-2Z',
  more: 'M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  calc: 'M5 3h14v18H5V3Zm2 2v4h10V5H7Zm0 7h3v2H7v-2Zm5 0h2v2h-2v-2Zm4 0h2v6h-2v-6ZM7 16h3v2H7v-2Zm5 0h2v2h-2v-2Z',
  stock: 'M4 7h16v13H4V7Zm2 2v9h12V9H6Zm3-5h6v2H9V4Z',
  edit: 'M4 17.5V21h3.5L18.1 10.4l-3.5-3.5L4 17.5ZM16 5.5 17.5 4 21 7.5 19.5 9 16 5.5Z',
  eye: 'M12 5c5 0 8.5 4.5 9.5 7-1 2.5-4.5 7-9.5 7s-8.5-4.5-9.5-7C3.5 9.5 7 5 12 5Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  trash: 'M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z',
};
