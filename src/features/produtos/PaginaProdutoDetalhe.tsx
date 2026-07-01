/**
 * Telas 05/06 — Produto em ABAS (estrutura v2): Visão geral (foto + resumo
 * financeiro + 3 ações primárias) · Variações · Margem por canal · Composição
 * (BOM com resumo lateral). Leitura mascarada via v_produto; custo "vivo" da
 * composição alimenta o cache custo_atual.
 */
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { enviarFoto, useTenantId } from '@/lib/fotos';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { custoItemComposicao, SELECAO_COMPOSICAO, type ItemComposicao } from '@/lib/composicao';
import { deCentavos, paraCentavos, percentual } from '@/lib/formato';
import {
  Abas, Acordeao, Botao, CabecalhoPagina, Campo, Carregando, Cartao, Dinheiro,
  Entrada, EntradaDinheiro, EstadoErro, EstadoVazio, Etiqueta, Modal, Selecao, TabelaDados,
} from '@/components/ui';
import { Foto, GaleriaFotos } from '@/components/GaleriaFotos';
import { Swatch } from '@/components/Cores';
import { ModalEditarProduto } from './FormularioProduto';
import { useAuth } from '@/auth/AuthProvider';
import type { ProdutoView } from './PaginaProdutos';

type Aba = 'geral' | 'variacoes' | 'canais' | 'composicao';

interface Variacao {
  id: string; nome: string; codigo: string | null; preco: number; estoque: number;
  cor_hex: string | null; cor_nome: string | null; foto: string | null; fotos: string[];
  modelo_id: string | null; tamanho: string | null; descricao: string | null;
  dimensoes: string | null; peso_g: number | null; status: string;
  modelo?: ModeloVariacaoRef | null;
}
interface ModeloVariacaoRef {
  id: string;
  nome: string;
  codigo_interno: string | null;
  tempo_impressao_min: number;
  peso_peca_g: number;
  peso_suporte_g: number;
  peso_purga_g: number;
  peso_desperdicio_g: number;
}
interface ProdutoCanal { id: string; canal_id: string; preco_praticado: number }
interface Canal { id: string; nome: string; taxa_marketplace: number; taxa_pagamento: number; comissao: number }

