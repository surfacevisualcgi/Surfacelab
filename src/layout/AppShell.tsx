/**
 * Casca do app: sidebar PRETA (detalhes pretos sobre base branca), gradiente
 * apenas como acento (item ativo, logo). Responsiva: sidebar vira gaveta no
 * mobile. Estrutura segue os protótipos v2; pele é Surface Labs.
 */
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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

  const itens: ItemNav[] = [
    { para: '/', rotulo: t('nav.visaoGeral'), modulo: 'relatorios', icone: ICONES.casa },
    { para: '/modelos', rotulo: t('nav.modelos'), modulo: 'modelos', icone: ICONES.cubo },
    { para: '/produtos', rotulo: t('nav.produtos'), modulo: 'produtos', icone: ICONES.caixa },
    { para: '/calculadora', rotulo: t('nav.calculadora'), modulo: 'calculadora', icone: ICONES.calc },
    { para: '/orcamentos', rotulo: t('nav.orcamentos'), modulo: 'orcamentos', icone: ICONES.doc },
    { para: '/pedidos', rotulo: t('nav.pedidos'), modulo: 'pedidos', icone: ICONES.kanban },
    { para: '/estoque', rotulo: t('nav.estoque'), modulo: 'estoque', icone: ICONES.estoque },
    { para: '/clientes', rotulo: t('nav.clientes'), modulo: 'clientes', icone: ICONES.pessoas },
    { para: '/fornecedores', rotulo: t('nav.fornecedores'), modulo: 'fornecedores', icone: ICONES.caminhao },
    { para: '/financeiro', rotulo: t('nav.financeiro'), modulo: 'financeiro', icone: ICONES.cifrao },
    { para: '/fiscal', rotulo: t('nav.fiscal'), modulo: 'fiscal', icone: ICONES.doc },
    { para: '/impressoras', rotulo: t('nav.impressoras'), modulo: 'configuracoes', icone: ICONES.estoque },
    { para: '/cadastros', rotulo: t('nav.cadastros'), modulo: 'configuracoes', icone: ICONES.lista },
    { para: '/configuracoes', rotulo: t('nav.configuracoes'), modulo: 'configuracoes', icone: ICONES.engren },
  ];
  const visiveis = itens.filter((i) => i.para === '/' || pode(i.modulo));

  const iniciais = (session?.user?.user_metadata?.nome_exibicao as string | undefined)
    ?.split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? '?';

  const nav = (
    <nav className="flex flex-col gap-0.5 px-2">
      {visiveis.map((item) => (
        <NavLink
          key={item.para}
          to={item.para}
          end={item.para === '/'}
          onClick={() => setMenuAberto(false)}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
              isActive
                ? 'grad-acento text-white shadow-sm'
                : 'text-white/65 hover:bg-white/10 hover:text-white'
            }`
          }
        >
          <Icone d={item.icone} />
          {item.rotulo}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-surface-2">
      {/* sidebar desktop — rodapé com plano e usuário (estrutura v2) */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col bg-ink py-4 lg:flex">
        <div className="mb-5 px-4">
          <Logo claro tamanho={26} />
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="mt-3 border-t border-white/10 px-4 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
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
              <span className="block truncate text-[11px] font-semibold text-white/85">
                {(session?.user?.user_metadata?.nome_exibicao as string | undefined) ?? session?.user?.email}
              </span>
              <span className="block text-[10px] text-white/45">
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
            className="absolute left-0 top-0 h-full w-64 bg-ink py-4"
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
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-borda bg-white/90 px-4 py-2.5 backdrop-blur">
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

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 sm:p-6 lg:pb-6">
          <Outlet />
        </main>

        {/* bottom nav mobile — 5 itens, Calculadora central em destaque (v2) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-white/95 backdrop-blur lg:hidden"
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
