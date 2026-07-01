/**
 * Tela 17 — Cadastros de apoio em abas: impressoras, materiais, canais,
 * custos fixos, mão de obra, energia. (Estrutura do protótipo, pele Surface.)
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, moeda, paraCentavos } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Cartao, Dinheiro, Entrada,
  EntradaDinheiro, EntradaSugestao, EstadoErro, EstadoVazio, Etiqueta, Modal, Selecao, Tabela,
  TabelaDados,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { enviarFoto } from '@/lib/fotos';
import { FotoOuPlaceholder } from '@/components/GaleriaFotos';
import {
  ACABAMENTOS_FILAMENTO, POLIMEROS_FILAMENTO, SUBTIPOS_RESINA,
  UNIDADE_PADRAO, marcasDe, presetsDeMaterialSimples,
} from './materiais-catalogo';
import { SETUP_PRESETS, type RegiaoSetup } from './setup-presets';
import { AbaFiscal } from '../configuracoes/PaginaConfiguracoes';
import iconeCaixa from '@/assets/cadastros/caixa.png';
import iconeCanaisDeVenda from '@/assets/cadastros/canais-de-venda.png';
import iconeCategoria from '@/assets/cadastros/categoria.png';
import iconeCustosFixos from '@/assets/cadastros/custos-fixos.png';
import iconeEnergia from '@/assets/cadastros/energia.png';
import iconeFilamento from '@/assets/cadastros/filamento.png';
import iconeFiscal from '@/assets/cadastros/fiscal.png';
import iconeImpressora3d from '@/assets/cadastros/impressora-3d.png';
import iconeMaoDeObra from '@/assets/cadastros/mao-de-obra.png';

type Aba = 'materiais' | 'impressoras' | 'energia' | 'fornecedores' | 'canais' | 'custosFixos' | 'maoDeObra' | 'fiscal' | 'categorias';
type FiltroCadastros = 'todos' | 'operacao' | 'comercial' | 'custos' | 'fiscal';
type IconeCadastroTipo = 'material' | 'impressora' | 'energia' | 'fornecedor' | 'canal' | 'custo' | 'maoDeObra' | 'fiscal' | 'categoria';

/**
 * Estrutura v2 (tela 17): central de cadastros como GRADE DE CARTÕES de
 * atalho agrupados por seção, com anel de progresso de configuração e
 * pendências no painel lateral. Clicar num cartão abre a seção.
 */