export function PaginaProdutoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { ativa, formato, pode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>('geral');
  const [editando, setEditando] = useState(false);

  async function salvarFotos(fotos: string[]) {
    const { error } = await supabase.from('produto').update({ fotos }).eq('id', id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['v_produto'] });
  }

  const produto = useQuery({
    queryKey: ['v_produto', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_produto').select('*').eq('id', id).single();
      if (error) throw error;
      return data as ProdutoView & {
        descricao: string | null; categoria_id: string | null; dimensoes: string | null;
        peso_g: number | null; material_principal: string | null; tags: string[];
        qtd_planejada_rateio: number; custo_desenvolvimento: number | null;
      };
    },
  });

  const categorias = useLista<{ id: string; nome: string }>('categoria', { ordem: 'nome', desc: false });

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

  const total = useMemo(
    () =>
      (composicao.data ?? []).reduce(
        (s, item) => s + custoItemComposicao(item) * Number(item.quantidade),
        0,
      ),
    [composicao.data],
  );

  if (produto.isLoading || composicao.isLoading) return <Carregando />;
  if (produto.isError || !produto.data) return <EstadoErro onRetry={() => produto.refetch()} />;

  const p = produto.data;
  const preco = p.preco_praticado > 0 ? p.preco_praticado : p.preco_sugerido;
  const margem = p.custos_visiveis && preco && p.custo_atual != null && preco > 0
    ? (preco - p.custo_atual) / preco : null;

  return (
    <div>
      <CabecalhoPagina
        titulo={p.nome}
        subtitulo={[p.sku, t(`produto.dispLabel.${p.disponibilidade}`)].filter(Boolean).join(' · ')}
        acoes={pode('produtos', 'editar') ? (
          <Botao variante="secundario" onClick={() => setEditando(true)}>{t('acoes.editar')}</Botao>
        ) : undefined}
      />

      <Abas<Aba>
        abas={[
          { id: 'geral', rotulo: t('produto.abaGeral') },
          { id: 'variacoes', rotulo: t('produto.abaVariacoes') },
          { id: 'canais', rotulo: t('produto.abaCanais') },
          { id: 'composicao', rotulo: t('produto.composicao') },
        ]}
        ativa={aba}
        onTrocar={setAba}
      />

      {aba === 'geral' && (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          {/* galeria real (Storage com RLS por tenant) */}
          <div>
            <GaleriaFotos
              fotos={p.fotos ?? []}
              prefixo={`produtos/${p.id}`}
              podeEditar={pode('produtos', 'editar')}
              onChange={salvarFotos}
            />
          </div>
          <div className="space-y-4">
            {/* resumo financeiro — 1 destaque por cartão (v2) */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Cartao>
                <p className="text-[11px] font-bold uppercase text-texto-2">{t('produto.precoPraticado')}</p>
                <p className="mt-1 text-lg font-extrabold grad-texto">
                  {preco ? <Dinheiro centavos={preco} /> : <span className="font-normal text-texto-2">—</span>}
                </p>
              </Cartao>
              <Cartao>
                <p className="text-[11px] font-bold uppercase text-texto-2">{t('produto.custoAtual')}</p>
                <p className="mt-1 text-lg font-extrabold text-ink"><Dinheiro centavos={p.custo_atual} /></p>
              </Cartao>
              <Cartao>
                <p className="text-[11px] font-bold uppercase text-texto-2">{t('produto.margemCurta')}</p>
                <p className="mt-1 text-lg font-extrabold text-ink">
                  {margem != null ? percentual(margem, formato) : '—'}
                </p>
              </Cartao>
              <Cartao>
                <p className="text-[11px] font-bold uppercase text-texto-2">{t('produto.totalComposicao')}</p>
                <p className="mt-1 text-lg font-extrabold text-ink">
                  <Dinheiro centavos={p.custos_visiveis ? total : null} />
                </p>
              </Cartao>
            </div>
            {/* 3 ações primárias bem visíveis (v2) */}
            <div className="flex flex-wrap gap-2">
              <Botao variante="acento" onClick={() => navigate(`/calculadora?produto=${p.id}`)}>
                {t('produto.calcularPreco')}
              </Botao>
              <Botao variante="secundario" onClick={() => navigate(`/calculadora?produto=${p.id}`)}>
                {t('produto.criarOrcamento')}
              </Botao>
              <Botao variante="secundario" onClick={() => setAba('composicao')}>
                {t('produto.verComposicao')}
              </Botao>
            </div>
            {/* informações do produto (painel da tela 05 do v2) */}
            <Cartao>
              <h2 className="mb-3 text-sm font-bold text-ink">{t('editarProduto.informacoes')}</h2>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Info rotulo={t('categoria.rotulo')} valor={categorias.data?.find((c) => c.id === p.categoria_id)?.nome} />
                <Info rotulo={t('novoProduto.materialPrincipal')} valor={p.material_principal} />
                <Info rotulo={t('novoProduto.dimensoes')} valor={p.dimensoes} />
                <Info rotulo={t('novoProduto.peso')} valor={p.peso_g != null ? `${p.peso_g} g` : undefined} />
                <Info rotulo="Status" valor={p.status} />
                <Info rotulo={t('novoProduto.qtdRateio')} valor={p.qtd_planejada_rateio ? String(p.qtd_planejada_rateio) : undefined} />
              </dl>
              {(p.tags ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.tags.map((tag) => <Etiqueta key={tag}>{tag}</Etiqueta>)}
                </div>
              )}
              {p.descricao && <p className="mt-3 text-sm text-texto-2">{p.descricao}</p>}
            </Cartao>
          </div>
        </div>
      )}

      {aba === 'variacoes' && <AbaVariacoes produtoId={p.id} />}
      {aba === 'canais' && <AbaCanais produtoId={p.id} custoAtual={p.custo_atual} custosVisiveis={p.custos_visiveis} />}
      {aba === 'composicao' && (
        <AbaComposicao
          produtoId={p.id}
          itens={composicao.data ?? []}
          total={total}
          custosVisiveis={p.custos_visiveis}
          aoMudar={async () => {
            qc.invalidateQueries({ queryKey: ['composicao_item', id] });
            const { data } = await supabase
              .from('composicao_item').select(SELECAO_COMPOSICAO)
              .eq('produto_id', id).is('deleted_at', null);
            const novoTotal = ((data ?? []) as unknown as ItemComposicao[]).reduce(
              (s, it) => s + custoItemComposicao(it) * Number(it.quantidade), 0);
            await supabase.from('produto').update({ custo_atual: novoTotal }).eq('id', id);
            qc.invalidateQueries({ queryKey: ['v_produto'] });
          }}
        />
      )}

      <ModalEditarProduto
        produto={p}
        aberto={editando}
        onFechar={() => setEditando(false)}
        onSalvo={() => { setEditando(false); qc.invalidateQueries({ queryKey: ['v_produto'] }); }}
      />
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-texto-2">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{valor || '—'}</dd>
    </div>
  );
}

