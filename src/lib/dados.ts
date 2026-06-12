/**
 * Helpers de dados: TanStack Query + Supabase com o padrão do projeto —
 * leitura nas views mascaradas quando existem (v_*), escrita nas tabelas base.
 * O tenant_id é resolvido pela RLS; o insert envia o tenant ativo explícito
 * (a política confere que bate com o claim — nunca confia só no payload).
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '@/auth/AuthProvider';

export interface OpcoesLista {
  ordem?: string;
  desc?: boolean;
  filtro?: (q: ReturnType<ReturnType<typeof supabase.from>['select']>) => unknown;
  incluirExcluidos?: boolean;
  selecao?: string;
}

/** Lista linhas de uma tabela/view do tenant ativo */
export function useLista<T = Record<string, unknown>>(
  tabela: string,
  opcoes: OpcoesLista = {},
): UseQueryResult<T[]> {
  const { ativa } = useAuth();
  return useQuery({
    queryKey: [tabela, ativa?.tenant_id, opcoes.ordem, opcoes.selecao],
    enabled: !!ativa,
    queryFn: async () => {
      let q = supabase.from(tabela).select(opcoes.selecao ?? '*');
      if (!opcoes.incluirExcluidos) q = q.is('deleted_at', null);
      q = q.order(opcoes.ordem ?? 'created_at', { ascending: !opcoes.desc });
      const { data, error } = await q;
      if (error) throw error;
      return data as T[];
    },
  });
}

/** Mutations de CRUD numa tabela base; invalida a tabela e a view v_<tabela> */
export function useCrud(tabela: string, invalidarTambem: string[] = []) {
  const qc = useQueryClient();
  const { ativa } = useAuth();

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: [tabela] });
    qc.invalidateQueries({ queryKey: [`v_${tabela}`] });
    for (const extra of invalidarTambem) qc.invalidateQueries({ queryKey: [extra] });
  };

  const criar = useMutation({
    mutationFn: async (valores: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from(tabela)
        .insert({ ...valores, tenant_id: ativa?.tenant_id })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: invalidar,
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, ...valores }: { id: string } & Record<string, unknown>) => {
      const { error } = await supabase.from(tabela).update(valores).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  // soft-delete padrão (lixeira); ledger e snapshots têm regras próprias
  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(tabela)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { criar, atualizar, excluir, invalidar };
}

/** Mensagem de erro amigável (limite de plano, permissão, RLS) */
export function mensagemErro(e: unknown): string {
  // erros do Supabase/PostgREST são objetos planos { message, code, ... }
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === 'object' && e !== null && 'message' in e
        ? String((e as { message: unknown }).message)
        : String(e);
  if (msg.includes('row-level security') || msg.includes('violates row-level'))
    return 'Sem permissão para esta ação — ou o limite do seu plano foi atingido.';
  if (msg.includes('limite')) return msg;
  return msg;
}
