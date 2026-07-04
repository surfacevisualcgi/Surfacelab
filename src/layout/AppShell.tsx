/**
 * Casca do app: sidebar PRETA (detalhes pretos sobre base branca), gradiente
 * apenas como acento (item ativo, logo). Responsiva: sidebar vira gaveta no
 * mobile. Estrutura segue os protótipos v2; pele é Surface Labs.
 */
import { useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Logo } from '@/components/ui';
import { BuscaGlobal } from './BuscaGlobal';
import type { Modulo } from '@/auth/permissoes';

interface ItemNav {
  para: string;
  rotulo: string;
  modulo: Modulo;
  icone: string; // path de um ícone SVG inline 24x24
}

const ICONES: Record<string, string> = {
  casa: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  cubo: 'M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3L18.6 8 12 11.7 5.4 8 12 4.3ZM5 9.7l6 3.4v6.6l-6-3.4V9.7Zm8 10v-6.6l6-3.4v6.6l-6 3.4Z',
  caixa: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8ZM12 4l6.3 3.6L12 11.2 5.7 7.6 12 4Z',
  calc: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4h10v3H7V7Zm0 5h3v2H7v-2Zm0 4h3v2H7v-2Zm5-4h2v2h-2v-2Zm0 4h2v2h-2v-2Zm5-4h2v6h-2v-6Z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L17.5 8H14V4.5ZM8 12h8v1.5H8V12Zm0 4h8v1.5H8V16Z',
  kanban: 'M4 4h4v16H4V4Zm6 0h4v10h-4V4Zm6 0h4v7h-4V4Z',
  estoque: 'M4 7h16v13H4V7Zm2 2v9h12V9H6ZM9 4h6v2H9V4Zm1 7h4v2h-4v-2Z',
  pessoas: 'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-5 1.3-5 3v2h10v-2c0-1.7-2.3-3-5-3Zm8 0a6 6 0 0 0-1.7.25A4.2 4.2 0 0 1 16 16v2h5v-2c0-1.7-2.3-3-5-3Z',
  caminhao: 'M3 5h11v10H3V5Zm13 3h3l2 3v4h-2a2.5 2.5 0 0 1-5 0h-3a2.5 2.5 0 0 1-5 0H3v-2h11V8h2Z',
  cifrao: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15.5V19h-2v-1.5a3.6 3.6 0 0 1-2.8-2.1l1.8-.8A2 2 0 0 0 12 16c.9 0 1.6-.5 1.6-1.2s-.5-1-1.9-1.5c-1.8-.6-3.2-1.3-3.2-3 0-1.4 1-2.5 2.5-2.9V6h2v1.4a3.3 3.3 0 0 1 2.4 1.8l-1.7.8A1.8 1.8 0 0 0 12 9c-.8 0-1.4.4-1.4 1s.6 1 2 1.5c1.9.6 3.1 1.4 3.1 3 0 1.5-1.1 2.7-2.7 3Z',
  engren: 'M19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.3 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5ZM13 15a3 3 0 1 1 3-3 3 3 0 0 1-3 3Z',
  lista: 'M4 6h2v2H4V6Zm4 0h12v2H8V6ZM4 11h2v2H4v-2Zm4 0h12v2H8v-2ZM4 16h2v2H4v-2Zm4 0h12v2H8v-2Z',
  spark: 'M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2Zm6 12 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3ZM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13Z',
  imagem: 'M4 5h16v14H4V5Zm2 2v8.5l3.5-3.5 2.5 2.5 3.5-4.5L18 13.2V7H6Zm2.5 3.5A1.5 1.5 0 1 0 8.5 9a1.5 1.5 0 0 0 0 1.5Z',
  radar: 'M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3Zm0 4a5 5 0 1 0 5 5h-2a3 3 0 1 1-3-3V7Zm8-4 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z',
};