// ------------------------------------------------- Variações (cor+foto, v2)
function AbaVariacoes({ produtoId }: { produtoId: string }) {
  const { t } = useTranslation();
  const { pode, ativa } = useAuth();
  const qc = useQueryClient();
  const crud = useCrud('variacao');
  const tenantId = useTenantId();
  const [editando, setEditando] = useState<Partial<Variacao> | null>(null);
  const [corHex, setCorHex] = useState<string | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  function abrir(v: Partial<Variacao>) {
    setEditando(v);
    setCorHex(v.cor_hex ?? null);
    setFotos(v.fotos?.length ? v.fotos : v.foto ? [v.foto] : []);
  }

  const lista = useQuery({
    queryKey: ['variacao', produtoId],
    enabled: !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variacao')
        .select('*, modelo:modelo_id (id, nome, codigo_interno, tempo_impressao_min, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g)')
        .eq('produto_id', produtoId)
        .is('deleted_at', null)
        .order('nome');
      if (error) throw error;
      return data as Variacao[];
    },
  });

  const modelos = useLista<ModeloVariacaoRef>('modelo_3d', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, codigo_interno, tempo_impressao_min, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g',
  });

  async function anexarFoto(arquivos: FileList | null) {
    if (!arquivos?.[0] || !tenantId) return;
    setEnviandoFoto(true);
    setErro(null);
    try {
      const path = await enviarFoto(tenantId, `produtos/${produtoId}/variacoes`, arquivos[0]);
      setFotos((atuais) => [...atuais, path]);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviandoFoto(false);
      if (inputFotoRef.current) inputFotoRef.current.value = '';
    }
  }

  async function excluir(v: Variacao) {
    if (!window.confirm(`Excluir a variacao "${v.nome}"?`)) return;
    try {
      await crud.excluir.mutateAsync(v.id);
      qc.invalidateQueries({ queryKey: ['variacao', produtoId] });
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    const valores = {
      produto_id: produtoId,
      nome: f.get('nome') as string,
      codigo: (f.get('codigo') as string) || null,
      modelo_id: (f.get('modelo_id') as string) || null,
      tamanho: (f.get('tamanho') as string) || null,
      preco: paraCentavos(f.get('preco') as string),
      estoque: Number(f.get('estoque') || 0),
      status: f.get('status') as string,
      cor_nome: (f.get('cor_nome') as string) || null,
      cor_hex: corHex,
      foto: fotos[0] ?? null,
      fotos,
      dimensoes: (f.get('dimensoes') as string) || null,
      peso_g: f.get('peso_g') ? Number(f.get('peso_g')) : null,
      descricao: (f.get('descricao') as string) || null,
    };
    try {
      if (editando.id) await crud.atualizar.mutateAsync({ id: editando.id, ...valores });
      else await crud.criar.mutateAsync(valores);
      setEditando(null);
      setErro(null);
      qc.invalidateQueries({ queryKey: ['variacao', produtoId] });
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (lista.isLoading) return <Carregando />;
  const tamanhos = Array.from(new Set((lista.data ?? []).map((v) => v.tamanho).filter(Boolean))).join(', ');
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-ink">SKUs do produto</p>
          <p className="text-xs text-texto-2">
            {(lista.data ?? []).length} variacoes{tamanhos ? ` · tamanhos: ${tamanhos}` : ''}
          </p>
        </div>
        {pode('produtos', 'editar') && <Botao onClick={() => abrir({ status: 'ativo' })}>+ {t('acoes.nova')}</Botao>}
      </div>
      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}
      {(lista.data ?? []).length === 0 ? (
        <EstadoVazio mensagem={t('produto.semVariacoes')} />
      ) : (
        <TabelaDados<Variacao>
          colunas={[
            {
              titulo: t('produto.variacao'),
              principal: true,
              render: (v) => (
                <span className="flex items-center gap-2 font-semibold text-ink">
                  {(v.fotos?.[0] ?? v.foto) ? (
                    <Foto path={v.fotos?.[0] ?? v.foto!} alt={v.nome} className="size-9 rounded-md object-cover" />
                  ) : v.cor_hex ? (
                    <Swatch hex={v.cor_hex} nome={v.nome} tamanho="size-5" />
                  ) : null}
                  <span>
                    {v.nome}
                    <span className="block text-[11px] font-medium text-texto-2">
                      {[v.codigo, v.status !== 'ativo' ? v.status : null].filter(Boolean).join(' · ') || 'SKU sem codigo'}
                    </span>
                  </span>
                </span>
              ),
            },
            { titulo: 'Tamanho', render: (v) => v.tamanho ?? '-' },
            {
              titulo: t('cores.cor'),
              render: (v) => v.cor_hex ? (
                <span className="flex items-center gap-1.5 text-texto-2">
                  <Swatch hex={v.cor_hex} nome={v.cor_nome ?? v.nome} /> {v.cor_nome ?? v.cor_hex}
                </span>
              ) : '—',
            },
            { titulo: 'Código', render: (v) => v.codigo ?? '—' },
            {
              titulo: 'Modelo 3D',
              render: (v) => v.modelo ? (
                <span>
                  {v.modelo.nome}
                  <span className="block text-[11px] text-texto-2">
                    {Math.round(Number(v.modelo.tempo_impressao_min) / 60)}h · {pesoModelo(v.modelo).toLocaleString('pt-BR')}g
                  </span>
                </span>
              ) : '-',
            },
            { titulo: t('orcamento.total'), numerica: true, render: (v) => <Dinheiro centavos={v.preco} /> },
            { titulo: t('estoque.saldo'), numerica: true, render: (v) => v.estoque },
          ]}
          linhas={lista.data!}
          chave={(v) => v.id}
          acoes={(v) =>
            pode('produtos', 'editar') ? (
              <span className="whitespace-nowrap">
                <Botao variante="fantasma" onClick={() => abrir(v)}>{t('acoes.editar')}</Botao>
                <Botao variante="fantasma" onClick={() => excluir(v)}>Excluir</Botao>
              </span>
            ) : null
          }
        />
      )}
      <Modal aberto={!!editando} titulo="Variacao / SKU" onFechar={() => setEditando(null)} largura="max-w-2xl">
        {editando && (
          <form onSubmit={salvar} className="space-y-3">
            <Campo rotulo="Nome da variacao" dica="Ex.: Canelado reto, Diagonal fina, Tampa com coracao">
              <Entrada name="nome" required defaultValue={editando.nome ?? ''} />
            </Campo>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Campo rotulo="Código">
                <Entrada name="codigo" defaultValue={editando.codigo ?? ''} />
              </Campo>
              <Campo rotulo="Tamanho">
                <Entrada name="tamanho" defaultValue={editando.tamanho ?? ''} placeholder="P, M, G, GG" />
              </Campo>
              <Campo rotulo={t('produto.precoPraticado')}>
                <EntradaDinheiro name="preco" defaultCentavos={editando.preco ?? 0} />
              </Campo>
              <Campo rotulo={t('estoque.saldo')}>
                <Entrada name="estoque" type="number" min="0" defaultValue={editando.estoque ?? 0} />
              </Campo>
            </div>
            {/* cor + foto da variação (v2) */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Campo rotulo="Modelo 3D tecnico" dica="Este modelo alimenta custo, tempo, peso e producao deste SKU.">
                <Selecao name="modelo_id" defaultValue={editando.modelo_id ?? ''}>
                  <option value="">-</option>
                  {(modelos.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {[m.codigo_interno, m.nome].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Status">
                <Selecao name="status" defaultValue={editando.status ?? 'ativo'}>
                  <option value="ativo">Ativo</option>
                  <option value="rascunho">Rascunho</option>
                  <option value="arquivado">Arquivado</option>
                </Selecao>
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Nome da cor">
                <Entrada name="cor_nome" defaultValue={editando.cor_nome ?? ''} placeholder="Rosa, Branco, Dourado..." />
              </Campo>
              <Campo rotulo={t('cores.cor')}>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={corHex ?? '#cccccc'}
                    onChange={(e) => setCorHex(e.target.value)}
                    aria-label={t('cores.cor')}
                    className="size-9 shrink-0 cursor-pointer rounded-lg border border-borda bg-white p-1"
                  />
                  {corHex ? (
                    <button type="button" onClick={() => setCorHex(null)}
                      className="text-xs font-semibold text-texto-2 hover:text-erro">
                      {t('cores.semCor')} ✕
                    </button>
                  ) : (
                    <span className="text-xs text-texto-2">{t('cores.semCor')}</span>
                  )}
                </div>
              </Campo>
              <Campo rotulo={t('cores.foto')}>
                <div className="flex items-center gap-2">
                  {fotos[0] && <Foto path={fotos[0]} alt="" className="size-9 rounded-md object-cover" />}
                  <Botao type="button" variante="secundario" disabled={enviandoFoto}
                    className="!px-2.5 !py-1.5 !text-xs"
                    onClick={() => inputFotoRef.current?.click()}>
                    {enviandoFoto ? '...' : `+ ${t('fotos.adicionar')}`}
                  </Botao>
                  {fotos.length > 0 && (
                    <button type="button" onClick={() => setFotos([])}
                      className="text-xs text-texto-2 hover:text-erro">✕</button>
                  )}
                </div>
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={t('novoProduto.dimensoes')}>
                <Entrada name="dimensoes" defaultValue={editando.dimensoes ?? ''} placeholder="12 x 12 x 10 cm" />
              </Campo>
              <Campo rotulo={t('novoProduto.peso')}>
                <Entrada name="peso_g" type="number" min="0" step="any" defaultValue={editando.peso_g ?? ''} />
              </Campo>
            </div>
            <Campo rotulo={t('formModelo.descricao')}>
              <textarea
                name="descricao"
                rows={2}
                defaultValue={editando.descricao ?? ''}
                className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm"
              />
            </Campo>
            <input ref={inputFotoRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => anexarFoto(e.target.files)} />
            {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function pesoModelo(modelo: ModeloVariacaoRef) {
  return (
    Number(modelo.peso_peca_g) +
    Number(modelo.peso_suporte_g) +
    Number(modelo.peso_purga_g) +
    Number(modelo.peso_desperdicio_g)
  );
}

// ----------------------------------------------------------- Margem por canal
function AbaCanais({ produtoId, custoAtual, custosVisiveis }: {
  produtoId: string; custoAtual: number | null; custosVisiveis: boolean;
}) {
  const { t } = useTranslation();
  const { pode, ativa, formato } = useAuth();
  const qc = useQueryClient();
  const canais = useLista<Canal>('canal_venda', { ordem: 'nome', desc: false });
  const [erro, setErro] = useState<string | null>(null);

  const precos = useQuery({
    queryKey: ['produto_canal', produtoId],
    enabled: !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produto_canal').select('*').eq('produto_id', produtoId).is('deleted_at', null);
      if (error) throw error;
      return data as ProdutoCanal[];
    },
  });

  async function salvarPreco(canalId: string, valor: string) {
    const preco = paraCentavos(valor);
    const existente = (precos.data ?? []).find((pc) => pc.canal_id === canalId);
    const { error } = existente
      ? await supabase.from('produto_canal').update({ preco_praticado: preco }).eq('id', existente.id)
      : await supabase.from('produto_canal').insert({
          tenant_id: ativa?.tenant_id, produto_id: produtoId, canal_id: canalId, preco_praticado: preco,
        });
    if (error) setErro(mensagemErro(error));
    else qc.invalidateQueries({ queryKey: ['produto_canal', produtoId] });
  }

  if (canais.isLoading || precos.isLoading) return <Carregando />;
  if ((canais.data ?? []).length === 0) {
    return <EstadoVazio mensagem={t('produto.semCanais')} />;
  }

  return (
    <div>
      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}
      <TabelaDados<Canal>
        colunas={[
          { titulo: t('calculadora.canal'), principal: true, render: (c) => <span className="font-semibold text-ink">{c.nome}</span> },
          {
            titulo: 'Taxas',
            render: (c) => percentual(Number(c.taxa_marketplace) + Number(c.taxa_pagamento) + Number(c.comissao), formato),
          },
          {
            titulo: t('produto.precoPraticado'),
            render: (c) => {
              const pc = (precos.data ?? []).find((x) => x.canal_id === c.id);
              return pode('produtos', 'editar') ? (
                <Entrada
                  defaultValue={pc ? deCentavos(pc.preco_praticado) : ''}
                  placeholder="0,00"
                  className="!w-24 !py-1 text-right"
                  onBlur={(e) => e.target.value && salvarPreco(c.id, e.target.value)}
                />
              ) : (
                <Dinheiro centavos={pc?.preco_praticado ?? null} />
              );
            },
          },
          {
            titulo: t('orcamento.lucroInterno'),
            numerica: true,
            render: (c) => {
              const pc = (precos.data ?? []).find((x) => x.canal_id === c.id);
              if (!custosVisiveis || !pc || custoAtual == null) return '•••';
              const taxas = Number(c.taxa_marketplace) + Number(c.taxa_pagamento) + Number(c.comissao);
              const lucro = Math.round(pc.preco_praticado * (1 - taxas)) - custoAtual;
              return (
                <span className={lucro >= 0 ? 'font-bold text-ok' : 'font-bold text-erro'}>
                  <Dinheiro centavos={lucro} />
                </span>
              );
            },
          },
          {
            titulo: t('orcamento.margemInterna'),
            numerica: true,
            render: (c) => {
              const pc = (precos.data ?? []).find((x) => x.canal_id === c.id);
              if (!custosVisiveis || !pc || custoAtual == null || pc.preco_praticado <= 0) return '•••';
              const taxas = Number(c.taxa_marketplace) + Number(c.taxa_pagamento) + Number(c.comissao);
              const lucro = Math.round(pc.preco_praticado * (1 - taxas)) - custoAtual;
              return percentual(lucro / pc.preco_praticado, formato);
            },
          },
        ]}
        linhas={canais.data!}
        chave={(c) => c.id}
      />
      <p className="mt-2 text-[11px] text-texto-2">{t('produto.margemCanalDica')}</p>
    </div>
  );
}

// --------------------------------------------------------------- Composição
function AbaComposicao({ produtoId, itens, total, custosVisiveis, aoMudar }: {
  produtoId: string;
  itens: ItemComposicao[];
  total: number;
  custosVisiveis: boolean;
  aoMudar: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const crudItem = useCrud('composicao_item');
  const [editando, setEditando] = useState<Partial<ItemComposicao> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const modelos = useLista<{ id: string; nome: string }>('modelo_3d', { ordem: 'nome', desc: false });
  const materiais = useLista<{ id: string; nome: string; tipo: string }>('material', { ordem: 'nome', desc: false });
  const tarefas = useLista<{ id: string; nome: string }>('tarefa_mao_obra', { ordem: 'nome', desc: false });

  const ICONE_TIPO: Record<ItemComposicao['tipo'], string> = {
    modelo_impresso: '⬢', componente: '⚙', embalagem: '📦', servico: '🔧', mao_de_obra: '👤',
  };

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
      material_id: ['componente', 'embalagem', 'modelo_impresso'].includes(tipo)
        ? (f.get('material_id') as string) || null
        : null,
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

  const tipoSel = (editando?.tipo ?? 'componente') as ItemComposicao['tipo'];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">{t('produto.composicao')}</h2>
          {pode('produtos', 'editar') && (
            <Botao onClick={() => setEditando({})}>+ {t('produto.adicionarItem')}</Botao>
          )}
        </div>
        {itens.length === 0 ? (
          <EstadoVazio
            mensagem={t('calculadora.semItens')}
            acao={pode('produtos', 'editar') ? <Botao onClick={() => setEditando({})}>+ {t('produto.adicionarItem')}</Botao> : undefined}
          />
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
                  return (
                    <span className="font-semibold text-ink">
                      <span className="mr-1.5 opacity-60">{ICONE_TIPO[item.tipo]}</span>
                      {nome ?? '—'}
                    </span>
                  );
                },
              },
              {
                titulo: 'Tipo',
                render: (item) => (
                  <Etiqueta cor={item.tipo === 'modelo_impresso' ? 'roxo' : 'cinza'}>
                    {t(`produto.tipoItem.${item.tipo}`)}
                  </Etiqueta>
                ),
              },
              { titulo: t('produto.quantidade'), numerica: true, render: (item) => `${Number(item.quantidade)} ${item.unidade}` },
              {
                titulo: t('produto.custoUnit'),
                numerica: true,
                render: (item) => <Dinheiro centavos={custosVisiveis ? custoItemComposicao(item) : null} />,
              },
              {
                titulo: t('produto.subtotal'),
                numerica: true,
                render: (item) => (
                  <span className="font-semibold">
                    <Dinheiro centavos={custosVisiveis ? Math.round(custoItemComposicao(item) * Number(item.quantidade)) : null} />
                  </span>
                ),
              },
            ]}
            linhas={itens}
            chave={(item) => item.id}
            acoes={(item) =>
              pode('produtos', 'editar') ? (
                <span className="whitespace-nowrap">
                  <Botao variante="fantasma" onClick={() => setEditando(item)}>{t('acoes.editar')}</Botao>
                  <Botao variante="fantasma" onClick={() => removerItem(item.id)}>✕</Botao>
                </span>
              ) : null
            }
          />
        )}
      </div>

      {/* resumo da composição — card único com total grande + dica recolhível (v2) */}
      <div className="space-y-3 lg:sticky lg:top-16 lg:h-fit">
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('produto.totalComposicao')}</p>
          <p className="mt-1 text-2xl font-extrabold grad-texto tabular-nums">
            <Dinheiro centavos={custosVisiveis ? total : null} />
          </p>
          <p className="mt-0.5 text-[11px] text-texto-2">{itens.length} {t('produto.itens')}</p>
        </Cartao>
        <Acordeao titulo={t('produto.dicaComposicaoTitulo')}>
          <p className="text-xs text-texto-2">{t('produto.dicaComposicao')}</p>
        </Acordeao>
      </div>

      <Modal aberto={!!editando} titulo={t('produto.adicionarItem')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvarItem} className="space-y-3" key={editando.id ?? 'novo'}>
            <Campo rotulo="Tipo">
              <Selecao
                name="tipo"
                value={tipoSel}
                onChange={(e) => setEditando({ ...editando, tipo: e.target.value as ItemComposicao['tipo'] })}
              >
                {(['modelo_impresso', 'componente', 'embalagem', 'mao_de_obra', 'servico'] as const).map((tp) => (
                  <option key={tp} value={tp}>{t(`produto.tipoItem.${tp}`)}</option>
                ))}
              </Selecao>
            </Campo>

            {tipoSel === 'modelo_impresso' && (
              <>
                <Campo rotulo={t('nav.modelos')}>
                  <Selecao name="modelo_id" required defaultValue={editando.modelo_id ?? ''}>
                    <option value="">—</option>
                    {(modelos.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </Selecao>
                </Campo>
                <Campo rotulo="Material (sobrepõe o recomendado)" dica="Vazio = usa o material recomendado do modelo">
                  <Selecao name="material_id" defaultValue={editando.material_id ?? ''}>
                    <option value="">—</option>
                    {(materiais.data ?? []).filter((m) => m.tipo === 'filamento' || m.tipo === 'resina')
                      .map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </Selecao>
                </Campo>
              </>
            )}

            {(tipoSel === 'componente' || tipoSel === 'embalagem') && (
              <Campo rotulo={t('cadastros.materiais')}>
                <Selecao name="material_id" required defaultValue={editando.material_id ?? ''}>
                  <option value="">—</option>
                  {(materiais.data ?? []).filter((m) =>
                    tipoSel === 'embalagem' ? m.tipo === 'embalagem' : m.tipo !== 'filamento' && m.tipo !== 'resina',
                  ).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </Selecao>
              </Campo>
            )}

            {tipoSel === 'mao_de_obra' && (
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo={t('cadastros.tarefa.nome')}>
                  <Selecao name="tarefa_id" required defaultValue={editando.tarefa_id ?? ''}>
                    <option value="">—</option>
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
                <Campo rotulo="Descrição">
                  <Entrada name="descricao" required defaultValue={editando.descricao ?? ''} />
                </Campo>
                <Campo rotulo={t('produto.custoAtual')}>
                  <EntradaDinheiro name="custo_manual" defaultCentavos={Number(editando.custo_manual ?? 0)} />
                </Campo>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={t('produto.quantidade')}>
                <Entrada name="quantidade" type="number" step="any" min="0.0001" required defaultValue={editando.quantidade ?? 1} />
              </Campo>
              <Campo rotulo="Unidade">
                <Entrada name="unidade" defaultValue={editando.unidade ?? 'un'} />
              </Campo>
            </div>

            {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
