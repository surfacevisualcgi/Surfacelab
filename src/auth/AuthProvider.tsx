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
import { FORMATO_PADRAO, type FormatoTenant } from '@/lib/formato';
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

  const carregarMemberships = useCallback(async (s: Session | null) => {
    if (!s) {
      setMemberships([]);
      return;
    }
    const { data, error } = await supabase
      .from('membership')
      .select(
        'id, tenant_id, papel, permissoes_extras, flags_sensiveis, ' +
          'tenant:tenant_id (id, nome, moeda, locale, plano, status_assinatura, ' +
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
      await carregarMemberships(data.session);
      setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (evento, s) => {
      if (!ativo) return;
      setSession(s);
      if (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED' || evento === 'USER_UPDATED') {
        await carregarMemberships(s);
      }
      if (evento === 'SIGNED_OUT') setMemberships([]);
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, [carregarMemberships]);

  const ativa = useMemo(() => {
    if (memberships.length === 0) return null;
    const claim = tenantAtivoDoJwt(session);
    if (claim) return memberships.find((m) => m.tenant_id === claim) ?? null;
    // mesma regra do backend: única membership = ativa; várias = escolher
    return memberships.length === 1 ? memberships[0] : null;
  }, [memberships, session]);

  const formato = useMemo<FormatoTenant>(
    () =>
      ativa
        ? { moeda: ativa.tenant.moeda, locale: ativa.tenant.locale }
        : FORMATO_PADRAO,
    [ativa],
  );

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
    [carregando, session, memberships, ativa, formato, pode, flag, entrar,
     entrarComGoogle, cadastrar, sair, criarEmpresa, trocarEmpresa, recarregar],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