export function PaginaCadastros() {
  const { t } = useTranslation();
  const { ativa, idioma, pode } = useAuth();
  const qc = useQueryClient();
  const [secao, setSecao] = useState<Aba | null>(null);
  const [aplicando, setAplicando] = useState<RegiaoSetup | null>(null);
  const [msgSetup, setMsgSetup] = useState<string | null>(null);
  const [erroSetup, setErroSetup] = useState<string | null>(null);
  const [filtroVisao, setFiltroVisao] = useState<FiltroCadastros>('todos');

  const contagens = useQuery({
    queryKey: ['cadastros-contagens', ativa?.tenant_id],
    enabled: !!ativa,
    queryFn: async () => {
      const tabelas = ['material', 'impressora', 'canal_venda', 'custo_fixo', 'tarefa_mao_obra', 'perfil_energia', 'fornecedor', 'perfil_fiscal', 'categoria'] as const;
      const resultados = await Promise.all(
        tabelas.map((tb) =>
          supabase.from(tb).select('id', { count: 'exact', head: true }).is('deleted_at', null),
        ),
      );
      return Object.fromEntries(tabelas.map((tb, i) => [tb, resultados[i].count ?? 0]));
    },
  });

  const c = contagens.data ?? {};
  const cartoes: { id: Aba; tabela: string; rotulo: string; descricao: string; grupo: string; icone: string }[] = [
    { id: 'materiais', tabela: 'material', rotulo: t('cadastros.materiais'), descricao: t('cadastros.descMateriais'), grupo: 'operacao', icone: '🧵' },
    { id: 'impressoras', tabela: 'impressora', rotulo: t('cadastros.impressoras'), descricao: t('cadastros.descImpressoras'), grupo: 'operacao', icone: '🖨' },
    { id: 'energia', tabela: 'perfil_energia', rotulo: t('cadastros.energia'), descricao: t('cadastros.descEnergia'), grupo: 'operacao', icone: '⚡' },
    { id: 'fornecedores', tabela: 'fornecedor', rotulo: t('cadastros.fornecedores'), descricao: t('cadastros.descFornecedores'), grupo: 'operacao', icone: '🚚' },
    { id: 'canais', tabela: 'canal_venda', rotulo: t('cadastros.canais'), descricao: t('cadastros.descCanais'), grupo: 'comercial', icone: '🛒' },
    { id: 'custosFixos', tabela: 'custo_fixo', rotulo: t('cadastros.custosFixos'), descricao: t('cadastros.descCustosFixos'), grupo: 'comercial', icone: '📋' },
    { id: 'maoDeObra', tabela: 'tarefa_mao_obra', rotulo: t('cadastros.maoDeObra'), descricao: t('cadastros.descMaoDeObra'), grupo: 'comercial', icone: '👤' },
    { id: 'fiscal', tabela: 'perfil_fiscal', rotulo: t('nav.fiscal'), descricao: t('config.avisoFiscal'), grupo: 'comercial', icone: '🧾' },
    { id: 'categorias', tabela: 'categoria', rotulo: t('cadastros.categorias'), descricao: t('cadastros.descCategorias'), grupo: 'comercial', icone: '🏷' },
  ];
  const pendentes = cartoes.filter((card) => (c[card.tabela] ?? 0) === 0);
  const progresso = cartoes.length > 0 ? ((cartoes.length - pendentes.length) / cartoes.length) * 100 : 0;
  const regiaoSetup: RegiaoSetup = idioma === 'pt-BR' ? 'br' : 'us';
  const setupInicialVazio = !contagens.isLoading && (
    Number(c.fornecedor ?? 0) +
    Number(c.canal_venda ?? 0) +
    Number(c.custo_fixo ?? 0) +
    Number(c.tarefa_mao_obra ?? 0) +
    Number(c.perfil_energia ?? 0) === 0
  );

  async function inserirFaltantes(tabela: string, linhas: Record<string, unknown>[]) {
    if (!ativa || linhas.length === 0) return 0;
    const { data, error } = await supabase
      .from(tabela)
      .select('nome')
      .is('deleted_at', null);
    if (error) throw error;
    const existentes = new Set((data ?? []).map((l) => String((l as { nome: string }).nome).toLowerCase()));
    const novas = linhas
      .filter((l) => !existentes.has(String(l.nome).toLowerCase()))
      .map((l) => ({ ...l, tenant_id: ativa.tenant_id, ...(tabela === 'canal_venda' ? { custo_fixo_pedido: Number(l.custo_fixo_pedido ?? 0) } : {}) }));
    if (novas.length === 0) return 0;
    const { error: insertError } = await supabase.from(tabela).insert(novas);
    if (insertError) throw insertError;
    return novas.length;
  }

  async function aplicarSetup(regiao: RegiaoSetup) {
    const presets = SETUP_PRESETS[regiao];
    setAplicando(regiao);
    setMsgSetup(null);
    setErroSetup(null);
    try {
      const total =
        await inserirFaltantes('fornecedor', presets.fornecedores) +
        await inserirFaltantes('canal_venda', presets.canais) +
        await inserirFaltantes('custo_fixo', presets.custosFixos) +
        await inserirFaltantes('tarefa_mao_obra', presets.tarefas) +
        await inserirFaltantes('perfil_energia', presets.energia);
      await qc.invalidateQueries();
      setMsgSetup(t('cadastros.setupCriado', { n: total }));
    } catch (err) {
      setErroSetup(mensagemErro(err));
    } finally {
      setAplicando(null);
    }
  }

  if (secao) {
    const card = cartoes.find((x) => x.id === secao)!;
    return (
      <div>
        <button onClick={() => setSecao(null)}
          className="mb-2 text-xs font-bold text-brand-azul hover:underline">
          ← {t('cadastros.titulo')}
        </button>
        <CabecalhoPagina
          titulo={card.rotulo}
          subtitulo={card.descricao}
          acoes={secao === 'materiais' && pode('estoque', 'criar') ? (
            <Botao className="h-11 min-w-64 shadow-lg shadow-ink/10" onClick={() => window.dispatchEvent(new Event('surface:novo-material'))}>
              + Novo material
            </Botao>
          ) : undefined}
        />
        {secao === 'materiais' && <AbaMateriais />}
        {secao === 'impressoras' && <AbaImpressoras />}
        {secao === 'canais' && <AbaCanais />}
        {secao === 'fornecedores' && <AbaFornecedores />}
        {secao === 'custosFixos' && <AbaCustosFixos />}
        {secao === 'maoDeObra' && <AbaMaoDeObra />}
        {secao === 'fiscal' && <AbaFiscal />}
        {secao === 'energia' && <AbaEnergia />}
        {secao === 'categorias' && <AbaCategorias />}
      </div>
    );
  }

  const totalRegistros = cartoes.reduce((s, card) => s + Number(c[card.tabela] ?? 0), 0);
  const totalOperacao = cartoes
    .filter((card) => card.grupo === 'operacao')
    .reduce((s, card) => s + Number(c[card.tabela] ?? 0), 0);
  const totalComercial = cartoes
    .filter((card) => card.grupo === 'comercial')
    .reduce((s, card) => s + Number(c[card.tabela] ?? 0), 0);
  const cartoesFiltrados = cartoes.filter((card) => {
    if (filtroVisao === 'todos') return true;
    if (filtroVisao === 'custos') return ['custosFixos', 'maoDeObra', 'energia', 'canais'].includes(card.id);
    if (filtroVisao === 'fiscal') return card.id === 'fiscal';
    return card.grupo === filtroVisao;
  });

  const grupos: { id: string; rotulo: string }[] = [
    { id: 'operacao', rotulo: t('cadastros.grupoOperacao') },
    { id: 'comercial', rotulo: t('cadastros.grupoComercial') },
  ];

  return (
    <div className="mx-auto flex w-full flex-col gap-4 lg:h-[calc(100dvh-112px)] lg:min-h-0 lg:overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('cadastros.titulo')}</h1>
          <p className="mt-1 text-sm text-texto-2">Dados que alimentam calculo, estoque, pedidos e producao.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Botao variante="secundario" className="h-11 sm:min-w-40" disabled={!!aplicando}
            onClick={() => aplicarSetup(regiaoSetup)}>
            {aplicando === regiaoSetup ? t('estados.salvando') : 'Setup rapido'}
          </Botao>
          <Botao className="h-11 sm:min-w-44 shadow-lg shadow-ink/10" onClick={() => setSecao('materiais')}>
            + Novo cadastro
          </Botao>
        </div>
      </div>

      {(setupInicialVazio || msgSetup || erroSetup) && (
        <div className="rounded-xl border border-brand-roxo/25 bg-brand-roxo/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-ink">{t('cadastros.setupAssistente')}</h2>
              <p className="mt-0.5 max-w-3xl text-xs text-texto-2">{t('cadastros.setupAssistenteDica')}</p>
            </div>
            <Botao variante="acento" disabled={!!aplicando} onClick={() => aplicarSetup(regiaoSetup)}>
              {aplicando === regiaoSetup ? t('estados.salvando') : t(`cadastros.setupAplicar.${regiaoSetup}`)}
            </Botao>
          </div>
          {msgSetup && <p className="mt-2 text-xs font-semibold text-ok">{msgSetup}</p>}
          {erroSetup && <p className="mt-2 text-xs font-semibold text-erro">{erroSetup}</p>}
        </div>
      )}

      <div className="grid flex-1 gap-4 lg:min-h-0 min-[1600px]:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
          <div className="grid gap-3 lg:grid-cols-3">
            <KpiCadastrosHome icone="categoria" rotulo="Configuracao geral" valor={`${Math.round(progresso)}%`} apoio={pendentes.length ? 'Ajustes pendentes' : 'Tudo pronto para operar'} destaque />
            <KpiCadastrosHome icone="material" rotulo={t('cadastros.grupoOperacao')} valor={totalOperacao} apoio="registros cadastrados" />
            <KpiCadastrosHome icone="canal" rotulo={t('cadastros.grupoComercial')} valor={totalComercial} apoio="registros cadastrados" />
          </div>

        <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-borda bg-white">
          <div className="border-b border-borda p-4">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'todos' as const, label: 'Todos' },
                { id: 'operacao' as const, label: t('cadastros.grupoOperacao') },
                { id: 'comercial' as const, label: 'Comercial' },
                { id: 'custos' as const, label: 'Custos' },
                { id: 'fiscal' as const, label: t('nav.fiscal') },
              ].map((item) => (
                <button key={item.id} onClick={() => setFiltroVisao(item.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    filtroVisao === item.id ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2 hover:text-ink'
                  }`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {cartoesFiltrados.map((card) => (
                <CardCadastro
                  key={card.id}
                  icone={iconeDeCadastro(card.id)}
                  rotulo={card.rotulo}
                  descricao={card.descricao}
                  contagem={c[card.tabela]}
                  pendente={(c[card.tabela] ?? 0) === 0}
                  onClick={() => setSecao(card.id)}
                />
              ))}
            </div>
            <p className="mt-3 text-xs text-texto-2">
              {totalRegistros} registros cadastrados em {cartoes.length} areas de configuracao.
            </p>
          </div>
        </section>
        </div>

        <aside className="hidden min-h-0 overflow-hidden rounded-xl border border-borda bg-white shadow-sm min-[1600px]:block">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-borda p-4">
              <h2 className="text-sm font-extrabold text-ink">Checklist de configuracao</h2>
              <div className="mt-3 flex items-center gap-4">
                <AnelProgresso progresso={progresso} />
                <p className="text-xs text-texto-2">{t('cadastros.progressoDica')}</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="space-y-1.5">
                {cartoes.slice(0, 6).map((card) => (
                  <button key={card.id} onClick={() => setSecao(card.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs font-semibold text-ink hover:bg-surface-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`flex size-5 shrink-0 items-center justify-center rounded-full ${(c[card.tabela] ?? 0) > 0 ? 'bg-ok/10 text-ok' : 'bg-alerta/10 text-alerta'}`}>
                        {(c[card.tabela] ?? 0) > 0 ? '✓' : '!'}
                      </span>
                      <span className="truncate">{card.rotulo}</span>
                    </span>
                    <span className="text-texto-2">{c[card.tabela] ?? '...'}</span>
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-borda bg-white p-3">
                <h3 className="text-sm font-extrabold text-ink">Proximos ajustes recomendados</h3>
                <div className="mt-2 space-y-2 text-xs text-ink">
                  <button onClick={() => setSecao('impressoras')} className="flex w-full items-center justify-between rounded-lg border border-borda bg-white px-3 py-2.5 text-left font-semibold hover:bg-brand-azul/5">Revisar custo/hora das impressoras <span className="text-texto-2">{'>'}</span></button>
                  <button onClick={() => setSecao('fornecedores')} className="flex w-full items-center justify-between rounded-lg border border-borda bg-white px-3 py-2.5 text-left font-semibold hover:bg-brand-azul/5">Atualizar fornecedores favoritos <span className="text-texto-2">{'>'}</span></button>
                  <button onClick={() => setSecao('fiscal')} className="flex w-full items-center justify-between rounded-lg border border-borda bg-white px-3 py-2.5 text-left font-semibold hover:bg-brand-azul/5">Conferir aliquota fiscal <span className="text-texto-2">{'>'}</span></button>
                </div>
              </div>

              <div className="rounded-xl border border-borda bg-white p-3">
                <h3 className="text-sm font-extrabold text-ink">Atalho</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button onClick={() => setSecao('materiais')} className="rounded-xl border border-borda bg-white p-3 text-center text-xs font-bold text-ink hover:border-brand-roxo/40 hover:bg-brand-roxo/5">
                    <span className="flex justify-center"><IconeCadastro tipo="material" pequeno /></span>
                    <span className="mt-2 block">Cadastrar material</span>
                  </button>
                  <button onClick={() => setSecao('fornecedores')} className="rounded-xl border border-borda bg-white p-3 text-center text-xs font-bold text-ink hover:border-brand-roxo/40 hover:bg-brand-roxo/5">
                    <span className="flex justify-center"><IconeCadastro tipo="fornecedor" pequeno /></span>
                    <span className="mt-2 block">Adicionar fornecedor</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );

  return (
    <div>
      <CabecalhoPagina titulo={t('cadastros.titulo')} subtitulo={t('cadastros.subtitulo')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          {setupInicialVazio && (
          <Cartao>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-ink">{t('cadastros.setupAssistente')}</h2>
                <p className="mt-1 max-w-2xl text-xs text-texto-2">{t('cadastros.setupAssistenteDica')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao variante="acento" disabled={!!aplicando}
                  onClick={() => aplicarSetup(regiaoSetup)}>
                  {aplicando === regiaoSetup ? t('estados.salvando') : t(`cadastros.setupAplicar.${regiaoSetup}`)}
                </Botao>
              </div>
            </div>
            {msgSetup && <p className="mt-2 text-xs font-semibold text-ok">{msgSetup}</p>}
            {erroSetup && <p className="mt-2 text-xs font-semibold text-erro">{erroSetup}</p>}
          </Cartao>
          )}
          {grupos.map((g) => (
            <section key={g.id}>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-texto-2">
                {g.rotulo}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cartoes.filter((card) => card.grupo === g.id).map((card) => (
                  <button key={card.id}
                    onClick={() => setSecao(card.id)}
                    className="flex items-start gap-3 rounded-xl border border-borda bg-white p-3.5 text-left transition-colors hover:border-brand-azul hover:bg-brand-azul/5">
                    <span className="text-xl" aria-hidden>{card.icone}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-bold text-ink">
                        {card.rotulo}
                        <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-texto-2">
                          {c[card.tabela] ?? '…'}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-texto-2">{card.descricao}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* painel lateral: anel de progresso + pendências (v2) */}
        <Cartao className="h-fit lg:sticky lg:top-16">
          <h2 className="mb-3 text-sm font-bold text-ink">{t('cadastros.progressoTitulo')}</h2>
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 80 80" className="size-20 shrink-0" role="img" aria-label={`${Math.round(progresso)}%`}>
              <defs>
                <linearGradient id="prog-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--color-brand-azul)" />
                  <stop offset="1" stopColor="var(--color-brand-magenta)" />
                </linearGradient>
              </defs>
              <circle cx="40" cy="40" r="32" fill="none" stroke="var(--color-surface-2)" strokeWidth="9" />
              <circle cx="40" cy="40" r="32" fill="none" stroke="url(#prog-g)" strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 32 * (progresso / 100)} ${2 * Math.PI * 32}`}
                transform="rotate(-90 40 40)" />
              <text x="40" y="45" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--color-ink)">
                {Math.round(progresso)}%
              </text>
            </svg>
            <p className="text-xs text-texto-2">{t('cadastros.progressoDica')}</p>
          </div>
          {pendentes.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-borda pt-3">
              {pendentes.map((card) => (
                <li key={card.id}>
                  <button onClick={() => setSecao(card.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-ink hover:bg-surface-2">
                    {card.rotulo}
                    <span className="text-alerta">{t('cadastros.pendente')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </div>
  );
}

function iconeDeCadastro(id: Aba): IconeCadastroTipo {
  const mapa: Record<Aba, IconeCadastroTipo> = {
    materiais: 'material',
    impressoras: 'impressora',
    energia: 'energia',
    fornecedores: 'fornecedor',
    canais: 'canal',
    custosFixos: 'custo',
    maoDeObra: 'maoDeObra',
    fiscal: 'fiscal',
    categorias: 'categoria',
  };
  return mapa[id];
}

function KpiCadastrosHome({
  icone,
  rotulo,
  valor,
  apoio,
  alerta = false,
  destaque = false,
}: {
  icone: IconeCadastroTipo;
  rotulo: string;
  valor: string | number;
  apoio: string;
  alerta?: boolean;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border border-borda bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <IconeCadastro tipo={icone} alerta={alerta} pequeno />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-ink">{rotulo}</p>
          <p className="mt-0.5 text-3xl font-extrabold leading-none tabular-nums text-ink">{valor}</p>
          <p className="text-xs text-texto-2">{apoio}</p>
        </div>
      </div>
      {destaque && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-azul via-brand-roxo to-brand-magenta"
            style={{ width: String(valor).endsWith('%') ? String(valor) : '100%' }}
          />
        </div>
      )}
    </div>
  );
}

function CardCadastro({
  icone,
  rotulo,
  descricao,
  contagem,
  pendente,
  onClick,
}: {
  icone: IconeCadastroTipo;
  rotulo: string;
  descricao: string;
  contagem?: number;
  pendente: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-32 items-center gap-4 rounded-xl border border-borda bg-white p-4 text-left shadow-sm transition hover:border-brand-roxo/40 hover:bg-brand-roxo/5"
    >
      <IconeCadastro tipo={icone} />
      <span className="min-w-0 flex-1">
        <span className="text-base font-extrabold leading-tight text-ink">{rotulo}</span>
        <span className="mt-1 block text-xs leading-snug text-texto-2">{descricao}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        <span className="rounded-lg border border-borda bg-surface-2 px-3 py-1 text-sm font-extrabold tabular-nums text-ink">
          {contagem ?? '...'}
        </span>
          <Etiqueta cor={pendente ? 'amarelo' : 'verde'}>{pendente ? 'Pendente' : 'Ok'}</Etiqueta>
        <span className="text-lg font-bold leading-none text-texto-2 transition group-hover:text-brand-roxo">{'>'}</span>
      </span>
    </button>
  );
}

function AnelProgresso({ progresso }: { progresso: number }) {
  const raio = 32;
  const circ = 2 * Math.PI * raio;
  const pct = Math.max(0, Math.min(100, progresso));
  return (
    <svg viewBox="0 0 80 80" className="size-20 shrink-0" role="img" aria-label={`${Math.round(pct)}%`}>
      <defs>
        <linearGradient id="cadastro-prog-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-brand-azul)" />
          <stop offset="0.55" stopColor="var(--color-brand-roxo)" />
          <stop offset="1" stopColor="var(--color-brand-magenta)" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r={raio} fill="none" stroke="var(--color-surface-2)" strokeWidth="9" />
      <circle
        cx="40"
        cy="40"
        r={raio}
        fill="none"
        stroke="url(#cadastro-prog-g)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${circ * (pct / 100)} ${circ}`}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="45" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--color-ink)">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function IconeCadastro({ tipo, alerta = false, pequeno = false }: { tipo: IconeCadastroTipo; alerta?: boolean; pequeno?: boolean }) {
  const imagens: Record<IconeCadastroTipo, string> = {
    material: iconeFilamento,
    impressora: iconeImpressora3d,
    energia: iconeEnergia,
    fornecedor: iconeCaixa,
    canal: iconeCanaisDeVenda,
    custo: iconeCustosFixos,
    maoDeObra: iconeMaoDeObra,
    fiscal: iconeFiscal,
    categoria: iconeCategoria,
  };
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl ${
      pequeno ? 'size-16' : 'size-24'
    } ${
      alerta ? 'bg-erro/10' : 'bg-white'
    }`}>
      <img
        src={imagens[tipo]}
        alt=""
        className={`${pequeno ? 'size-12' : 'size-20'} object-contain drop-shadow-sm`}
        loading="lazy"
      />
    </span>
  );
}

// ---------------------------------------------------------------- Materiais
interface Material {
  id: string; nome: string; tipo: string; marca: string | null; cor: string | null;
  fornecedor_id: string | null; observacao: string | null;
  fornecedor?: { nome: string; prazo_entrega_dias?: number | null; pedido_minimo?: number | null } | null;
  foto: string | null;
  subtipo: string | null; acabamento: string | null;
  unidade_compra: string; unidade_consumo: string; fator_conversao: number;
  preco_compra: number; frete: number; custo_unitario: number;
  saldo: number; reservado: number; minimo: number; custo_medio: number;
  valor_estoque: number;
  alerta_estoque: boolean;
}

const TIPOS_MATERIAL = ['filamento', 'resina', 'componente', 'consumivel', 'embalagem'] as const;

function rotuloSubtipo(m: Material, t: (key: string) => string): string | null {
  if (!m.subtipo) return null;
  if (m.tipo === 'filamento') {
    return POLIMEROS_FILAMENTO.find((p) => p.id === m.subtipo)?.label ?? m.subtipo;
  }
  if (m.tipo === 'resina') return t(`cadastros.material.subtipoResinaLabel.${m.subtipo}`);
  return m.subtipo;
}

function rotuloAcabamento(m: Material, t: (key: string) => string): string | null {
  if (m.tipo !== 'filamento' || !m.acabamento || m.acabamento === 'padrao') return null;
  return t(`cadastros.material.acabamentoLabel.${m.acabamento}`);
}

export function AbaMateriais() {
  const { t } = useTranslation();
  const { pode, formato, ativa } = useAuth();
  const lista = useLista<Material>('material', {
    ordem: 'nome', desc: false, selecao: '*, fornecedor:fornecedor_id (nome, prazo_entrega_dias, pedido_minimo)',
  });
  const fornecedores = useLista<{ id: string; nome: string }>('fornecedor', { ordem: 'nome', desc: false });
  const crud = useCrud('material');
  const [editando, setEditando] = useState<Partial<Material> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // estado "vivo" para o card de custo unitário calculado (modal v2)
  const [vivo, setVivo] = useState({ preco: '', frete: '', fator: 1000 });
  // seleção guiada (filamento/resina): polímero/subtipo + acabamento.
  // Não vão ao banco — compõem o `nome`. nomeManual desliga o auto-nome.
  const [subtipo, setSubtipo] = useState('');
  const [acabamento, setAcabamento] = useState('padrao');
  const [nomeManual, setNomeManual] = useState(false);
  const [avancadoAberto, setAvancadoAberto] = useState(false);
  const [fotoNova, setFotoNova] = useState<File | null>(null);
  const [marcasExtras, setMarcasExtras] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('surface_marcas_materiais') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const [buscaMaterial, setBuscaMaterial] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroEstoque, setFiltroEstoque] = useState('em_estoque');
  const [filtroAlerta, setFiltroAlerta] = useState('todos');
  const [filtroMarca, setFiltroMarca] = useState('todas');
  const [filtroFornecedor, setFiltroFornecedor] = useState('todos');
  const [materialSelecionadoId, setMaterialSelecionadoId] = useState('');
  const [detalheMobile, setDetalheMobile] = useState<Material | null>(null);

  function abrir(m: Partial<Material>) {
    setEditando(m);
    setVivo({
      preco: deCentavos(m.preco_compra ?? 0),
      frete: deCentavos(m.frete ?? 0),
      fator: m.fator_conversao ?? 1000,
    });
    setSubtipo(m.subtipo ?? '');
    setAcabamento(m.acabamento ?? 'padrao');
    // ao editar um material existente, preservamos o nome já salvo
    setNomeManual(!!m.id);
    setAvancadoAberto(false);
    setFotoNova(null);
  }

  useEffect(() => {
    const abrirNovo = () => abrir({});
    window.addEventListener('surface:novo-material', abrirNovo);
    return () => window.removeEventListener('surface:novo-material', abrirNovo);
  }, []);

  const tipoAtual = editando?.tipo ?? 'filamento';
  const guiado = tipoAtual === 'filamento' || tipoAtual === 'resina';
  const marcasOpcoes = useMemo(() => {
    const vistas = new Set<string>();
    return [...marcasExtras, ...marcasDe(tipoAtual)]
      .map((m) => m.trim())
      .filter((m) => {
        const chave = m.toLowerCase();
        if (!m || vistas.has(chave)) return false;
        vistas.add(chave);
        return true;
      });
  }, [marcasExtras, tipoAtual]);

  // monta o nome automaticamente a partir de marca + tipo + acabamento + cor
  useEffect(() => {
    if (!editando || nomeManual || !guiado) return;
    // tira o parêntese explicativo do rótulo (ex.: "TPU (flexível)" → "TPU")
    const limpo = (s: string) => s.replace(/\s*\(.*?\)/g, '').trim();
    const polimero = tipoAtual === 'filamento'
      ? limpo(POLIMEROS_FILAMENTO.find((p) => p.id === subtipo)?.label ?? '')
      : (subtipo ? limpo(t(`cadastros.material.subtipoResinaLabel.${subtipo}`)) : '');
    const fin = tipoAtual === 'filamento' && acabamento !== 'padrao'
      ? limpo(t(`cadastros.material.acabamentoLabel.${acabamento}`)) : '';
    const nome = [editando.marca, polimero, fin, editando.cor]
      .filter(Boolean).join(' ').trim();
    setEditando((e) => (e && e.nome !== nome ? { ...e, nome } : e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtipo, acabamento, editando?.marca, editando?.cor, nomeManual, tipoAtual, guiado]);

  // ao trocar de tipo guiado, garante as unidades padrão (kg → g)
  function selecionarTipo(tp: string) {
    setEditando((e) => {
      if (!e) return e;
      const next = { ...e, tipo: tp };
      if ((tp === 'filamento' || tp === 'resina')) {
        next.unidade_compra = e.unidade_compra ?? UNIDADE_PADRAO.compra;
        next.unidade_consumo = e.unidade_consumo ?? UNIDADE_PADRAO.consumo;
        next.fator_conversao = e.fator_conversao ?? UNIDADE_PADRAO.fator;
        setVivo((v) => ({ ...v, fator: next.fator_conversao! }));
      }
      return next;
    });
    setSubtipo('');
    setAcabamento('padrao');
  }
  function aplicarPresetSimples(nome: string) {
    const p = presetsDeMaterialSimples(tipoAtual).find((x) => x.nome === nome);
    if (!p) return;
    setEditando((m) => m && ({
      ...m,
      nome: p.nome,
      unidade_compra: p.unidadeCompra,
      unidade_consumo: p.unidadeConsumo,
      fator_conversao: p.fator,
      minimo: p.minimo,
      observacao: p.observacao ?? m.observacao ?? null,
    }));
    setVivo((v) => ({ ...v, fator: p.fator }));
  }

  function adicionarMarcaAtual() {
    const marca = (editando?.marca ?? '').trim();
    if (!marca) return;
    setMarcasExtras((atuais) => {
      if (atuais.some((m) => m.toLowerCase() === marca.toLowerCase())) return atuais;
      const novas = [marca, ...atuais];
      localStorage.setItem('surface_marcas_materiais', JSON.stringify(novas));
      return novas;
    });
  }

  const custoVivo = vivo.fator > 0
    ? Math.round(((paraCentavos(vivo.preco) + paraCentavos(vivo.frete)) / vivo.fator) * 100) / 100
    : 0;
  const todosMateriais = lista.data ?? [];
  const marcasCadastradas = useMemo(() => (
    Array.from(new Set(todosMateriais.map((m) => m.marca).filter(Boolean) as string[])).sort()
  ), [todosMateriais]);
  const materiaisFiltrados = useMemo(() => {
    const termo = buscaMaterial.trim().toLowerCase();
    const disponivel = (m: Material) => Number(m.saldo) - Number(m.reservado);
    return todosMateriais
      .filter((m) => filtroTipo === 'todos' || m.tipo === filtroTipo)
      .filter((m) => filtroEstoque === 'todos'
        || (filtroEstoque === 'em_estoque' && disponivel(m) > 0)
        || (filtroEstoque === 'sem_estoque' && disponivel(m) <= 0))
      .filter((m) => filtroAlerta === 'todos'
        || (filtroAlerta === 'alerta_on' && m.alerta_estoque !== false)
        || (filtroAlerta === 'alerta_off' && m.alerta_estoque === false))
      .filter((m) => filtroMarca === 'todas' || m.marca === filtroMarca)
      .filter((m) => filtroFornecedor === 'todos' || (m.fornecedor_id ?? '') === filtroFornecedor)
      .filter((m) => !termo || [m.nome, m.marca, m.cor, m.subtipo, m.acabamento, m.fornecedor?.nome]
        .some((v) => String(v ?? '').toLowerCase().includes(termo)))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [todosMateriais, buscaMaterial, filtroTipo, filtroEstoque, filtroAlerta, filtroMarca, filtroFornecedor]);
  const materialSelecionado = todosMateriais.find((m) => m.id === materialSelecionadoId)
    ?? materiaisFiltrados[0]
    ?? todosMateriais[0]
    ?? null;
  const kpisMateriais = useMemo(() => ({
    total: todosMateriais.length,
    impressao: todosMateriais.filter((m) => m.tipo === 'filamento' || m.tipo === 'resina').length,
    comFornecedor: todosMateriais.filter((m) => !!m.fornecedor_id).length,
    semCusto: todosMateriais.filter((m) => Number(m.custo_unitario) <= 0).length,
    semEstoque: todosMateriais.filter((m) => Number(m.saldo) - Number(m.reservado) <= 0).length,
  }), [todosMateriais]);

  function duplicarMaterial(m: Material) {
    abrir({
      ...m,
      id: undefined,
      nome: `${m.nome} copia`,
      saldo: 0,
      reservado: 0,
      valor_estoque: 0,
      custo_medio: 0,
      alerta_estoque: m.alerta_estoque,
    });
  }

  async function alternarAlertaMaterial(m: Material, ativo: boolean) {
    await crud.atualizar.mutateAsync({ id: m.id, alerta_estoque: ativo });
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    let foto = editando.foto ?? null;
    try {
      if (fotoNova && ativa) foto = await enviarFoto(ativa.tenant_id, 'materiais', fotoNova);
    } catch (err) {
      setErro(mensagemErro(err));
      return;
    }
    const valores = {
      nome: f.get('nome') as string,
      tipo: f.get('tipo') as string,
      marca: (f.get('marca') as string) || null,
      cor: (f.get('cor') as string) || null,
      foto,
      subtipo: (f.get('subtipo') as string) || null,
      acabamento: (f.get('acabamento') as string) || null,
      fornecedor_id: (f.get('fornecedor_id') as string) || null,
      observacao: (f.get('observacao') as string) || null,
      unidade_compra: f.get('unidade_compra') as string,
      unidade_consumo: f.get('unidade_consumo') as string,
      fator_conversao: Number(f.get('fator_conversao')),
      preco_compra: paraCentavos(f.get('preco_compra') as string),
      frete: paraCentavos(f.get('frete') as string),
      minimo: Number(f.get('minimo') || 0),
      alerta_estoque: f.get('alerta_estoque') === 'on',
    };
    try {
      if (editando.id) await crud.atualizar.mutateAsync({ id: editando.id, ...valores });
      else await crud.criar.mutateAsync(valores);
      setEditando(null);
      setFotoNova(null);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div className="mx-auto flex w-full flex-col lg:h-[calc(100dvh-205px)] lg:min-h-0 lg:overflow-hidden">
      <div className="mb-3 grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCadastro rotulo="Materiais cadastrados" valor={kpisMateriais.total} detalhe="Todos os tipos" icone="cube" />
        <KpiCadastro rotulo="Com estoque" valor={Math.max(0, kpisMateriais.total - kpisMateriais.semEstoque)} detalhe="Disponiveis agora" tom="roxo" icone="spool" />
        <KpiCadastro rotulo="Com fornecedor" valor={kpisMateriais.comFornecedor} detalhe={`${kpisMateriais.total ? Math.round((kpisMateriais.comFornecedor / kpisMateriais.total) * 100) : 0}% do total`} tom="azul" icone="truck" />
        <KpiCadastro rotulo="Sem custo" valor={kpisMateriais.semCusto} detalhe="Precisam de definicao" tom={kpisMateriais.semCusto ? 'alerta' : 'verde'} icone="alert" />
      </div>

      {todosMateriais.length === 0 ? (
        <EstadoVazio acao={pode('estoque', 'criar') ? <Botao onClick={() => abrir({})}>+ Novo material</Botao> : undefined} />
      ) : (
        <div className="grid min-h-0 gap-3 lg:flex-1 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col lg:min-h-0">
            <div className="shrink-0 rounded-t-2xl border border-borda bg-white p-3 shadow-sm">
              <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_145px_145px_165px]">
                <Entrada value={buscaMaterial} onChange={(e) => setBuscaMaterial(e.target.value)} placeholder="Buscar material, marca, cor..." />
                <Selecao value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                  <option value="todos">Todos os tipos</option>
                  <option value="filamento">Filamento</option>
                  <option value="resina">Resina</option>
                  <option value="componente">Componente</option>
                  <option value="consumivel">Consumivel</option>
                  <option value="embalagem">Embalagem</option>
                </Selecao>
                <Selecao value={filtroEstoque} onChange={(e) => setFiltroEstoque(e.target.value)}>
                  <option value="em_estoque">Com estoque</option>
                  <option value="sem_estoque">Sem estoque</option>
                  <option value="todos">Todos</option>
                </Selecao>
                <Selecao value={filtroAlerta} onChange={(e) => setFiltroAlerta(e.target.value)}>
                  <option value="todos">Todos alertas</option>
                  <option value="alerta_on">Alerta ligado</option>
                  <option value="alerta_off">Alerta desligado</option>
                </Selecao>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]">
                <Selecao value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)}>
                  <option value="todas">Todas marcas</option>
                  {marcasCadastradas.map((marca) => <option key={marca} value={marca}>{marca}</option>)}
                </Selecao>
                <Selecao value={filtroFornecedor} onChange={(e) => setFiltroFornecedor(e.target.value)}>
                  <option value="todos">Todos fornecedores</option>
                  {(fornecedores.data ?? []).map((fo) => <option key={fo.id} value={fo.id}>{fo.nome}</option>)}
                </Selecao>
                <Botao
                  variante="secundario"
                  type="button"
                  onClick={() => {
                    setBuscaMaterial('');
                    setFiltroTipo('todos');
                    setFiltroEstoque('em_estoque');
                    setFiltroAlerta('todos');
                    setFiltroMarca('todas');
                    setFiltroFornecedor('todos');
                  }}
                >
                  Limpar filtros
                </Botao>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ChipFiltro ativo={filtroTipo === 'todos'} onClick={() => setFiltroTipo('todos')}>Todos</ChipFiltro>
                {TIPOS_MATERIAL.map((tipo) => (
                  <ChipFiltro key={tipo} ativo={filtroTipo === tipo} onClick={() => setFiltroTipo(tipo)}>
                    {t(`cadastros.material.tipoLabel.${tipo}`)}
                  </ChipFiltro>
                ))}
                <span className="mx-1 hidden h-7 w-px bg-borda sm:block" />
                <ChipFiltro ativo={filtroEstoque === 'em_estoque'} onClick={() => setFiltroEstoque('em_estoque')}>Com estoque</ChipFiltro>
                <ChipFiltro ativo={filtroEstoque === 'sem_estoque'} onClick={() => setFiltroEstoque('sem_estoque')}>Sem estoque</ChipFiltro>
                <ChipFiltro ativo={filtroAlerta === 'alerta_off'} onClick={() => setFiltroAlerta(filtroAlerta === 'alerta_off' ? 'todos' : 'alerta_off')}>Sem alerta</ChipFiltro>
              </div>
            </div>
            {materiaisFiltrados.length === 0 ? (
              <EstadoVazio mensagem={t('estados.semResultados')} />
            ) : (
              <ListaMateriaisCadastro
                materiais={materiaisFiltrados}
                selecionadoId={materialSelecionado?.id}
                podeEditar={pode('estoque', 'editar')}
                onSelecionar={(m) => {
                  setMaterialSelecionadoId(m.id);
                }}
                onAbrirMobile={(m) => setDetalheMobile(m)}
                onEditar={abrir}
                onDuplicar={duplicarMaterial}
                onExcluir={(id) => crud.excluir.mutate(id)}
                t={t}
              />
            )}
          </div>
            <div className="hidden min-h-0 xl:block">
            <PainelMaterialCadastro
              material={materialSelecionado}
              podeEditar={pode('estoque', 'editar')}
              onEditar={abrir}
              onDuplicar={duplicarMaterial}
              onExcluir={(id) => crud.excluir.mutate(id)}
              onToggleAlerta={alternarAlertaMaterial}
              t={t}
              formato={formato}
            />
          </div>
        </div>
      )}

      <Modal aberto={!!detalheMobile} titulo="Material" onFechar={() => setDetalheMobile(null)}>
        {detalheMobile && (
          <PainelMaterialCadastro
            material={detalheMobile}
            podeEditar={pode('estoque', 'editar')}
            onEditar={(m) => { setDetalheMobile(null); abrir(m); }}
            onDuplicar={(m) => { setDetalheMobile(null); duplicarMaterial(m); }}
            onExcluir={(id) => {
              setDetalheMobile(null);
              crud.excluir.mutate(id);
            }}
            onToggleAlerta={alternarAlertaMaterial}
            t={t}
            formato={formato}
            compacto
          />
        )}
      </Modal>

      {false && (lista.data!.length === 0 ? (
        <EstadoVazio acao={pode('estoque', 'criar') ? <Botao onClick={() => abrir({})}>+ {t('acoes.novo')}</Botao> : undefined} />
      ) : (
        <Tabela cabecalhos={[
          t('cadastros.material.nome'), t('cadastros.material.tipo'),
          t('cadastros.material.fornecedor'), t('estoque.disponivel'),
          'Custo cadastro', '',
        ]}>
          {lista.data!.map((m) => (
            <tr key={m.id} className="hover:bg-surface-2/50">
              <td className="px-3 py-2.5 font-semibold text-ink">
                {m.nome}
                <span className="block text-[10px] font-normal text-texto-2">
                  {[m.marca, rotuloSubtipo(m, t), rotuloAcabamento(m, t), m.cor].filter(Boolean).join(' · ') || '—'}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <Etiqueta cor={m.tipo === 'filamento' || m.tipo === 'resina' ? 'azul' : 'cinza'}>
                  {t(`cadastros.material.tipoLabel.${m.tipo}`)}
                </Etiqueta>
              </td>
              <td className="px-3 py-2.5 text-texto-2">{m.fornecedor?.nome ?? '—'}</td>
              <td className="px-3 py-2.5 tabular-nums">
                {(Number(m.saldo) - Number(m.reservado)).toLocaleString()} {m.unidade_consumo}
                <span className="block text-[10px] text-texto-2">
                  {t('estoque.saldo')}: {Number(m.saldo).toLocaleString()} · {t('estoque.minimo')}: {Number(m.minimo).toLocaleString()}
                </span>
              </td>
              <td className="px-3 py-2.5 tabular-nums">
                <Dinheiro centavos={Math.round(Number(m.custo_unitario))} />/{m.unidade_consumo}
                {Number(m.custo_medio) > 0 && Math.round(Number(m.custo_medio)) !== Math.round(Number(m.custo_unitario)) && (
                  <span className="block text-[10px] text-texto-2">
                    {t('estoque.custoMedio')}: <Dinheiro centavos={Math.round(Number(m.custo_medio))} />/{m.unidade_consumo}
                  </span>
                )}
                {Number(m.saldo) - Number(m.reservado) <= Number(m.minimo) && Number(m.minimo) > 0 && (
                  <span className="ml-1"><Etiqueta cor="vermelho">{t('estoque.estoqueBaixo')}</Etiqueta></span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right">
                {pode('estoque', 'editar') && (
                  <div className="flex justify-end gap-1">
                    <Botao variante="fantasma" onClick={() => abrir(m)}>{t('acoes.editar')}</Botao>
                    <Botao variante="perigo" onClick={() => crud.excluir.mutate(m.id)}>{t('acoes.excluir')}</Botao>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      ))}

      <Modal aberto={!!editando} titulo={editando?.id ? t('acoes.editar') : t('acoes.novo')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
            {/* abas por tipo no topo do modal (modal 03 do v2) */}
            <div className="col-span-2 flex flex-wrap gap-1.5" role="tablist">
              {(['filamento', 'resina', 'componente', 'consumivel', 'embalagem'] as const).map((tp) => (
                <button key={tp} type="button" role="tab"
                  aria-selected={tipoAtual === tp}
                  onClick={() => selecionarTipo(tp)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    tipoAtual === tp
                      ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2 hover:text-ink'
                  }`}>
                  {t(`cadastros.material.tipoLabel.${tp}`)}
                </button>
              ))}
              <input type="hidden" name="tipo" value={tipoAtual} />
            </div>

            <Campo rotulo={t('fotos.adicionar')} className="col-span-2">
              <div className="flex items-center gap-3">
                {fotoNova ? (
                  <img src={URL.createObjectURL(fotoNova)} alt="" className="size-16 rounded-xl object-cover" />
                ) : (
                  <FotoOuPlaceholder path={editando.foto} alt={editando.nome ?? ''} className="size-16 rounded-xl object-cover" />
                )}
                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-borda bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface-2">
                  {editando.foto || fotoNova ? t('acoes.editar') : `+ ${t('fotos.adicionar')}`}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setFotoNova(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </Campo>

            {guiado ? (
              <>
                {/* seleção guiada: tipo de material + acabamento (filamento) */}
                <Campo rotulo={t('cadastros.material.subtipo')}
                  className={tipoAtual === 'filamento' ? '' : 'col-span-2'}>
                  <Selecao value={subtipo} onChange={(e) => setSubtipo(e.target.value)}>
                    <option value="">{t('cadastros.material.subtipoPlaceholder')}</option>
                    {tipoAtual === 'filamento'
                      ? POLIMEROS_FILAMENTO.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)
                      : SUBTIPOS_RESINA.map((s) => (
                          <option key={s} value={s}>{t(`cadastros.material.subtipoResinaLabel.${s}`)}</option>
                        ))}
                  </Selecao>
                  <input type="hidden" name="subtipo" value={subtipo} />
                </Campo>
                {tipoAtual === 'filamento' && (
                  <Campo rotulo={t('cadastros.material.acabamento')}>
                    <Selecao value={acabamento} onChange={(e) => setAcabamento(e.target.value)}>
                      {ACABAMENTOS_FILAMENTO.map((a) => (
                        <option key={a} value={a}>{t(`cadastros.material.acabamentoLabel.${a}`)}</option>
                      ))}
                    </Selecao>
                    <input type="hidden" name="acabamento" value={acabamento} />
                  </Campo>
                )}
                {tipoAtual !== 'filamento' && <input type="hidden" name="acabamento" value="" />}
                <Campo rotulo={t('cadastros.material.marca')}>
                  <EntradaSugestao name="marca"
                    placeholder={t('cadastros.material.marcaPlaceholder')}
                    opcoes={marcasOpcoes}
                    value={editando.marca ?? ''}
                    onChange={(v) => setEditando((m) => m && ({ ...m, marca: v }))}
                    acaoAdicionar={{
                      rotulo: 'Adicionar marca',
                      onAdicionar: () => adicionarMarcaAtual(),
                    }} />
                </Campo>
                <Campo rotulo={t('cores.cor')}>
                  <Entrada name="cor" value={editando.cor ?? ''}
                    onChange={(e) => setEditando((m) => m && ({ ...m, cor: e.target.value }))} />
                </Campo>
                <Campo rotulo={t('cadastros.material.nomeGerado')} className="col-span-2">
                  <Entrada name="nome" required value={editando.nome ?? ''}
                    onChange={(e) => { setNomeManual(true); setEditando((m) => m && ({ ...m, nome: e.target.value })); }} />
                </Campo>

                {/* unidade/conversão: pré-preenchido, recolhido por padrão */}
                <div className="col-span-2">
                  <button type="button" onClick={() => setAvancadoAberto((v) => !v)}
                    className="text-xs font-semibold text-brand-roxo hover:underline">
                    {avancadoAberto ? '▾ ' : '▸ '}{t('cadastros.material.avancado')}
                  </button>
                  {avancadoAberto && (
                    <>
                      <p className="mt-1 text-[11px] text-texto-2">{t('cadastros.material.avancadoDica')}</p>
                      <div className="mt-2 grid grid-cols-3 gap-3">
                        <Campo rotulo={t('cadastros.material.unidadeCompra')}>
                          <Entrada name="unidade_compra" required defaultValue={editando.unidade_compra ?? 'kg'} />
                        </Campo>
                        <Campo rotulo={t('cadastros.material.unidadeConsumo')}>
                          <Entrada name="unidade_consumo" required defaultValue={editando.unidade_consumo ?? 'g'} />
                        </Campo>
                        <Campo rotulo={t('cadastros.material.fatorConversao')} dica="Ex.: 1 kg = 1000 g → 1000">
                          <Entrada name="fator_conversao" type="number" step="any" min="0.0001" required
                            defaultValue={editando.fator_conversao ?? 1000}
                            onChange={(e) => setVivo({ ...vivo, fator: Number(e.target.value) || 0 })} />
                        </Campo>
                      </div>
                    </>
                  )}
                  {!avancadoAberto && (
                    <input type="hidden" name="unidade_compra" value={editando.unidade_compra ?? 'kg'} />
                  )}
                  {!avancadoAberto && (
                    <input type="hidden" name="unidade_consumo" value={editando.unidade_consumo ?? 'g'} />
                  )}
                  {!avancadoAberto && (
                    <input type="hidden" name="fator_conversao" value={editando.fator_conversao ?? 1000} />
                  )}
                </div>
              </>
            ) : (
              <>
                <Campo rotulo={t('cadastros.material.modeloRapido')} className="col-span-2">
                  <Selecao defaultValue="" onChange={(e) => aplicarPresetSimples(e.target.value)}>
                    <option value="">{t('cadastros.material.modeloRapidoPlaceholder')}</option>
                    {presetsDeMaterialSimples(tipoAtual).map((p) => (
                      <option key={p.nome} value={p.nome}>{p.nome}</option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo={t('cadastros.material.nome')} className="col-span-2">
                  <Entrada name="nome" required value={editando.nome ?? ''}
                    onChange={(e) => setEditando((m) => m && ({ ...m, nome: e.target.value }))} />
                </Campo>
                <input type="hidden" name="subtipo" value="" />
                <input type="hidden" name="acabamento" value="" />
                <Campo rotulo={t('cadastros.material.marca')}>
                  <Entrada name="marca" defaultValue={editando.marca ?? ''} />
                </Campo>
                <Campo rotulo={t('cores.cor')}>
                  <Entrada name="cor" defaultValue={editando.cor ?? ''} />
                </Campo>
                <Campo rotulo={t('cadastros.material.unidadeCompra')}>
                  <Entrada name="unidade_compra" required value={editando.unidade_compra ?? 'un'}
                    onChange={(e) => setEditando((m) => m && ({ ...m, unidade_compra: e.target.value }))} />
                </Campo>
                <Campo rotulo={t('cadastros.material.unidadeConsumo')}>
                  <Entrada name="unidade_consumo" required value={editando.unidade_consumo ?? 'un'}
                    onChange={(e) => setEditando((m) => m && ({ ...m, unidade_consumo: e.target.value }))} />
                </Campo>
                <Campo rotulo={t('cadastros.material.fatorConversao')} dica="Ex.: 1 kg = 1000 g → 1000">
                  <Entrada name="fator_conversao" type="number" step="any" min="0.0001" required
                    value={editando.fator_conversao ?? 1}
                    onChange={(e) => {
                      const fator = Number(e.target.value) || 0;
                      setEditando((m) => m && ({ ...m, fator_conversao: fator }));
                      setVivo({ ...vivo, fator });
                    }} />
                </Campo>
              </>
            )}
            <Campo rotulo={t('estoque.minimo')} ajuda={t('estoque.minimoAjuda')}>
              <Entrada name="minimo" type="number" step="any" min="0" value={editando.minimo ?? 0}
                onChange={(e) => setEditando((m) => m && ({ ...m, minimo: Number(e.target.value) || 0 }))} />
            </Campo>
            <label className="flex items-center gap-3 rounded-xl border border-borda bg-surface-2 px-3 py-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                name="alerta_estoque"
                defaultChecked={editando.alerta_estoque !== false}
                className="size-4"
              />
              <span>
                Alertar estoque baixo
                <span className="block text-[11px] font-normal text-texto-2">Desligue para materiais antigos ou que voce nao pretende recomprar.</span>
              </span>
            </label>
            <Campo rotulo={t('cadastros.material.precoCompra')}>
              <EntradaDinheiro name="preco_compra" defaultCentavos={editando.preco_compra ?? 0}
                onChange={(e) => setVivo({ ...vivo, preco: e.target.value })} />
            </Campo>
            <Campo rotulo={t('cadastros.material.frete')}>
              <EntradaDinheiro name="frete" defaultCentavos={editando.frete ?? 0}
                onChange={(e) => setVivo({ ...vivo, frete: e.target.value })} />
            </Campo>
            {/* de quem você compra: liga o material às compras/fornecedores */}
            <Campo rotulo={t('cadastros.material.fornecedor')}>
              <Selecao name="fornecedor_id" defaultValue={editando.fornecedor_id ?? ''}>
                <option value="">—</option>
                {(fornecedores.data ?? []).map((fo) => <option key={fo.id} value={fo.id}>{fo.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo={t('cadastros.material.observacao')}>
              <Entrada name="observacao" placeholder="Ex.: secar antes de usar"
                defaultValue={editando.observacao ?? ''} />
            </Campo>
            {/* custo unitário calculado AO VIVO (v2 — acento da marca, não teal) */}
            <div className="col-span-2 rounded-xl border border-brand-roxo/30 bg-brand-roxo/5 p-3">
              <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-brand-roxo">
                {t('cadastros.material.custoUnitario')}
                <span className="group relative inline-flex align-middle">
                  <span
                    tabIndex={0}
                    role="img"
                    aria-label="O custo por unidade divide o preço de compra mais o frete pelo fator de conversão. Exemplo: R$ 100,00 por 1 kg dividido por 1000 g = R$ 0,10 por g."
                    className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-brand-roxo/15 text-[10px] font-extrabold leading-none text-brand-roxo"
                  >
                    !
                  </span>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 hidden w-72 max-w-[min(18rem,75vw)] rounded-lg bg-ink px-3 py-2 text-[11px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg group-hover:block group-focus-within:block"
                  >
                    Preço de compra + frete dividido pelo fator de conversão. Ex.: R$ 100,00 por 1 kg ÷ 1000 g = R$ 0,10 por g.
                  </span>
                </span>
              </p>
              <p className="text-lg font-extrabold tabular-nums grad-texto">
                {moeda(custoVivo, formato)}
                <span className="ml-1 text-xs font-semibold text-texto-2">
                  / {editando.unidade_consumo ?? 'unid. de consumo'}
                </span>
              </p>
              <p className="text-[11px] text-texto-2">{t('cadastros.material.formulaCusto')}</p>
            </div>
            {erro && <p className="col-span-2 text-xs font-semibold text-erro">{erro}</p>}
            <div className="col-span-2 flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function KpiCadastro({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
  icone = 'cube',
}: {
  rotulo: string;
  valor: number | string;
  detalhe: string;
  tom?: 'neutro' | 'roxo' | 'azul' | 'verde' | 'alerta';
  icone?: 'cube' | 'spool' | 'truck' | 'alert';
}) {
  const tons = {
    neutro: 'bg-white text-brand-roxo',
    roxo: 'bg-white text-brand-roxo',
    azul: 'bg-white text-brand-azul',
    verde: 'bg-white text-ok',
    alerta: 'bg-white text-erro',
  };
  const paths = {
    cube: 'M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3L18.6 8 12 11.7 5.4 8 12 4.3ZM5 9.7l6 3.4v6.6l-6-3.4V9.7Zm8 10v-6.6l6-3.4v6.6l-6 3.4Z',
    spool: 'M7 4h10a3 3 0 0 1 0 6H7a3 3 0 0 1 0-6Zm0 10h10a3 3 0 0 1 0 6H7a3 3 0 0 1 0-6Zm0-7a1 1 0 1 0 0 .01V7Zm10 0a1 1 0 1 0 0 .01V7ZM7 17a1 1 0 1 0 0 .01V17Zm10 0a1 1 0 1 0 0 .01V17Zm-5-7v4',
    truck: 'M3 5h11v10H3V5Zm13 3h3l2 3v4h-2a2.5 2.5 0 0 1-5 0h-3a2.5 2.5 0 0 1-5 0H3v-2h11V8h2Z',
    alert: 'M12 3 2 21h20L12 3Zm1 14h-2v-2h2v2Zm0-4h-2V8h2v5Z',
  };
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-2xl border border-borda p-3 shadow-sm 2xl:p-4 ${tons[tom]}`}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-current/10 2xl:size-10">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={paths[icone]} />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-extrabold text-ink">{rotulo}</span>
        <span className="mt-1 block text-xl font-extrabold leading-none tabular-nums text-ink 2xl:text-2xl">{valor}</span>
        <span className="mt-1 block text-xs font-semibold text-texto-2">{detalhe}</span>
      </span>
    </div>
  );
}

function ChipFiltro({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors ${
        ativo ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function MaterialThumbCadastro({ material, className = 'size-12' }: { material: Material; className?: string }) {
  return (
    <FotoOuPlaceholder
      path={material.foto}
      alt={material.nome}
      className={`${className} shrink-0 rounded-xl object-cover ring-1 ring-borda`}
    />
  );
}

function ListaMateriaisCadastro({
  materiais,
  selecionadoId,
  podeEditar,
  onSelecionar,
  onAbrirMobile,
  onEditar,
  onDuplicar,
  onExcluir,
  t,
}: {
  materiais: Material[];
  selecionadoId?: string;
  podeEditar: boolean;
  onSelecionar: (material: Material) => void;
  onAbrirMobile: (material: Material) => void;
  onEditar: (material: Partial<Material>) => void;
  onDuplicar: (material: Material) => void;
  onExcluir: (id: string) => void;
  t: (key: string) => string;
}) {
  const tipoCor = (m: Material) => (m.tipo === 'filamento' || m.tipo === 'resina' ? 'azul' : 'cinza');

  return (
    <>
      <div className="hidden min-h-0 overflow-hidden rounded-b-2xl border-x border-b border-borda bg-white shadow-sm lg:flex lg:flex-1 lg:flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white text-[11px] font-extrabold uppercase tracking-wide text-texto-2 shadow-[0_1px_0_0_rgba(229,231,235,1)]">
            <tr>
              <th className="px-5 py-4">Material</th>
              <th className="px-4 py-4">Tipo</th>
              <th className="px-4 py-4">Marca</th>
              <th className="px-4 py-4">Fornecedor</th>
              <th className="px-4 py-4">Conversao</th>
              <th className="px-4 py-4 text-right">Disponivel</th>
              <th className="px-4 py-4 text-right">Minimo</th>
              <th className="px-4 py-4 text-right">Custo cadastro</th>
              <th className="px-5 py-4 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {materiais.map((m) => {
              const selecionado = selecionadoId === m.id;
              const meta = [m.marca, rotuloSubtipo(m, t), rotuloAcabamento(m, t), m.cor].filter(Boolean).join(' · ');
              const disponivel = Number(m.saldo) - Number(m.reservado);
              return (
                <tr
                  key={m.id}
                  onClick={() => onSelecionar(m)}
                  className={`cursor-pointer transition-colors hover:bg-surface-2/40 ${selecionado ? 'bg-brand-roxo/5 ring-1 ring-inset ring-brand-roxo/40' : ''}`}
                >
                  <td className="px-5 py-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <MaterialThumbCadastro material={m} className="size-16" />
                      <span className="min-w-0">
                        <span className="block truncate font-extrabold text-ink">{m.nome}</span>
                        <span className="block truncate text-xs text-texto-2">{meta || 'Sem detalhes'}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta cor={tipoCor(m)}>{t(`cadastros.material.tipoLabel.${m.tipo}`)}</Etiqueta>
                  </td>
                  <td className="px-4 py-3 text-texto-2">{m.marca ?? '-'}</td>
                  <td className="px-4 py-3 text-texto-2">{m.fornecedor?.nome ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-texto-2">
                    1 {m.unidade_compra} = {Number(m.fator_conversao).toLocaleString()} {m.unidade_consumo}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold tabular-nums ${disponivel <= 0 ? 'text-alerta' : 'text-ink'}`}>
                    {disponivel.toLocaleString()} {m.unidade_consumo}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {Number(m.minimo).toLocaleString()} {m.unidade_consumo}
                    {m.alerta_estoque === false && (
                      <span className="mt-1 block text-[10px] font-bold text-texto-2">sem alerta</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    <Dinheiro centavos={Math.round(Number(m.custo_unitario))} />/{m.unidade_consumo}
                    {Number(m.custo_unitario) <= 0 && (
                      <span className="mt-1 block"><Etiqueta cor="vermelho">Sem custo</Etiqueta></span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {podeEditar && (
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="grid size-9 place-items-center rounded-lg border border-borda text-texto-2 hover:bg-surface-2 hover:text-ink" onClick={() => onEditar(m)} title="Editar">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>
                        </button>
                        <button type="button" className="grid size-9 place-items-center rounded-lg border border-borda text-texto-2 hover:bg-surface-2 hover:text-ink" onClick={() => onDuplicar(m)} title="Duplicar">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></svg>
                        </button>
                        <button type="button" className="grid size-9 place-items-center rounded-lg border border-borda text-texto-2 hover:bg-erro/5 hover:text-erro" onClick={() => onExcluir(m.id)} title="Excluir">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="shrink-0 flex items-center justify-between border-t border-borda px-5 py-3 text-xs font-semibold text-texto-2">
          <span>Mostrando 1 a {materiais.length} de {materiais.length} materiais</span>
          <span className="rounded-lg border border-borda px-3 py-2">10 por pagina</span>
        </div>
      </div>

      <div className="grid gap-3 lg:hidden">
        {materiais.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onAbrirMobile(m)}
            className="rounded-2xl border border-borda bg-white p-3 text-left shadow-sm"
          >
            <div className="flex gap-3">
              <MaterialThumbCadastro material={m} className="size-14" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-extrabold text-ink">{m.nome}</p>
                    <p className="truncate text-xs text-texto-2">{[m.marca, m.cor].filter(Boolean).join(' · ') || 'Sem detalhes'}</p>
                  </div>
                  <Etiqueta cor={tipoCor(m)}>{t(`cadastros.material.tipoLabel.${m.tipo}`)}</Etiqueta>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <span className="rounded-lg bg-surface-2 px-2 py-1 text-texto-2">
                    Minimo <b className="text-ink">{Number(m.minimo).toLocaleString()} {m.unidade_consumo}</b>
                  </span>
                  <span className="rounded-lg bg-surface-2 px-2 py-1 text-texto-2">
                    Custo <b className="text-ink"><Dinheiro centavos={Math.round(Number(m.custo_unitario))} />/{m.unidade_consumo}</b>
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function PainelMaterialCadastro({
  material,
  podeEditar,
  onEditar,
  onDuplicar,
  onExcluir,
  onToggleAlerta,
  t,
  formato,
  compacto = false,
}: {
  material: Material | null;
  podeEditar: boolean;
  onEditar: (material: Partial<Material>) => void;
  onDuplicar: (material: Material) => void;
  onExcluir: (id: string) => void;
  onToggleAlerta: (material: Material, ativo: boolean) => Promise<void>;
  t: (key: string) => string;
  formato: ReturnType<typeof useAuth>['formato'];
  compacto?: boolean;
}) {
  if (!material) {
    return (
      <div className="rounded-2xl border border-dashed border-borda bg-white p-5 text-sm text-texto-2">
        Selecione um material para ver os detalhes.
      </div>
    );
  }
  const detalhe = [material.marca, rotuloSubtipo(material, t), rotuloAcabamento(material, t), material.cor].filter(Boolean).join(' · ');
  const alertaLigado = material.alerta_estoque !== false;
  const baixo = alertaLigado && Number(material.minimo) > 0 && Number(material.saldo) - Number(material.reservado) <= Number(material.minimo);

  return (
    <aside className={`rounded-2xl border border-borda bg-white shadow-sm ${compacto ? 'p-0 shadow-none' : 'h-full min-h-0 overflow-y-auto p-3 2xl:p-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-extrabold text-ink">Material selecionado</p>
        <Etiqueta cor={baixo ? 'vermelho' : 'verde'}>{baixo ? 'Revisar' : 'Ok'}</Etiqueta>
      </div>

      <div className="mt-4 flex items-center gap-3 2xl:mt-5 2xl:gap-4">
        <div className="overflow-hidden rounded-2xl bg-surface-2">
          <MaterialThumbCadastro material={material} className="size-20 2xl:size-28" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-extrabold leading-tight text-ink 2xl:text-lg">{material.nome}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Etiqueta cor={material.tipo === 'filamento' || material.tipo === 'resina' ? 'azul' : 'cinza'}>
              {t(`cadastros.material.tipoLabel.${material.tipo}`)}
            </Etiqueta>
            {rotuloSubtipo(material, t) && <Etiqueta>{rotuloSubtipo(material, t)}</Etiqueta>}
          </div>
          <p className="mt-2 text-xs text-texto-2">{detalhe || 'Sem detalhes adicionais'}</p>
          <p className="mt-1 text-[11px] font-semibold text-texto-2">Codigo: MAT-{material.id.slice(0, 4).toUpperCase()}</p>
        </div>
      </div>

      <section className="mt-4 rounded-2xl border border-borda p-3 2xl:mt-5 2xl:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-texto-2">Fornecedor principal</p>
            <p className="mt-1 text-lg font-extrabold text-ink">{material.fornecedor?.nome ?? '-'}</p>
            <p className="mt-1 text-xs text-texto-2">
              Prazo medio: {material.fornecedor?.prazo_entrega_dias != null ? `${material.fornecedor.prazo_entrega_dias} dias` : '-'}
            </p>
            <p className="text-xs text-texto-2">
              Pedido minimo: {material.fornecedor?.pedido_minimo != null ? moeda(Number(material.fornecedor.pedido_minimo), formato) : '-'}
            </p>
          </div>
          <Botao variante="secundario" type="button" className="px-3 py-1.5 text-xs">Ver fornecedor</Botao>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-borda p-3 2xl:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-texto-2">Custo cadastro</p>
            <p className="mt-1 text-2xl font-extrabold text-ink">
              {moeda(Math.round(Number(material.custo_unitario)), formato)} / {material.unidade_consumo}
            </p>
            <p className="mt-1 text-xs text-texto-2">
              Calculo: {moeda(Number(material.preco_compra), formato)} + {moeda(Number(material.frete), formato)} + {Number(material.fator_conversao).toLocaleString()} {material.unidade_consumo}
            </p>
          </div>
          <Etiqueta cor={Number(material.custo_unitario) > 0 ? 'verde' : 'vermelho'}>{Number(material.custo_unitario) > 0 ? 'OK' : 'Sem custo'}</Etiqueta>
        </div>
        <div className="mt-3 rounded-xl border border-brand-roxo/20 bg-brand-roxo/5 p-3">
          <p className="text-xs font-extrabold text-brand-roxo">Formula de custo</p>
          <p className="mt-1 text-xs font-semibold text-brand-roxo/80">Preco + frete + conversao</p>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-borda p-3 2xl:p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-texto-2">Unidade e conversao</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <InfoMaterial rotulo="Unidade de compra" valor={`1 ${material.unidade_compra}`} />
          <InfoMaterial rotulo="Area conversao" valor={`1 ${material.unidade_compra} = ${Number(material.fator_conversao).toLocaleString()} ${material.unidade_consumo}`} />
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-borda p-3 2xl:p-4">
        <InfoMaterial rotulo="Minimo recomendado" valor={`${Number(material.minimo).toLocaleString()} ${material.unidade_consumo}`} />
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
          <div>
            <p className="text-xs font-extrabold text-ink">Alertar estoque baixo</p>
            <p className="text-[11px] text-texto-2">
              {alertaLigado ? 'Este material entra nos alertas e compras sugeridas.' : 'Fica registrado, mas nao vira alerta.'}
            </p>
          </div>
          {podeEditar && (
            <button
              type="button"
              onClick={() => onToggleAlerta(material, !alertaLigado)}
              className={`relative h-6 w-11 rounded-full transition-colors ${alertaLigado ? 'bg-ok' : 'bg-texto-2/25'}`}
              aria-label="Alternar alerta de estoque"
            >
              <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${alertaLigado ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          )}
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-borda p-3 2xl:p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-texto-2">Observacoes</p>
        <p className="mt-2 text-sm text-ink">{material.observacao || 'Sem observacoes cadastradas.'}</p>
      </section>

      {podeEditar && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Botao onClick={() => onEditar(material)}>Editar cadastro</Botao>
          <Botao variante="secundario" onClick={() => onDuplicar(material)}>Duplicar</Botao>
          <Botao variante="perigo" className="col-span-2" onClick={() => onExcluir(material.id)}>Excluir material</Botao>
        </div>
      )}
    </aside>
  );
}

function InfoMaterial({ rotulo, valor, className = '' }: { rotulo: string; valor: string; className?: string }) {
  return (
    <div className={`rounded-xl bg-surface-2 p-3 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-texto-2">{rotulo}</p>
      <p className="mt-1 text-sm font-bold text-ink">{valor}</p>
    </div>
  );
}

// -------------------------------------------------------------- Impressoras
interface Impressora {
  id: string; nome: string; tecnologia: string; fabricante: string | null;
  modelo: string | null; numero_serie: string | null; foto_url: string | null;
  data_aquisicao: string | null; horas_dia: number;
  valor_aquisicao: number; vida_util_horas: number; consumo_w: number;
  manutencao_hora: number; perfil_energia_id: string | null; status: string;
  agente_id: string | null;
}

function custoHoraImpressora(i: Impressora): number {
  const amortizacao = i.vida_util_horas > 0 ? i.valor_aquisicao / i.vida_util_horas : 0;
  return Math.round(amortizacao + Number(i.manutencao_hora));
}

export function AbaImpressoras() {
  const { t } = useTranslation();
  const { pode, formato, ativa } = useAuth();
  const lista = useLista<Impressora>('impressora', { ordem: 'nome', desc: false });
  const agentes = useLista<{ id: string; nome: string }>('agente_impressao', { ordem: 'nome', desc: false });
  const perfisEnergia = useLista<{ id: string; nome: string; tarifa_kwh: number }>('perfil_energia', { ordem: 'nome', desc: false });
  const crud = useCrud('impressora');
  const [editando, setEditando] = useState<Partial<Impressora> | null>(null);
  const [fotoNova, setFotoNova] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // estado vivo para o card "custo por hora calculado" (modal 04 do v2)
  const [vivoImp, setVivoImp] = useState({ valor: '', vida: 5000, manutencao: '' });

  function abrirImp(i: Partial<Impressora>) {
    setEditando(i);
    setFotoNova(null);
    setVivoImp({
      valor: deCentavos(i.valor_aquisicao ?? 0),
      vida: i.vida_util_horas ?? 5000,
      manutencao: deCentavos(i.manutencao_hora ?? 0),
    });
  }
  const custoHoraVivo =
    (vivoImp.vida > 0 ? paraCentavos(vivoImp.valor) / vivoImp.vida : 0) + paraCentavos(vivoImp.manutencao);
  const tarifaSelecionada = Number((perfisEnergia.data ?? []).find((p) => p.id === editando?.perfil_energia_id)?.tarifa_kwh ?? 0);
  const energiaHoraViva = Math.round(((Number(editando?.consumo_w ?? 0) / 1000) * tarifaSelecionada));

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    try {
      // foto vai para o Storage (RLS por tenant); a tabela guarda o path
      let fotoUrl = editando.foto_url ?? null;
      if (fotoNova && ativa) {
        fotoUrl = await enviarFoto(ativa.tenant_id, 'impressoras', fotoNova);
      }
      const valores = {
        nome: f.get('nome') as string,
        tecnologia: f.get('tecnologia') as string,
        fabricante: (f.get('fabricante') as string) || null,
        numero_serie: (f.get('numero_serie') as string) || null,
        data_aquisicao: (f.get('data_aquisicao') as string) || null,
        horas_dia: Number(f.get('horas_dia') || 8),
        foto_url: fotoUrl,
        valor_aquisicao: paraCentavos(f.get('valor_aquisicao') as string),
        modelo: (f.get('modelo') as string) || null,
        vida_util_horas: Number(f.get('vida_util_horas')),
        consumo_w: Number(f.get('consumo_w')),
        manutencao_hora: paraCentavos(f.get('manutencao_hora') as string),
        perfil_energia_id: (f.get('perfil_energia_id') as string) || null,
        agente_id: (f.get('agente_id') as string) || null,
      };
      if (editando.id) await crud.atualizar.mutateAsync({ id: editando.id, ...valores });
      else await crud.criar.mutateAsync(valores);
      setEditando(null);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {pode('configuracoes', 'criar') && <Botao onClick={() => abrirImp({})}>+ {t('acoes.nova')}</Botao>}
      </div>
      {lista.data!.length === 0 ? (
        <EstadoVazio />
      ) : (
        <Tabela cabecalhos={[
          t('cadastros.impressora.nome'), t('cadastros.impressora.tecnologia'),
          t('cadastros.impressora.perfilEnergia'), t('cadastros.impressora.vidaUtil'),
          t('cadastros.impressora.consumo'), t('cadastros.impressora.custoHora'), '',
        ]}>
          {lista.data!.map((i) => (
            <tr key={i.id} className="hover:bg-surface-2/50">
              <td className="px-3 py-2.5 font-semibold text-ink">{i.nome}
                <span className="block text-[10px] font-normal text-texto-2">
                  {[i.fabricante, i.modelo].filter(Boolean).join(' · ') || '—'}
                </span>
              </td>
              <td className="px-3 py-2.5"><Etiqueta cor="roxo">{i.tecnologia.toUpperCase()}</Etiqueta></td>
              <td className="px-3 py-2.5 text-texto-2">
                {(perfisEnergia.data ?? []).find((p) => p.id === i.perfil_energia_id)?.nome ?? '—'}
              </td>
              <td className="px-3 py-2.5 tabular-nums">{Number(i.vida_util_horas).toLocaleString()}h</td>
              <td className="px-3 py-2.5 tabular-nums">{i.consumo_w} W</td>
              <td className="px-3 py-2.5 font-semibold tabular-nums grad-texto"><Dinheiro centavos={custoHoraImpressora(i)} />/h</td>
              <td className="px-3 py-2.5 text-right">
                {pode('configuracoes', 'editar') && (
                  <div className="flex justify-end gap-1">
                    <Botao variante="fantasma" onClick={() => abrirImp(i)}>{t('acoes.editar')}</Botao>
                    <Botao variante="perigo" onClick={() => crud.excluir.mutate(i.id)}>{t('acoes.excluir')}</Botao>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <Modal aberto={!!editando} titulo={editando?.id ? t('acoes.editar') : t('acoes.nova')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('cadastros.impressora.nome')} className="col-span-2">
              <Entrada name="nome" required defaultValue={editando.nome ?? ''} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.tecnologia')}>
              <Selecao name="tecnologia" defaultValue={editando.tecnologia ?? 'fdm'}>
                <option value="fdm">FDM</option>
                <option value="resina">Resina</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Fabricante">
              <Entrada name="fabricante" defaultValue={editando.fabricante ?? ''} />
            </Campo>
            <Campo rotulo="Modelo">
              <Entrada name="modelo" defaultValue={editando.modelo ?? ''} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.numeroSerie')}>
              <Entrada name="numero_serie" defaultValue={editando.numero_serie ?? ''} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.dataAquisicao')}>
              <Entrada name="data_aquisicao" type="date" defaultValue={editando.data_aquisicao ?? ''} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.horasDia')} dica={t('cadastros.impressora.horasDiaDica')}>
              <Entrada name="horas_dia" type="number" min="0" max="24" step="0.5"
                defaultValue={editando.horas_dia ?? 8} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.perfilEnergia')}>
              <Selecao name="perfil_energia_id" value={editando.perfil_energia_id ?? ''}
                onChange={(e) => setEditando((m) => m && ({ ...m, perfil_energia_id: e.target.value || null }))}>
                <option value="">—</option>
                {(perfisEnergia.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo={t('cadastros.impressora.foto')} className="col-span-2">
              <div className="flex items-center gap-3">
                {(fotoNova || editando.foto_url) && (
                  fotoNova
                    ? <img src={URL.createObjectURL(fotoNova)} alt="" className="size-14 rounded-lg object-cover" />
                    : <FotoOuPlaceholder path={editando.foto_url} alt={editando.nome ?? ''} className="size-14 rounded-lg object-cover" />
                )}
                <input type="file" accept="image/*" className="text-xs text-texto-2"
                  onChange={(e) => setFotoNova(e.target.files?.[0] ?? null)} />
              </div>
            </Campo>
            <Campo rotulo={t('cadastros.impressora.valorAquisicao')}>
              <EntradaDinheiro name="valor_aquisicao" defaultCentavos={editando.valor_aquisicao ?? 0}
                onChange={(e) => setVivoImp({ ...vivoImp, valor: e.target.value })} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.vidaUtil')}>
              <Entrada name="vida_util_horas" type="number" min="1" required defaultValue={editando.vida_util_horas ?? 5000}
                onChange={(e) => setVivoImp({ ...vivoImp, vida: Number(e.target.value) || 0 })} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.consumo')}>
              <Entrada name="consumo_w" type="number" min="0" value={editando.consumo_w ?? 150}
                onChange={(e) => setEditando((m) => m && ({ ...m, consumo_w: Number(e.target.value) || 0 }))} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.manutencaoHora')}>
              <EntradaDinheiro name="manutencao_hora" defaultCentavos={editando.manutencao_hora ?? 0}
                onChange={(e) => setVivoImp({ ...vivoImp, manutencao: e.target.value })} />
            </Campo>
            {/* vínculo com o agente de impressão (impressão remota) */}
            <Campo rotulo={t('agente.aba')} className="col-span-2"
              dica={(agentes.data ?? []).length === 0 ? t('impressao.semAgente') : undefined}>
              <Selecao name="agente_id" defaultValue={editando.agente_id ?? ''}>
                <option value="">— {t('agente.offline')}</option>
                {(agentes.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </Selecao>
            </Campo>
            {/* o número que importa: custo por hora, calculado ao vivo (v2) */}
            <div className="col-span-2 rounded-xl border border-brand-roxo/30 bg-brand-roxo/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-roxo">
                {t('cadastros.impressora.custoHora')}
              </p>
              <p className="text-lg font-extrabold tabular-nums grad-texto">
                {moeda(Math.round(custoHoraVivo + energiaHoraViva), formato)}/h
              </p>
              <p className="text-[11px] text-texto-2">
                {t('cadastros.impressora.formulaCustoHora', {
                  maquina: moeda(Math.round(custoHoraVivo), formato),
                  energia: moeda(energiaHoraViva, formato),
                })}
              </p>
            </div>
            {erro && <p className="col-span-2 text-xs font-semibold text-erro">{erro}</p>}
            <div className="col-span-2 flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// -------------------------------------------------------------- Fornecedores
interface FornecedorCadastro {
  id: string;
  nome: string;
  tipo: string;
  pais: string | null;
  cnpj: string | null;
  categorias: string[];
  contato_nome: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  prazo_entrega_dias: number | null;
  pedido_minimo: number | null;
  condicoes_pagamento: string | null;
  site_url: string | null;
  endereco: string | null;
  observacoes: string | null;
  avaliacao: number | null;
}

function AbaFornecedores() {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const lista = useLista<FornecedorCadastro>('fornecedor', { ordem: 'nome', desc: false });
  const crud = useCrud('fornecedor');
  const [editando, setEditando] = useState<Partial<FornecedorCadastro> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    const valores = {
      nome: f.get('nome') as string,
      tipo: f.get('tipo') as string,
      pais: (f.get('pais') as string) || null,
      cnpj: (f.get('cnpj') as string) || null,
      categorias: (f.get('categorias') as string)
        ? (f.get('categorias') as string).split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      contato_nome: (f.get('contato_nome') as string) || null,
      contato_email: (f.get('contato_email') as string) || null,
      contato_telefone: (f.get('contato_telefone') as string) || null,
      prazo_entrega_dias: f.get('prazo_entrega_dias') ? Number(f.get('prazo_entrega_dias')) : null,
      pedido_minimo: f.get('pedido_minimo') ? paraCentavos(f.get('pedido_minimo') as string) : null,
      condicoes_pagamento: (f.get('condicoes_pagamento') as string) || null,
      site_url: (f.get('site_url') as string) || null,
      endereco: (f.get('endereco') as string) || null,
      observacoes: (f.get('observacoes') as string) || null,
      avaliacao: f.get('avaliacao') ? Number(f.get('avaliacao')) : null,
    };
    try {
      if (editando.id) await crud.atualizar.mutateAsync({ id: editando.id, ...valores });
      else await crud.criar.mutateAsync(valores);
      setEditando(null);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {pode('fornecedores', 'criar') && <Botao onClick={() => setEditando({ tipo: 'loja_3d' })}>+ {t('fornecedor.novo')}</Botao>}
      </div>
      {(lista.data ?? []).length === 0 ? (
        <EstadoVazio acao={pode('fornecedores', 'criar') ? <Botao onClick={() => setEditando({ tipo: 'loja_3d' })}>+ {t('fornecedor.novo')}</Botao> : undefined} />
      ) : (
        <TabelaDados<FornecedorCadastro>
          colunas={[
            {
              titulo: t('fornecedor.nome'),
              principal: true,
              render: (fo) => (
                <span className="font-semibold text-ink">
                  {fo.nome}
                  <span className="block text-[10px] font-normal text-texto-2">
                    {(fo.categorias ?? []).join(' · ') || '—'}
                  </span>
                </span>
              ),
            },
            { titulo: t('fornecedor.tipo'), render: (fo) => <Etiqueta cor={fo.tipo === 'marketplace' ? 'azul' : 'cinza'}>{t(`fornecedor.tipoLabel.${fo.tipo}`)}</Etiqueta> },
            { titulo: t('fornecedor.pais'), render: (fo) => fo.pais ?? '—' },
            { titulo: t('fornecedor.prazoEntrega'), numerica: true, render: (fo) => fo.prazo_entrega_dias != null ? `${fo.prazo_entrega_dias}d` : '—' },
            { titulo: t('fornecedor.pedidoMinimo'), numerica: true, render: (fo) => <Dinheiro centavos={fo.pedido_minimo} /> },
            { titulo: t('fornecedor.avaliacao'), render: (fo) => <span className="text-alerta">{fo.avaliacao ? '★'.repeat(fo.avaliacao) : '—'}</span> },
          ]}
          linhas={lista.data!}
          chave={(fo) => fo.id}
          acoes={(fo) =>
            pode('fornecedores', 'editar') ? (
              <div className="flex justify-end gap-1">
                <Botao variante="fantasma" onClick={() => setEditando(fo)}>{t('acoes.editar')}</Botao>
                <Botao variante="perigo" onClick={() => crud.excluir.mutate(fo.id)}>{t('acoes.excluir')}</Botao>
              </div>
            ) : null
          }
        />
      )}

      <Modal aberto={!!editando} titulo={editando?.id ? t('acoes.editar') : t('fornecedor.novo')} onFechar={() => setEditando(null)} largura="max-w-2xl">
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('fornecedor.nome')} className="col-span-2">
              <Entrada name="nome" required defaultValue={editando.nome ?? ''} />
            </Campo>
            <Campo rotulo={t('fornecedor.tipo')}>
              <Selecao name="tipo" defaultValue={editando.tipo ?? 'loja_3d'}>
                {['marketplace', 'loja_3d', 'local', 'atacado', 'outro'].map((tp) => (
                  <option key={tp} value={tp}>{t(`fornecedor.tipoLabel.${tp}`)}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo={t('fornecedor.pais')}>
              <Selecao name="pais" defaultValue={editando.pais ?? ''}>
                <option value="">—</option>
                <option value="BR">Brasil</option>
                <option value="US">United States</option>
                <option value="OTHER">{t('fornecedor.outroPais')}</option>
              </Selecao>
            </Campo>
            <Campo rotulo="CNPJ / Tax ID">
              <Entrada name="cnpj" defaultValue={editando.cnpj ?? ''} />
            </Campo>
            <Campo rotulo={t('fornecedor.site')}>
              <Entrada name="site_url" type="url" defaultValue={editando.site_url ?? ''} placeholder="https://" />
            </Campo>
            <Campo rotulo={t('fornecedor.prazoEntrega')}>
              <Entrada name="prazo_entrega_dias" type="number" min="0" defaultValue={editando.prazo_entrega_dias ?? ''} />
            </Campo>
            <Campo rotulo={t('fornecedor.pedidoMinimo')}>
              <EntradaDinheiro name="pedido_minimo" defaultCentavos={editando.pedido_minimo ?? 0} />
            </Campo>
            <Campo rotulo={t('fornecedor.avaliacao')}>
              <Entrada name="avaliacao" type="number" min="1" max="5" defaultValue={editando.avaliacao ?? ''} />
            </Campo>
            <Campo rotulo={t('fornecedor.contato')}>
              <Entrada name="contato_nome" defaultValue={editando.contato_nome ?? ''} />
            </Campo>
            <Campo rotulo="Email">
              <Entrada name="contato_email" type="email" defaultValue={editando.contato_email ?? ''} />
            </Campo>
            <Campo rotulo={t('fornecedor.telefone')}>
              <Entrada name="contato_telefone" defaultValue={editando.contato_telefone ?? ''} />
            </Campo>
            <Campo rotulo={t('fornecedor.categorias')} dica={t('fornecedor.categoriasDica')} className="col-span-2">
              <Entrada name="categorias" defaultValue={(editando.categorias ?? []).join(', ')} />
            </Campo>
            <Campo rotulo={t('fornecedor.condicoesPagamento')} className="col-span-2">
              <Entrada name="condicoes_pagamento" defaultValue={editando.condicoes_pagamento ?? ''} />
            </Campo>
            <Campo rotulo={t('fornecedor.endereco')} className="col-span-2">
              <Entrada name="endereco" defaultValue={editando.endereco ?? ''} />
            </Campo>
            <Campo rotulo={t('fornecedor.observacoes')} className="col-span-2">
              <textarea name="observacoes" rows={2} defaultValue={editando.observacoes ?? ''}
                className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
            </Campo>
            {erro && <p className="col-span-2 text-xs font-semibold text-erro">{erro}</p>}
            <div className="col-span-2 flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ------------------------------------------------------- Cadastros simples
function CrudSimples({
  tabela,
  colunas,
  formulario,
  paraValores,
}: {
  tabela: string;
  colunas: { titulo: string; render: (linha: Record<string, unknown>) => React.ReactNode }[];
  formulario: (linha: Partial<Record<string, unknown>>) => React.ReactNode;
  paraValores: (f: FormData) => Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const lista = useLista(tabela, { ordem: 'nome', desc: false });
  const crud = useCrud(tabela);
  const [editando, setEditando] = useState<Partial<Record<string, unknown>> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const valores = paraValores(new FormData(e.currentTarget));
    try {
      if (editando.id) await crud.atualizar.mutateAsync({ id: editando.id as string, ...valores });
      else await crud.criar.mutateAsync(valores);
      setEditando(null);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {pode('configuracoes', 'criar') && <Botao onClick={() => setEditando({})}>+ {t('acoes.novo')}</Botao>}
      </div>
      {lista.data!.length === 0 ? (
        <EstadoVazio />
      ) : (
        <Tabela cabecalhos={[...colunas.map((c) => c.titulo), '']}>
          {lista.data!.map((linha) => (
            <tr key={linha.id as string} className="hover:bg-surface-2/50">
              {colunas.map((c, i) => (
                <td key={i} className="px-3 py-2.5">{c.render(linha)}</td>
              ))}
              <td className="px-3 py-2.5 text-right">
                {pode('configuracoes', 'editar') && (
                  <div className="flex justify-end gap-1">
                    <Botao variante="fantasma" onClick={() => setEditando(linha)}>{t('acoes.editar')}</Botao>
                    <Botao variante="perigo" onClick={() => crud.excluir.mutate(linha.id as string)}>{t('acoes.excluir')}</Botao>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}
      <Modal aberto={!!editando} titulo={editando?.id ? t('acoes.editar') : t('acoes.novo')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvar} className="space-y-3">
            {formulario(editando)}
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

function AbaCanais() {
  const { t } = useTranslation();
  const pctTxt = (v: unknown) => `${(Number(v) * 100).toFixed(1).replace('.', ',')}%`;
  return (
    <CrudSimples
      tabela="canal_venda"
      colunas={[
        { titulo: t('cadastros.canal.nome'), render: (l) => <span className="font-semibold text-ink">{String(l.nome)}</span> },
        { titulo: t('cadastros.canal.tipo'), render: (l) => <Etiqueta cor={l.tipo === 'marketplace' ? 'azul' : 'cinza'}>{t(`cadastros.canal.tipoLabel.${String(l.tipo ?? 'direto')}`)}</Etiqueta> },
        { titulo: t('cadastros.canal.taxaMarketplace'), render: (l) => pctTxt(l.taxa_marketplace) },
        { titulo: t('cadastros.canal.taxaPagamento'), render: (l) => pctTxt(l.taxa_pagamento) },
        { titulo: t('cadastros.canal.comissao'), render: (l) => pctTxt(l.comissao) },
        { titulo: t('cadastros.canal.custoFixoPedido'), render: (l) => <Dinheiro centavos={Number(l.custo_fixo_pedido ?? 0)} /> },
      ]}
      formulario={(l) => (
        <>
          <Campo rotulo={t('cadastros.canal.nome')}>
            <Entrada name="nome" required defaultValue={(l.nome as string) ?? ''} />
          </Campo>
          <Campo rotulo={t('cadastros.canal.tipo')}>
            <Selecao name="tipo" defaultValue={(l.tipo as string) ?? 'direto'}>
              {['direto', 'marketplace', 'loja_online', 'social', 'atacado', 'outro'].map((tp) => (
                <option key={tp} value={tp}>{t(`cadastros.canal.tipoLabel.${tp}`)}</option>
              ))}
            </Selecao>
          </Campo>
          <div className="grid grid-cols-3 gap-3">
            <Campo rotulo={t('cadastros.canal.taxaMarketplace')}>
              <Entrada name="taxa_marketplace" type="number" step="0.1" min="0" max="99" defaultValue={l.taxa_marketplace != null ? Number(l.taxa_marketplace) * 100 : 0} />
            </Campo>
            <Campo rotulo={t('cadastros.canal.taxaPagamento')}>
              <Entrada name="taxa_pagamento" type="number" step="0.1" min="0" max="99" defaultValue={l.taxa_pagamento != null ? Number(l.taxa_pagamento) * 100 : 0} />
            </Campo>
            <Campo rotulo={t('cadastros.canal.comissao')}>
              <Entrada name="comissao" type="number" step="0.1" min="0" max="99" defaultValue={l.comissao != null ? Number(l.comissao) * 100 : 0} />
            </Campo>
          </div>
          <Campo rotulo={t('cadastros.canal.custoFixoPedido')} dica={t('cadastros.canal.custoFixoPedidoDica')}>
            <EntradaDinheiro name="custo_fixo_pedido" defaultCentavos={Number(l.custo_fixo_pedido ?? 0)} />
          </Campo>
          <Campo rotulo={t('fornecedor.observacoes')}>
            <Entrada name="observacoes" defaultValue={(l.observacoes as string) ?? ''} />
          </Campo>
        </>
      )}
      paraValores={(f) => ({
        nome: f.get('nome'),
        tipo: f.get('tipo'),
        taxa_marketplace: Number(f.get('taxa_marketplace')) / 100,
        taxa_pagamento: Number(f.get('taxa_pagamento')) / 100,
        comissao: Number(f.get('comissao')) / 100,
        custo_fixo_pedido: paraCentavos(f.get('custo_fixo_pedido') as string),
        observacoes: (f.get('observacoes') as string) || null,
      })}
    />
  );
}

function AbaCustosFixos() {
  const { t } = useTranslation();
  return (
    <CrudSimples
      tabela="custo_fixo"
      colunas={[
        { titulo: t('cadastros.custoFixo.nome'), render: (l) => <span className="font-semibold text-ink">{String(l.nome)}</span> },
        { titulo: t('cadastros.custoFixo.categoria'), render: (l) => t(`cadastros.custoFixo.categoriaLabel.${String(l.categoria ?? 'outros')}`) },
        { titulo: t('cadastros.custoFixo.valorMensal'), render: (l) => <Dinheiro centavos={Number(l.valor_mensal)} /> },
        { titulo: t('cadastros.custoFixo.ratear'), render: (l) => <Etiqueta cor={l.ratear === false ? 'cinza' : 'verde'}>{l.ratear === false ? t('acoes.nao') : t('acoes.sim')}</Etiqueta> },
      ]}
      formulario={(l) => (
        <>
          <Campo rotulo={t('cadastros.custoFixo.nome')}>
            <Entrada name="nome" required defaultValue={(l.nome as string) ?? ''} />
          </Campo>
          <Campo rotulo={t('cadastros.custoFixo.categoria')}>
            <Selecao name="categoria" defaultValue={(l.categoria as string) ?? 'outros'}>
              {['aluguel', 'internet', 'software', 'manutencao', 'contador', 'energia', 'marketing', 'seguro', 'suprimentos', 'outros'].map((cat) => (
                <option key={cat} value={cat}>{t(`cadastros.custoFixo.categoriaLabel.${cat}`)}</option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo={t('cadastros.custoFixo.valorMensal')}>
            <EntradaDinheiro name="valor_mensal" defaultCentavos={Number(l.valor_mensal ?? 0)} />
          </Campo>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" name="ratear" defaultChecked={l.ratear !== false} />
            {t('cadastros.custoFixo.ratearNoPreco')}
          </label>
          <Campo rotulo={t('fornecedor.observacoes')}>
            <Entrada name="observacao" defaultValue={(l.observacao as string) ?? ''} />
          </Campo>
        </>
      )}
      paraValores={(f) => ({
        nome: f.get('nome'),
        categoria: f.get('categoria'),
        valor_mensal: paraCentavos(f.get('valor_mensal') as string),
        ratear: f.get('ratear') === 'on',
        observacao: (f.get('observacao') as string) || null,
      })}
    />
  );
}

function AbaMaoDeObra() {
  const { t } = useTranslation();
  return (
    <CrudSimples
      tabela="tarefa_mao_obra"
      colunas={[
        { titulo: t('cadastros.tarefa.nome'), render: (l) => <span className="font-semibold text-ink">{String(l.nome)}</span> },
        { titulo: t('cadastros.tarefa.tipo'), render: (l) => t(`cadastros.tarefa.tipoLabel.${String(l.tipo ?? 'producao')}`) },
        { titulo: t('cadastros.tarefa.valorHora'), render: (l) => <Dinheiro centavos={Number(l.valor_hora)} /> },
        { titulo: t('cadastros.tarefa.incluirPadrao'), render: (l) => <Etiqueta cor={l.incluir_padrao === false ? 'cinza' : 'verde'}>{l.incluir_padrao === false ? t('acoes.nao') : t('acoes.sim')}</Etiqueta> },
      ]}
      formulario={(l) => (
        <>
          <Campo rotulo={t('cadastros.tarefa.nome')}>
            <Entrada name="nome" required defaultValue={(l.nome as string) ?? ''} />
          </Campo>
          <Campo rotulo={t('cadastros.tarefa.tipo')}>
            <Selecao name="tipo" defaultValue={(l.tipo as string) ?? 'producao'}>
              {['preparacao', 'producao', 'acabamento', 'administrativo', 'embalagem', 'outro'].map((tp) => (
                <option key={tp} value={tp}>{t(`cadastros.tarefa.tipoLabel.${tp}`)}</option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo={t('cadastros.tarefa.valorHora')}>
            <EntradaDinheiro name="valor_hora" defaultCentavos={Number(l.valor_hora ?? 0)} />
          </Campo>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" name="incluir_padrao" defaultChecked={l.incluir_padrao !== false} />
            {t('cadastros.tarefa.incluirPadrao')}
          </label>
        </>
      )}
      paraValores={(f) => ({
        nome: f.get('nome'),
        tipo: f.get('tipo'),
        valor_hora: paraCentavos(f.get('valor_hora') as string),
        incluir_padrao: f.get('incluir_padrao') === 'on',
      })}
    />
  );
}

function AbaEnergia() {
  const { t } = useTranslation();
  return (
    <CrudSimples
      tabela="perfil_energia"
      colunas={[
        { titulo: t('cadastros.energia2.nome'), render: (l) => <span className="font-semibold text-ink">{String(l.nome)}</span> },
        { titulo: t('cadastros.energia2.tarifaKwh'), render: (l) => <><Dinheiro centavos={Number(l.tarifa_kwh)} />/kWh</> },
      ]}
      formulario={(l) => (
        <>
          <Campo rotulo={t('cadastros.energia2.nome')}>
            <Entrada name="nome" required defaultValue={(l.nome as string) ?? ''} />
          </Campo>
          <Campo rotulo={t('cadastros.energia2.tarifaKwh')}>
            <EntradaDinheiro name="tarifa_kwh" defaultCentavos={Number(l.tarifa_kwh ?? 0)} />
          </Campo>
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-texto-2">
            {t('cadastros.energia2.dicaCalculo')}
          </p>
        </>
      )}
      paraValores={(f) => ({
        nome: f.get('nome'),
        tarifa_kwh: paraCentavos(f.get('tarifa_kwh') as string),
      })}
    />
  );
}

function AbaCategorias() {
  const { t } = useTranslation();
  return (
    <CrudSimples
      tabela="categoria"
      colunas={[
        { titulo: t('categoria.rotulo'), render: (l) => <span className="font-semibold text-ink">{String(l.nome)}</span> },
        { titulo: t('categoria.escopo'), render: (l) => <Etiqueta>{t(`categoria.escopoLabel.${String(l.escopo ?? 'produto')}`)}</Etiqueta> },
      ]}
      formulario={(l) => (
        <>
          <Campo rotulo={t('categoria.rotulo')}>
            <Entrada name="nome" required defaultValue={(l.nome as string) ?? ''} />
          </Campo>
          <Campo rotulo={t('categoria.escopo')}>
            <Selecao name="escopo" defaultValue={(l.escopo as string) ?? 'produto'}>
              {['modelo', 'produto', 'material'].map((escopo) => (
                <option key={escopo} value={escopo}>{t(`categoria.escopoLabel.${escopo}`)}</option>
              ))}
            </Selecao>
          </Campo>
        </>
      )}
      paraValores={(f) => ({
        nome: f.get('nome'),
        escopo: f.get('escopo'),
      })}
    />
  );
}

export { custoHoraImpressora };
export type { Impressora, Material };