function Icone({ d }: { d: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { ativa, memberships, trocarEmpresa, sair, pode, session } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const [empresasAberto, setEmpresasAberto] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const telaCheia = location.pathname.startsWith('/modelos') || location.pathname.startsWith('/produtos') || location.pathname.startsWith('/canais') || location.pathname.startsWith('/estoque') || location.pathname.startsWith('/cadastros') || location.pathname.startsWith('/pedidos') || location.pathname.startsWith('/clientes') || location.pathname.startsWith('/orcamentos') || location.pathname.startsWith('/financeiro') || location.pathname.startsWith('/calculadora') || location.pathname.startsWith('/creator-lab');
  const creatorLabAtivo = location.pathname.startsWith('/creator-lab');
  const canaisAtivo = location.pathname.startsWith('/canais');
  const [creatorLabAberto, setCreatorLabAberto] = useState(creatorLabAtivo);
  const [canaisAberto, setCanaisAberto] = useState(canaisAtivo);

  const itens: ItemNav[] = [
    { para: '/', rotulo: t('nav.visaoGeral'), modulo: 'relatorios', icone: ICONES.casa },
    { para: '/modelos', rotulo: t('nav.modelos'), modulo: 'modelos', icone: ICONES.cubo },
    { para: '/produtos', rotulo: t('nav.produtos'), modulo: 'produtos', icone: ICONES.caixa },
    { para: '/calculadora', rotulo: t('nav.calculadora'), modulo: 'calculadora', icone: ICONES.calc },
    { para: '/orcamentos', rotulo: t('nav.orcamentos'), modulo: 'orcamentos', icone: ICONES.doc },
    { para: '/pedidos', rotulo: t('nav.pedidos'), modulo: 'pedidos', icone: ICONES.kanban },
    { para: '/estoque', rotulo: t('nav.estoque'), modulo: 'estoque', icone: ICONES.estoque },
    { para: '/clientes', rotulo: t('nav.clientes'), modulo: 'clientes', icone: ICONES.pessoas },
    { para: '/financeiro', rotulo: t('nav.financeiro'), modulo: 'financeiro', icone: ICONES.cifrao },
    { para: '/cadastros', rotulo: t('nav.cadastros'), modulo: 'configuracoes', icone: ICONES.lista },
    { para: '/configuracoes', rotulo: t('nav.configuracoes'), modulo: 'configuracoes', icone: ICONES.engren },
  ];
  const visiveis = itens.filter((i) => i.para === '/' || pode(i.modulo));
  const itensCreatorLab: ItemNav[] = [
    { para: '/creator-lab/anuncios', rotulo: 'Anúncios', modulo: 'relatorios', icone: ICONES.spark },
    { para: '/creator-lab/imagens', rotulo: 'Imagens', modulo: 'relatorios', icone: ICONES.imagem },
    { para: '/creator-lab/radar', rotulo: 'Radar', modulo: 'relatorios', icone: ICONES.radar },
  ];
  const creatorLabVisiveis = itensCreatorLab.filter((i) => pode(i.modulo));
  const canais = [
    { para: '/canais/shopify', rotulo: 'Shopify' },
    { para: '/canais/tiktok-shop', rotulo: 'TikTok Shop' },
    { para: '/canais/shopee', rotulo: 'Shopee' },
    { para: '/canais/amazon', rotulo: 'Amazon' },
    { para: '/canais/mercado-livre', rotulo: 'Mercado Livre' },
    { para: '/canais/loja-propria', rotulo: 'Loja propria' },
    { para: '/canais/venda-direta', rotulo: 'Venda direta' },
  ];

  const iniciais = (session?.user?.user_metadata?.nome_exibicao as string | undefined)
    ?.split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? '?';
  const sidebarStyle = {
    '--sidebar-bg': ativa?.tenant.sidebar_bg_color ?? '#0d0d0d',
    '--sidebar-text': ativa?.tenant.sidebar_text_color ?? '#ffffff',
  } as CSSProperties;

  const nav = (
    <nav className="flex flex-col gap-0.5 px-2">
      {visiveis.map((item) => (
        <div key={item.para}>
          <NavLink
            to={item.para}
            end={item.para === '/'}
            onClick={() => setMenuAberto(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
                isActive
                  ? 'sidebar-link-active grad-acento shadow-sm'
                  : 'sidebar-link'
              }`
            }
          >
            <Icone d={item.icone} />
            {item.rotulo}
          </NavLink>
          {item.para === '/produtos' && pode('produtos') && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setCanaisAberto((aberto) => !aberto)}
                aria-expanded={canaisAberto}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
                  canaisAtivo ? 'sidebar-link-active grad-acento shadow-sm' : 'sidebar-link'
                }`}
              >
                <Icone d={ICONES.radar} />
                <span className="min-w-0 flex-1">Canais</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className={`shrink-0 transition-transform ${canaisAberto ? 'rotate-180' : ''}`}
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {canaisAberto && (
                <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l sidebar-border pl-2">
                  {canais.map((canal) => (
                    <NavLink
                      key={canal.para}
                      to={canal.para}
                      onClick={() => setMenuAberto(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                          isActive ? 'sidebar-link-active bg-white/10' : 'sidebar-link'
                        }`
                      }
                    >
                      <span className="size-1.5 rounded-full bg-current opacity-70" />
                      {canal.rotulo}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {creatorLabVisiveis.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setCreatorLabAberto((aberto) => !aberto)}
            aria-expanded={creatorLabAberto}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
              creatorLabAtivo
                ? 'sidebar-link-active grad-acento shadow-sm'
                : 'sidebar-link'
            }`}
          >
            <Icone d={ICONES.spark} />
            <span className="min-w-0 flex-1">Creator Lab</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={`shrink-0 transition-transform ${creatorLabAberto ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {creatorLabAberto && (
            <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l sidebar-border pl-2">
              {creatorLabVisiveis.map((item) => (
                <NavLink
                  key={item.para}
                  to={item.para}
                  onClick={() => setMenuAberto(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      isActive
                        ? 'sidebar-link-active bg-white/10'
                        : 'sidebar-link'
                    }`
                  }
                >
                  <Icone d={item.icone} />
                  {item.rotulo}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-surface-2">
      {/* sidebar desktop — rodapé com plano e usuário (estrutura v2) */}
      <aside className="sidebar-theme sticky top-0 hidden h-dvh w-56 shrink-0 flex-col py-4 lg:flex" style={sidebarStyle}>
        <div className="mb-5 px-4">
          <Logo claro tamanho={26} />
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="sidebar-border mt-3 border-t px-4 pt-3">
          <p className="sidebar-muted text-[10px] font-bold uppercase tracking-wide">
            {t('config.planoAtual')}
          </p>
          <p className="text-xs font-bold grad-texto">
            {t(`config.planoLabel.${ativa?.tenant.plano ?? 'gratuito'}`)}
          </p>
          <button onClick={() => navigate('/conta')}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-white/10">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full grad-acento text-[9px] font-extrabold text-white">
              {iniciais}
            </span>
            <span className="min-w-0">
              <span className="sidebar-soft block truncate text-[11px] font-semibold">
                {(session?.user?.user_metadata?.nome_exibicao as string | undefined) ?? session?.user?.email}
              </span>
              <span className="sidebar-muted block text-[10px]">
                {t(`config.papelLabel.${ativa?.papel ?? 'leitura'}`)}
              </span>
            </span>
          </button>
        </div>
      </aside>

      {/* gaveta mobile */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMenuAberto(false)}>
          <div className="absolute inset-0 bg-ink/40" />
          <aside
            className="sidebar-theme absolute left-0 top-0 h-full w-64 py-4"
            style={sidebarStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 px-4">
              <Logo claro tamanho={26} />
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header
          className="app-topbar sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-borda bg-white/90 px-4 backdrop-blur"
        >
          <div className="flex items-center gap-2">
            <button
              className="rounded-md p-1.5 text-ink hover:bg-surface-2 lg:hidden"
              onClick={() => setMenuAberto(true)}
              aria-label="Menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="lg:hidden"><Logo tamanho={22} /></span>
          </div>

          {/* busca global ao centro (v2) */}
          <BuscaGlobal />

          <div className="flex items-center gap-2">
            {/* seletor de empresa */}
            <div className="relative">
              <button
                onClick={() => setEmpresasAberto((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-borda px-2.5 py-1.5 text-xs font-bold text-ink hover:bg-surface-2"
              >
                {ativa?.tenant.nome ?? '—'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {empresasAberto && (
                <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-borda bg-white p-1.5 shadow-lg">
                  {memberships.map((m) => (
                    <button
                      key={m.id}
                      onClick={async () => {
                        setEmpresasAberto(false);
                        if (m.tenant_id !== ativa?.tenant_id) await trocarEmpresa(m.tenant_id);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold ${
                        m.tenant_id === ativa?.tenant_id ? 'bg-surface-2 text-ink' : 'text-texto-2 hover:bg-surface-2'
                      }`}
                    >
                      {m.tenant.nome}
                      <span className="text-[10px] font-normal">{t(`config.papelLabel.${m.papel}`)}</span>
                    </button>
                  ))}
                  <div className="my-1 h-px bg-borda" />
                  <button
                    onClick={() => { setEmpresasAberto(false); navigate('/empresa'); }}
                    className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-brand-azul hover:bg-surface-2"
                  >
                    + {t('empresa.criarNova')}
                  </button>
                </div>
              )}
            </div>

            {/* avatar / conta */}
            <div className="group relative">
              <button
                onClick={() => navigate('/conta')}
                className="flex size-8 items-center justify-center rounded-full grad-acento text-[11px] font-extrabold text-white"
                title={t('nav.minhaConta')}
              >
                {iniciais}
              </button>
            </div>
            <button
              onClick={sair}
              className="rounded-md p-1.5 text-texto-2 hover:bg-surface-2 hover:text-ink"
              title={t('nav.sair')}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </header>

        <main className={`mx-auto w-full flex-1 px-3 py-4 pb-24 sm:p-6 lg:pb-6 ${telaCheia ? 'max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-3rem)] 2xl:px-8' : 'max-w-6xl'}`}>
          <Outlet />
        </main>

        {/* bottom nav mobile — 5 itens, Calculadora central em destaque (v2) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-white/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur lg:hidden"
          aria-label="Navegação principal">
          <div className="mx-auto grid max-w-md grid-cols-5">
            {[
              { para: '/', rotulo: t('nav.visaoGeral'), icone: ICONES.casa, fim: true },
              { para: '/produtos', rotulo: t('nav.produtos'), icone: ICONES.caixa },
              { para: '/calculadora', rotulo: t('nav.calculadora'), icone: ICONES.calc, central: true },
              { para: '/pedidos', rotulo: t('nav.pedidos').split(' ')[0], icone: ICONES.kanban },
              { para: '/configuracoes', rotulo: t('nav.configuracoes'), icone: ICONES.engren },
            ].map((item) => (
              <NavLink key={item.para} to={item.para} end={item.fim}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-1 pb-2 pt-1.5 text-[10px] font-semibold ${
                    item.central
                      ? ''
                      : isActive ? 'text-brand-roxo' : 'text-texto-2'
                  }`
                }>
                {({ isActive }) =>
                  item.central ? (
                    <>
                      <span className={`-mt-4 flex size-11 items-center justify-center rounded-full text-white shadow-lg ${isActive ? 'grad-acento' : 'bg-ink'}`}>
                        <Icone d={item.icone} />
                      </span>
                      <span className={isActive ? 'text-brand-roxo' : 'text-texto-2'}>{item.rotulo}</span>
                    </>
                  ) : (
                    <>
                      <Icone d={item.icone} />
                      <span className="truncate">{item.rotulo}</span>
                    </>
                  )
                }
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
