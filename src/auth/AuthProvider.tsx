import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { formatoDoIdioma, type FormatoTenant } from '@/lib/formato';
import i18n, { idiomaDoNavegador, resolverIdioma, type Idioma } from '@/i18n';
import {
  temFlag,
  temPermissao,
  type Acao,
  type Flag,
  type Modulo,
  type Papel,
} from './permissoes';

export const VERSAO_TERMOS = '2026-06-11'; // re-pedir aceite quando mudar

export interface MembershipInfo {
  id: string;
  tenant_id: string;
  papel: Papel;
  permissoes_extras: Record<string, Record<string, boolean>>;
  flags_sensiveis: Record<string, boolean>;
  tenant: {
    id: string;
    nome: string;
    logo_path: string | null;
    sidebar_bg_color: string | null;
    sidebar_text_color: string | null;
    moeda: string;
    locale: string;
    plano: string;
    status_assinatura: string;
    momento_baixa_estoque: string;
    criterio_rateio_custo_fixo: string;
    faturamento_mensal_esperado: number;
    cenarios_precificacao: {
      nome: string;
      probabilidade_falha: number;
      margem: number;
      provisao: number;
    }[];
  };
}

interface AuthContexto {
  carregando: boolean;
  session: Session | null;
  memberships: MembershipInfo[];
  /** membership do tenant ativo (null = precisa escolher/criar empresa) */
  ativa: MembershipInfo | null;
  formato: FormatoTenant;
  /** idioma da pessoa (vale em todas as empresas) */
  idioma: Idioma;
  definirIdioma: (idioma: Idioma) => Promise<void>;
  pode: (modulo: Modulo, acao?: Acao) => boolean;
  flag: (f: Flag) => boolean;
  entrar: (email: string, senha: string) => Promise<string | null>;
  entrarComGoogle: () => Promise<void>;
  cadastrar: (nome: string, email: string, senha: string) => Promise<string | null>;
  sair: () => Promise<void>;
  criarEmpresa: (nome: string) => Promise<string | null>;
  trocarEmpresa: (tenantId: string) => Promise<void>;
  recarregar: () => Promise<void>;
}

const Ctx = createContext<AuthContexto | null>(null);

export function useAuth(): AuthContexto {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

function tenantAtivoDoJwt(session: Session | null): string | null {
  const claim = (session?.user?.app_metadata as Record<string, unknown> | undefined)?.tenant_ativo;
  return typeof claim === 'string' && claim ? claim : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<MembershipInfo[]>([]);
  const [idioma, setIdioma] = useState<Idioma>(() => i18n.language as Idioma);

  // Aplica o idioma da PESSOA (preferencias.idioma no usuario). Na primeira vez
  // (sem preferência salva) usa o idioma do navegador e persiste — assim contas
  // de países diferentes já veem o idioma certo.
  const carregarIdioma = useCallback(async (s: Session | null) => {
    if (!s) return;
    const { data } = await supabase
      .from('usuario').select('preferencias').eq('id', s.user.id).single();
    const salvo = (data?.preferencias as { idioma?: string } | null)?.idioma;
    if (salvo) {
      const lang = resolverIdioma(salvo);
      await i18n.changeLanguage(lang);
      setIdioma(lang);
      return;
    }
    const lang = idiomaDoNavegador();
    await i18n.changeLanguage(lang);
    setIdioma(lang);
    await supabase.from('usuario')
      .update({ preferencias: { ...(data?.preferencias ?? {}), idioma: lang } })
      .eq('id', s.user.id);
  }, []);

  const carregarMemberships = useCallback(async (s: Session | null) => {
    if (!s) {
      setMemberships([]);
      return;
    }
    const { data, error } = await supabase
      .from('membership')
      .select(
        'id, tenant_id, papel, permissoes_extras, flags_sensiveis, ' +
          'tenant:tenant_id (id, nome, logo_path, sidebar_bg_color, sidebar_text_color, moeda, locale, plano, status_assinatura, ' +
          'momento_baixa_estoque, criterio_rateio_custo_fixo, ' +
          'faturamento_mensal_esperado, cenarios_precificacao)',
      )
      .eq('usuario_id', s.user.id)
      .eq('ativo', true);
    if (!error && data) {
      setMemberships(data as unknown as MembershipInfo[]);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSession(data.session);
      await Promise.all([carregarMemberships(data.session), carregarIdioma(data.session)]);
      setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (evento, s) => {
      if (!ativo) return;
      setSession(s);
      if (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED' || evento === 'USER_UPDATED') {
        await Promise.all([carregarMemberships(s), carregarIdioma(s)]);
      }
      if (evento === 'SIGNED_OUT') setMemberships([]);
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, [carregarMemberships, carregarIdioma]);

  const definirIdioma = useCallback(async (novo: Idioma) => {
    await i18n.changeLanguage(novo);
    setIdioma(novo);
    if (!session) return;
    const { data } = await supabase
      .from('usuario').select('preferencias').eq('id', session.user.id).single();
    await supabase.from('usuario')
      .update({ preferencias: { ...(data?.preferencias ?? {}), idioma: novo } })
      .eq('id', session.user.id);
  }, [session]);

  const ativa = useMemo(() => {
    if (memberships.length === 0) return null;
    const claim = tenantAtivoDoJwt(session);
    if (claim) return memberships.find((m) => m.tenant_id === claim) ?? null;
    // mesma regra do backend: única membership = ativa; várias = escolher
    return memberships.length === 1 ? memberships[0] : null;
  }, [memberships, session]);

  // moeda/locale seguem o idioma da pessoa (PT → R$, EN → US$)
  const formato = useMemo<FormatoTenant>(() => formatoDoIdioma(idioma), [idioma]);

  const pode = useCallback(
    (modulo: Modulo, acao: Acao = 'ver') =>
      temPermissao(ativa?.papel ?? null, modulo, acao, ativa?.permissoes_extras),
    [ativa],
  );

  const flag = useCallback(
    (f: Flag) => temFlag(ativa?.papel ?? null, f, ativa?.flags_sensiveis),
    [ativa],
  );

  const entrar = useCallback(async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return error ? error.message : null;
  }, []);

  const entrarComGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const cadastrar = useCallback(async (nome: string, email: string, senha: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome_exibicao: nome, termos_versao: VERSAO_TERMOS },
      },
    });
    return error ? error.message : null;
  }, []);

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const recarregar = useCallback(async () => {
    // renova o JWT (claims novas) e recarrega memberships
    const { data } = await supabase.auth.refreshSession();
    setSession(data.session);
    await carregarMemberships(data.session);
  }, [carregarMemberships]);

  const criarEmpresa = useCallback(
    async (nome: string) => {
      const { error } = await supabase.rpc('criar_tenant', { p_nome: nome });
      if (error) return error.message;
      await recarregar();
      return null;
    },
    [recarregar],
  );

  const trocarEmpresa = useCallback(
    async (tenantId: string) => {
      const { error } = await supabase.rpc('trocar_tenant', { p_tenant: tenantId });
      if (!error) await recarregar();
    },
    [recarregar],
  );

  const valor = useMemo<AuthContexto>(
    () => ({
      carregando,
      session,
      memberships,
      ativa,
      formato,
      idioma,
      definirIdioma,
      pode,
      flag,
      entrar,
      entrarComGoogle,
      cadastrar,
      sair,
      criarEmpresa,
      trocarEmpresa,
      recarregar,
    }),
    [carregando, session, memberships, ativa, formato, idioma, definirIdioma, pode, flag, entrar,
     entrarComGoogle, cadastrar, sair, criarEmpresa, trocarEmpresa, recarregar],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
