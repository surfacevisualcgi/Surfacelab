/**
 * Biblioteca de Modelos 3D.
 * Lista operacional em tela cheia: KPIs, filtros e cards técnicos.
 * A ficha detalhada fica em /modelos/:id.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { mensagemErro, useCrud, useLista } from '@/lib/dados';
import { duracao, moeda } from '@/lib/formato';
import { Botao, Carregando, Entrada, EstadoErro, EstadoVazio, Selecao } from '@/components/ui';
import { FotoOuPlaceholder } from '@/components/GaleriaFotos';
import { LinhaSwatches } from '@/components/Cores';
import { FormularioModelo, type ModeloEdit } from './FormularioModelo';
import { ImportarModeloStl } from './ImportarModeloStl';
import { useAuth } from '@/auth/AuthProvider';

export interface Modelo3D {
  id: string;
  nome: string;
  fotos: string[];
  cores: { nome: string; hex: string; foto?: string }[];
  codigo_interno: string | null;
  categoria_id: string | null;
  tags: string[];
  dimensoes: string | null;
  largura_mm: number | null;
  profundidade_mm: number | null;
  altura_mm: number | null;
  volume_mm3: number | null;
  arquivo_original: string | null;
  arquivo_original_nome: string | null;
  arquivo_original_tamanho_bytes: number | null;
  versao: string;
  tecnologia: 'fdm' | 'resina';
  tempo_impressao_min: number;
  peso_peca_g: number;
  peso_suporte_g: number;
  peso_purga_g: number;
  peso_desperdicio_g: number;
  probabilidade_falha: number;
  material_recomendado_id: string | null;
  impressora_recomendada_id: string | null;
  origem: string;
  qtd_producoes: number;
  custo_estimado: number;
  custo_real_medio: number;
  updated_at?: string;
}

interface MaterialRef {
  id: string;
  nome: string;
  tipo: string;
  unidade_consumo: string;
  custo_medio: number;
  custo_unitario: number;
}

interface ImpressoraRef {
  id: string;
  nome: string;
  valor_aquisicao: number;
  vida_util_horas: number;
  consumo_w: number;
  manutencao_hora: number;
}

interface CategoriaRef {
  id: string;
  nome: string;
  escopo: string;
}

const ICONES = {
  upload: 'M12 3 6 9h4v8h4V9h4l-6-6ZM5 19h14v2H5v-2Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  cubo: 'M12 2 3.5 6.8v10.4L12 22l8.5-4.8V6.8L12 2Zm0 2.3 5.9 3.3L12 10.9 6.1 7.6 12 4.3ZM5.5 9.4l5.5 3.1v6.4l-5.5-3.1V9.4Zm7.5 9.5v-6.4l5.5-3.1v6.4L13 18.9Z',
  check: 'M9.5 16.5 5.5 12.5 7 11l2.5 2.5L17 6l1.5 1.5-9 9Z',
  alerta: 'M12 2 22 20H2L12 2Zm1 14h-2v2h2v-2Zm0-7h-2v5h2V9Z',
  clock: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5v5l4 2-.9 1.8L11 13V7h2Z',
  material: 'M4 5h16v5H4V5Zm1 7h14l-1 7H6l-1-7Zm4-10h6v2H9V2Z',
  filtro: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z',
  olho: 'M12 5c5 0 8.5 4.5 9.5 7-1 2.5-4.5 7-9.5 7S3.5 14.5 2.5 12C3.5 9.5 7 5 12 5Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
  calc: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4h10v3H7V7Zm0 5h3v2H7v-2Zm0 4h3v2H7v-2Zm5-4h2v2h-2v-2Zm0 4h2v2h-2v-2Zm5-4h2v6h-2v-6Z',
  dots: 'M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  edit: 'M4 17.5V21h3.5L18.8 9.7l-3.5-3.5L4 17.5ZM20.7 7.8a1 1 0 0 0 0-1.4l-3.1-3.1a1 1 0 0 0-1.4 0l-1.4 1.4 4.5 4.5 1.4-1.4Z',
  trash: 'M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-.8 12H6.8L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z',
  printer: 'M6 9V3h12v6h2a2 2 0 0 1 2 2v6h-4v4H6v-4H2v-6a2 2 0 0 1 2-2h2Zm2-4v4h8V5H8Zm0 10v4h8v-4H8Z',
  tag: 'M3 11V4h7l11 11-6 6L3 11Zm5-3a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z',
  spark: 'M12 2 9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5L12 2Z',
};

function Icone({ d, className = '' }: { d: string; className?: string }) {
  return (
    <svg className={className} width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function PaginaModelos() {
  const { t } = useTranslation();
  const { pode, formato } = useAuth();
  const lista = useLista<Modelo3D>('modelo_3d', { ordem: 'nome', desc: false });
  const crud = useCrud('modelo_3d');
  const categorias = useLista<CategoriaRef>('categoria', { ordem: 'nome', desc: false });
  const materiais = useLista<MaterialRef>('material', { ordem: 'nome', desc: false });
  const impressoras = useLista<ImpressoraRef>('impressora', { ordem: 'nome', desc: false });
  const [editando, setEditando] = useState<ModeloEdit | null>(null);
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroMaterial, setFiltroMaterial] = useState('');
  const [filtroTec, setFiltroTec] = useState('');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);

  async function excluirModelo(modelo: Modelo3D) {
    const confirmou = window.confirm(`Excluir o modelo "${modelo.nome}"?`);
    if (!confirmou) return;

    try {
      await crud.excluir.mutateAsync(modelo.id);
      if (selecionadoId === modelo.id) setSelecionadoId(null);
    } catch (erro) {
      window.alert(mensagemErro(erro));
    }
  }

  const modelos = lista.data ?? [];
  const materiaisPorId = useMemo(() => new Map((materiais.data ?? []).map((m) => [m.id, m])), [materiais.data]);
  const impressorasPorId = useMemo(() => new Map((impressoras.data ?? []).map((i) => [i.id, i])), [impressoras.data]);
  const categoriasPorId = useMemo(() => new Map((categorias.data ?? []).map((c) => [c.id, c])), [categorias.data]);
  const categoriasModelo = (categorias.data ?? []).filter((c) => c.escopo === 'modelo');

  const filtrados = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    return modelos.filter((m) => {
      const material = m.material_recomendado_id ? materiaisPorId.get(m.material_recomendado_id) : null;
      const impressora = m.impressora_recomendada_id ? impressorasPorId.get(m.impressora_recomendada_id) : null;
      const categoria = m.categoria_id ? categoriasPorId.get(m.categoria_id) : null;
      const peso = pesoTotal(m);
      const okBusca = !alvo
        || m.nome.toLowerCase().includes(alvo)
        || (m.codigo_interno ?? '').toLowerCase().includes(alvo)
        || (material?.nome ?? '').toLowerCase().includes(alvo)
        || (impressora?.nome ?? '').toLowerCase().includes(alvo)
        || (categoria?.nome ?? '').toLowerCase().includes(alvo)
        || (m.tags ?? []).some((tag) => tag.toLowerCase().includes(alvo));
      return okBusca
        && (!filtroCategoria || m.categoria_id === filtroCategoria)
        && (!filtroMaterial || m.material_recomendado_id === filtroMaterial)
        && (!filtroTec || m.tecnologia === filtroTec)
        && peso >= 0;
    });
  }, [busca, categoriasPorId, filtroCategoria, filtroMaterial, filtroTec, impressorasPorId, materiaisPorId, modelos]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaAtual = Math.min(pagina, paginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);
  const selecionado = modelos.find((m) => m.id === (selecionadoId ?? visiveis[0]?.id)) ?? visiveis[0] ?? modelos[0] ?? null;

  const kpis = useMemo(() => {
    const prontos = modelos.filter((m) => modeloOk(m)).length;
    const semImpressora = modelos.filter((m) => !m.impressora_recomendada_id).length;
    const tempoMedio = modelos.length
      ? Math.round(modelos.reduce((s, m) => s + Number(m.tempo_impressao_min), 0) / modelos.length)
      : 0;
    const materialTotal = modelos.reduce((s, m) => s + pesoTotal(m), 0);
    return { prontos, semImpressora, tempoMedio, materialTotal };
  }, [modelos]);

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  const comFiltro = !!(busca || filtroCategoria || filtroMaterial || filtroTec);

  return (
    <div className="flex min-h-0 flex-col text-[13px] xl:h-[calc(100dvh-112px)] xl:overflow-hidden">
      <section className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('modelo.titulo')}</h1>
          <p className="mt-1 text-sm text-texto-2">{t('modelo.listaSubtitulo')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" onClick={() => setImportando(true)} disabled={!pode('modelos', 'criar')}>
            <Icone d={ICONES.upload} /> {t('modelo.importarStl')}
          </Botao>
          {pode('modelos', 'criar') && (
            <Botao onClick={() => setEditando({})}>
              <Icone d={ICONES.plus} /> {t('modelo.novo')}
            </Botao>
          )}
        </div>
      </section>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icone={ICONES.cubo} tom="blue" rotulo={t('modelo.kpi.ativos')} valor={String(modelos.length)} detalhe={t('modelo.kpi.arquivos')} />
            <KpiCard icone={ICONES.check} tom="green" rotulo={t('modelo.kpi.prontos')} valor={String(kpis.prontos)} detalhe={t('modelo.kpi.completos')} />
            <KpiCard icone={ICONES.alerta} tom={kpis.semImpressora > 0 ? 'red' : 'green'} rotulo={t('modelo.kpi.semImpressora')} valor={String(kpis.semImpressora)} detalhe={t('modelo.kpi.revisao')} />
            <KpiCard icone={ICONES.clock} tom="purple" rotulo={t('modelo.kpi.tempoMedio')} valor={duracao(kpis.tempoMedio)} detalhe={t('modelo.kpi.porModelo')} />
            <KpiCard icone={ICONES.material} tom="green" rotulo={t('modelo.kpi.material')} valor={formatarMaterial(kpis.materialTotal, 'fdm', formato.locale)} detalhe={t('modelo.kpi.consumoTotal')} />
          </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-col gap-2 px-1 pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-ink">{t('modelo.biblioteca')}</h2>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-extrabold text-texto-2">
                {filtrados.length} {t('modelo.modelos')}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Entrada
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
                placeholder={t('modelo.buscarPlaceholder')}
                className="h-10 min-w-0 flex-1"
              />
              <Selecao value={filtroCategoria} onChange={(e) => { setFiltroCategoria(e.target.value); setPagina(1); }} className="!h-10 !w-[190px] shrink-0">
                <option value="">{t('modelo.todasCategorias')}</option>
                {categoriasModelo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
              <Selecao value={filtroTec} onChange={(e) => { setFiltroTec(e.target.value); setPagina(1); }} className="!h-10 !w-[160px] shrink-0">
                <option value="">{t('modelo.todasTecnologias')}</option>
                <option value="fdm">FDM</option>
                <option value="resina">Resina</option>
              </Selecao>
              <Selecao value={filtroMaterial} onChange={(e) => { setFiltroMaterial(e.target.value); setPagina(1); }} className="!h-10 !w-[190px] shrink-0">
                <option value="">{t('modelo.todosMateriais')}</option>
                {(materiais.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Selecao>
              <Botao
                type="button"
                variante="secundario"
                className="h-10 shrink-0"
                disabled={!comFiltro}
                onClick={() => {
                  setBusca('');
                  setFiltroCategoria('');
                  setFiltroMaterial('');
                  setFiltroTec('');
                  setPagina(1);
                }}
              >
                <Icone d={ICONES.filtro} /> Limpar
              </Botao>
            </div>
          </div>

          {filtrados.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <EstadoVazio
                mensagem={comFiltro ? t('estados.semResultados') : undefined}
                acao={pode('modelos', 'criar') && !comFiltro ? <Botao onClick={() => setEditando({})}>+ {t('modelo.novo')}</Botao> : undefined}
              />
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-auto bg-transparent pr-1">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {visiveis.map((m) => (
                    <ModeloCard
                      key={m.id}
                      modelo={m}
                      ativo={selecionado?.id === m.id}
                      material={m.material_recomendado_id ? materiaisPorId.get(m.material_recomendado_id) : undefined}
                      impressora={m.impressora_recomendada_id ? impressorasPorId.get(m.impressora_recomendada_id) : undefined}
                      categoria={m.categoria_id ? categoriasPorId.get(m.categoria_id) : undefined}
                      formato={formato}
                      podeEditar={pode('modelos', 'editar')}
                      podeExcluir={pode('modelos', 'editar')}
                      excluindo={crud.excluir.isPending}
                      onSelecionar={() => setSelecionadoId(m.id)}
                      onEditar={() => setEditando(m)}
                      onExcluir={() => excluirModelo(m)}
                    />
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 py-3 text-xs text-texto-2">
                <span>{t('modelo.mostrando', { inicio: (paginaAtual - 1) * porPagina + 1, fim: Math.min(paginaAtual * porPagina, filtrados.length), total: filtrados.length })}</span>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-borda px-2 py-1 disabled:opacity-40" disabled={paginaAtual <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}>‹</button>
                  <span className="rounded-lg bg-brand-roxo px-2 py-1 font-extrabold text-white">{paginaAtual}</span>
                  <button className="rounded-lg border border-borda px-2 py-1 disabled:opacity-40" disabled={paginaAtual >= paginas} onClick={() => setPagina((p) => Math.min(paginas, p + 1))}>›</button>
                  <Selecao
                    value={String(porPagina)}
                    onChange={(e) => {
                      setPorPagina(Number(e.target.value));
                      setPagina(1);
                    }}
                    className="!h-8 !w-[132px] !py-1 !text-xs"
                  >
                    {[10, 20, 50, 100].map((qtd) => (
                      <option key={qtd} value={qtd}>{qtd} {t('modelo.porPagina')}</option>
                    ))}
                  </Selecao>
                </div>
              </div>
            </>
          )}
          </section>
        </div>

      </div>

      <FormularioModelo
        modelo={editando}
        aberto={!!editando}
        onFechar={() => setEditando(null)}
        onSalvo={() => setEditando(null)}
      />
      <ImportarModeloStl
        aberto={importando}
        onFechar={() => setImportando(false)}
        onSalvo={(id) => {
          setImportando(false);
          setSelecionadoId(id);
          lista.refetch();
        }}
      />
    </div>
  );
}

function ModeloCard({
  modelo,
  ativo,
  material,
  impressora,
  categoria,
  formato,
  podeEditar,
  podeExcluir,
  excluindo,
  onSelecionar,
  onEditar,
  onExcluir,
}: {
  modelo: Modelo3D;
  ativo: boolean;
  material?: MaterialRef;
  impressora?: ImpressoraRef;
  categoria?: CategoriaRef;
  formato: ReturnType<typeof useAuth>['formato'];
  podeEditar: boolean;
  podeExcluir: boolean;
  excluindo: boolean;
  onSelecionar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const { t } = useTranslation();
  const [menuAberto, setMenuAberto] = useState(false);
  const peso = pesoTotal(modelo);
  const un = modelo.tecnologia === 'resina' ? 'ml' : 'g';
  const ok = modeloOk(modelo);
  const custo = custoTecnico(modelo, material, impressora);

  return (
    <article
      onClick={onSelecionar}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white transition-all hover:-translate-y-0.5 hover:shadow-md ${
        ativo ? 'border-brand-roxo shadow-sm ring-2 ring-brand-roxo/10' : 'border-borda'
      }`}
    >
      <Link to={`/modelos/${modelo.id}`} className="relative block overflow-hidden bg-gradient-to-br from-surface-2 to-white">
        <FotoOuPlaceholder path={modelo.fotos?.[0]} alt={modelo.nome} className="aspect-[16/10] w-full object-cover" />
        <div className="absolute left-2 top-2 flex gap-1">
          <Chip cor="roxo">{modelo.tecnologia.toUpperCase()}</Chip>
          <Chip cor={ok ? 'verde' : 'amarelo'}>{ok ? 'OK' : t('modelo.revisar')}</Chip>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-2.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <Link to={`/modelos/${modelo.id}`} className="block truncate text-[13px] font-black text-ink group-hover:text-brand-roxo">
              {modelo.nome}
            </Link>
            <p className="mt-0.5 truncate text-[10px] font-medium text-texto-2">
              {modelo.codigo_interno || modelo.versao || 'MDL'} · {categoria?.nome ?? t('modelo.semCategoria')}
            </p>
          </div>
          <div className="relative shrink-0">
            <button
              className="rounded-lg p-1 text-texto-2 hover:bg-surface-2 hover:text-ink"
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuAberto}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuAberto((aberto) => !aberto);
              }}
            >
              <Icone d={ICONES.dots} />
            </button>
            {menuAberto && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-borda bg-white py-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {podeEditar && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-surface-2"
                    onClick={() => {
                      setMenuAberto(false);
                      onEditar();
                    }}
                  >
                    <Icone d={ICONES.edit} /> {t('acoes.editar')}
                  </button>
                )}
                {podeExcluir && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={excluindo}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-erro hover:bg-erro/5 disabled:opacity-50"
                    onClick={() => {
                      setMenuAberto(false);
                      onExcluir();
                    }}
                  >
                    <Icone d={ICONES.trash} /> Excluir
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {(modelo.cores ?? []).length > 0 && <div className="mt-1.5"><LinhaSwatches cores={modelo.cores} /></div>}
        {(modelo.tags ?? []).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(modelo.tags ?? []).slice(0, 3).map((tag) => <Chip key={tag} cor="azul">{tag}</Chip>)}
            {(modelo.tags ?? []).length > 3 && <Chip cor="azul">+{(modelo.tags ?? []).length - 3}</Chip>}
          </div>
        )}

        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
          <MiniDado icone={ICONES.clock} rotulo={t('modelo.tempoCurto')} valor={duracao(modelo.tempo_impressao_min)} />
          <MiniDado icone={ICONES.material} rotulo={t('modelo.pesoTotal')} valor={`${peso.toLocaleString(formato.locale)}${un}`} />
          <MiniDado icone={ICONES.cubo} rotulo={t('novoProduto.dimensoes')} valor={dimensoesModelo(modelo) ?? 'Sem dimensoes'} erro={!dimensoesModelo(modelo)} />
          <MiniDado icone={ICONES.tag} rotulo={t('modelo.materialCurto')} valor={material?.nome ?? t('modelo.semMaterial')} erro={!material} />
          <MiniDado icone={ICONES.printer} rotulo={t('modelo.impressoraCurta')} valor={impressora?.nome ?? t('modelo.semImpressoraCurto')} erro={!impressora} />
        </div>

        <div className="mt-2 rounded-lg bg-surface-2 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[10px] font-bold text-texto-2">{t('modelo.custoTecnico')}</p>
            <p className="shrink-0 text-xs font-black tabular-nums text-ink">{moeda(custo, formato)}</p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Link to={`/modelos/${modelo.id}`} className="flex h-8 items-center justify-center rounded-lg border border-borda text-texto-2 hover:bg-surface-2 hover:text-ink" title={t('acoes.ver')}>
            <Icone d={ICONES.olho} />
          </Link>
          <Link to={`/calculadora?modelo=${modelo.id}`} className="flex h-8 items-center justify-center rounded-lg border border-borda text-texto-2 hover:bg-surface-2 hover:text-brand-roxo" title={t('modelo.usarNoCalculo')}>
            <Icone d={ICONES.calc} />
          </Link>
          {podeEditar ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); onEditar(); }} className="flex h-8 items-center justify-center rounded-lg border border-borda text-texto-2 hover:bg-surface-2 hover:text-ink" title={t('acoes.editar')}>
              <Icone d={ICONES.edit} />
            </button>
          ) : (
            <button type="button" className="flex h-8 items-center justify-center rounded-lg border border-borda text-texto-2" title={t('acoes.ver')}>
              <Icone d={ICONES.dots} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function KpiCard({ icone, rotulo, valor, detalhe, tom }: { icone: string; rotulo: string; valor: string; detalhe: string; tom: 'blue' | 'green' | 'red' | 'purple' }) {
  const estilos = {
    blue: ['bg-brand-azul/10 text-brand-azul', 'text-brand-azul'],
    green: ['bg-ok/10 text-ok', 'text-ok'],
    red: ['bg-erro/10 text-erro', 'text-erro'],
    purple: ['bg-brand-roxo/10 text-brand-roxo', 'text-brand-roxo'],
  }[tom];
  return (
    <div className="rounded-2xl border border-borda bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${estilos[0]}`}><Icone d={icone} /></span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{rotulo}</p>
          <p className={`truncate text-lg font-black tabular-nums ${estilos[1]}`}>{valor}</p>
          <p className="truncate text-[11px] text-texto-2">{detalhe}</p>
        </div>
      </div>
    </div>
  );
}

function Chip({ children, cor }: { children: React.ReactNode; cor: 'verde' | 'amarelo' | 'roxo' | 'azul' }) {
  const cls = {
    verde: 'bg-ok/10 text-ok',
    amarelo: 'bg-alerta/10 text-alerta',
    roxo: 'bg-brand-roxo/10 text-brand-roxo',
    azul: 'bg-brand-azul/10 text-brand-azul',
  }[cor];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${cls}`}>{children}</span>;
}

function MiniDado({ icone, rotulo, valor, erro = false }: { icone: string; rotulo: string; valor: string; erro?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icone d={icone} className={`shrink-0 ${erro ? 'text-erro' : 'text-texto-2'}`} />
      <span className={`truncate font-semibold ${erro ? 'text-erro' : 'text-texto-2'}`} title={`${rotulo}: ${valor}`}>{valor}</span>
    </div>
  );
}

function pesoTotal(m: Modelo3D) {
  return Number(m.peso_peca_g) + Number(m.peso_suporte_g) + Number(m.peso_purga_g) + Number(m.peso_desperdicio_g);
}

function modeloOk(m: Modelo3D) {
  return !!m.material_recomendado_id
    && !!m.impressora_recomendada_id
    && !!dimensoesModelo(m)
    && pesoTotal(m) > 0
    && Number(m.tempo_impressao_min) > 0;
}

function custoMaterial(m?: MaterialRef) {
  if (!m) return 0;
  return Number(m.custo_medio) > 0 ? Number(m.custo_medio) : Number(m.custo_unitario);
}

function custoTecnico(m: Modelo3D, material?: MaterialRef, impressora?: ImpressoraRef) {
  const materialTotal = Math.round(pesoTotal(m) * custoMaterial(material));
  if (!impressora || Number(m.tempo_impressao_min) <= 0) return materialTotal;
  const amortizacaoHora = Number(impressora.vida_util_horas) > 0
    ? Number(impressora.valor_aquisicao) / Number(impressora.vida_util_horas)
    : 0;
  const maquina = Math.round((Number(m.tempo_impressao_min) / 60) * (amortizacaoHora + Number(impressora.manutencao_hora)));
  const salvo = Number(m.custo_estimado || m.custo_real_medio || 0);
  return salvo > 0 ? salvo : materialTotal + maquina;
}

function formatarMaterial(valor: number, tecnologia: 'fdm' | 'resina', locale: string) {
  const un = tecnologia === 'resina' ? 'ml' : 'g';
  if (tecnologia === 'fdm' && valor >= 1000) return `${(valor / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} kg`;
  return `${Math.round(valor).toLocaleString(locale)} ${un}`;
}

function dimensoesModelo(m: Pick<Modelo3D, 'dimensoes' | 'largura_mm' | 'profundidade_mm' | 'altura_mm'>) {
  const l = Number(m.largura_mm);
  const p = Number(m.profundidade_mm);
  const a = Number(m.altura_mm);
  if (l > 0 && p > 0 && a > 0) return `${l.toLocaleString('pt-BR')} x ${p.toLocaleString('pt-BR')} x ${a.toLocaleString('pt-BR')} mm`;
  return m.dimensoes;
}
