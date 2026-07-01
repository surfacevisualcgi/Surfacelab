/**
 * Fotos no Supabase Storage — bucket PRIVADO `fotos` com RLS por tenant
 * (1ª pasta do path = tenant_id). Como o bucket é privado, a exibição usa
 * URLs ASSINADAS com cache via TanStack Query (TTL menor que a expiração).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '@/auth/AuthProvider';

const EXPIRACAO_S = 3600; // URL válida por 1h; cache de 50min

/** URL assinada de um path do bucket fotos (null enquanto resolve/sem path) */
export function useFotoQuery(path: string | null | undefined) {
  return useQuery({
    queryKey: ['foto-url', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('fotos')
        .createSignedUrl(path!, EXPIRACAO_S);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** URL assinada de um path do bucket fotos (null enquanto resolve/sem path) */
export function useFotoUrl(path: string | null | undefined): string | null {
  const { data } = useFotoQuery(path);
  return data ?? null;
}

/** Envia um arquivo para `fotos/{tenantId}/{prefixo}/{uuid}.{ext}` e devolve o path */
export async function enviarFoto(
  tenantId: string,
  prefixo: string,
  arquivo: File,
): Promise<string> {
  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${tenantId}/${prefixo}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('fotos').upload(path, arquivo, {
    contentType: arquivo.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Envia um arquivo QUALQUER (G-code, PDF…) ao bucket indicado, com RLS */
export async function enviarArquivo(
  tenantId: string,
  prefixo: string,
  arquivo: File,
  bucket = 'fotos',
): Promise<string> {
  const nomeLimpo = arquivo.name.replace(/[^\w.\-]+/g, '_');
  const path = `${tenantId}/${prefixo}/${crypto.randomUUID().slice(0, 8)}-${nomeLimpo}`;
  const { error } = await supabase.storage.from(bucket).upload(path, arquivo, {
    contentType: arquivo.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** URL assinada sob demanda (downloads fora do cache de imagem) */
export async function urlAssinada(path: string, bucket = 'fotos'): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, EXPIRACAO_S);
  if (error) throw error;
  return data.signedUrl;
}

/** Remove um arquivo do Storage (ignora erro de já-removido) */
export async function removerFoto(path: string): Promise<void> {
  await supabase.storage.from('fotos').remove([path]);
}

/** Hook de conveniência: tenant atual para montar prefixos */
export function useTenantId(): string | null {
  const { ativa } = useAuth();
  return ativa?.tenant_id ?? null;
}
