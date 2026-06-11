/**
 * Minha Conta (§2.17) — da PESSOA, vale em todas as empresas: perfil,
 * segurança (trocar senha) e empresas (memberships).
 */
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { mensagemErro } from '@/lib/dados';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Cartao, Entrada, Etiqueta,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

export function PaginaConta() {
  const { t } = useTranslation();
  const { session, memberships, ativa, trocarEmpresa } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const perfil = useQuery({
    queryKey: ['usuario', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuario').select('*').eq('id', session!.user.id).single();
      if (error) throw error;
      return data as { nome_exibicao: string | null; telefone: string | null; email: string };
    },
  });

  async function salvarPerfil(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from('usuario').update({
      nome_exibicao: f.get('nome_exibicao') as string,
      telefone: (f.get('telefone') as string) || null,
    }).eq('id', session!.user.id);
    if (error) setErro(mensagemErro(error));
    else { setMsg(t('estados.salvo')); setTimeout(() => setMsg(null), 2000); }
  }

  async function trocarSenha(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.auth.updateUser({ password: f.get('nova_senha') as string });
    if (error) setErro(mensagemErro(error));
    else { setMsg(t('estados.salvo')); setTimeout(() => setMsg(null), 2000); }
  }

  if (perfil.isLoading) return <Carregando />;

  return (
    <div>
      <CabecalhoPagina titulo={t('conta.titulo')} subtitulo={perfil.data?.email} />
      {msg && <p className="mb-3 text-xs font-semibold text-ok">{msg}</p>}
      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao>
          <h2 className="mb-3 text-sm font-bold text-ink">{t('conta.perfil')}</h2>
          <form onSubmit={salvarPerfil} className="space-y-3">
            <Campo rotulo={t('conta.nomeExibicao')}>
              <Entrada name="nome_exibicao" required defaultValue={perfil.data?.nome_exibicao ?? ''} />
            </Campo>
            <Campo rotulo={t('conta.telefone')}>
              <Entrada name="telefone" defaultValue={perfil.data?.telefone ?? ''} />
            </Campo>
            <Botao type="submit">{t('acoes.salvar')}</Botao>
          </form>
        </Cartao>

        <div className="space-y-4">
          <Cartao>
            <h2 className="mb-3 text-sm font-bold text-ink">{t('conta.seguranca')}</h2>
            <form onSubmit={trocarSenha} className="space-y-3">
              <Campo rotulo={t('conta.novaSenha')}>
                <Entrada name="nova_senha" type="password" minLength={8} required autoComplete="new-password" />
              </Campo>
              <Botao type="submit" variante="secundario">{t('conta.trocarSenha')}</Botao>
            </form>
          </Cartao>

          <Cartao>
            <h2 className="mb-3 text-sm font-bold text-ink">{t('conta.empresas')}</h2>
            <div className="space-y-1.5">
              {memberships.map((m) => (
                <button
                  key={m.id}
                  onClick={() => m.tenant_id !== ativa?.tenant_id && trocarEmpresa(m.tenant_id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                    m.tenant_id === ativa?.tenant_id
                      ? 'border-brand-azul/40 bg-brand-azul/5 text-ink'
                      : 'border-borda text-texto-2 hover:border-brand-azul'
                  }`}
                >
                  {m.tenant.nome}
                  <Etiqueta cor={m.papel === 'dono' ? 'roxo' : 'cinza'}>
                    {t(`config.papelLabel.${m.papel}`)}
                  </Etiqueta>
                </button>
              ))}
            </div>
          </Cartao>
        </div>
      </div>
    </div>
  );
}
