/**
 * Telas de autenticação e onboarding: login, cadastro (com aceite de termos
 * versionado), criação de empresa, seleção de empresa e aceite de convite.
 */
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from './AuthProvider';
import { supabase } from '@/lib/supabase';
import { Botao, Campo, Cartao, Entrada, Logo } from '@/components/ui';

function MolduraAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-2 p-4">
      <div className="mb-6">
        <Logo tamanho={36} />
      </div>
      <Cartao className="w-full max-w-sm p-6">{children}</Cartao>
      <div className="mt-4 h-1 w-24 rounded-full grad-acento opacity-60" />
    </div>
  );
}

export function PaginaLogin() {
  const { t } = useTranslation();
  const { entrar, entrarComGoogle, session } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const msg = await entrar(email, senha);
    if (msg) setErro(t('auth.erroLogin'));
    setEnviando(false);
  }

  return (
    <MolduraAuth>
      <h1 className="mb-4 text-lg font-extrabold text-ink">{t('auth.entrar')}</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <Campo rotulo={t('auth.email')}>
          <Entrada type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Campo>
        <Campo rotulo={t('auth.senha')}>
          <Entrada type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
        </Campo>
        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <Botao type="submit" disabled={enviando} className="w-full">
          {t('auth.entrar')}
        </Botao>
      </form>
      <div className="my-3 flex items-center gap-2 text-[11px] text-texto-2">
        <span className="h-px flex-1 bg-borda" />
        {t('auth.ou')}
        <span className="h-px flex-1 bg-borda" />
      </div>
      <Botao variante="secundario" className="w-full" onClick={entrarComGoogle}>
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"/></svg>
        {t('auth.entrarComGoogle')}
      </Botao>
      <Link to="/cadastro" className="mt-4 block text-center text-xs font-semibold text-brand-azul hover:underline">
        {t('auth.naoTemConta')}
      </Link>
    </MolduraAuth>
  );
}

export function PaginaCadastro() {
  const { t } = useTranslation();
  const { cadastrar, session } = useAuth();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha !== senha2) {
      setErro(t('auth.senhasDiferentes'));
      return;
    }
    if (!aceite) {
      setErro(t('auth.aceiteObrigatorio'));
      return;
    }
    setEnviando(true);
    const msg = await cadastrar(nome, email, senha);
    if (msg) setErro(msg);
    else setConfirmar(true);
    setEnviando(false);
  }

  if (confirmar) {
    return (
      <MolduraAuth>
        <p className="text-sm text-texto">{t('auth.confirmeEmail')}</p>
        <Link to="/login" className="mt-4 block text-center text-xs font-semibold text-brand-azul hover:underline">
          {t('auth.jaTemConta')}
        </Link>
      </MolduraAuth>
    );
  }

  return (
    <MolduraAuth>
      <h1 className="mb-4 text-lg font-extrabold text-ink">{t('auth.criarConta')}</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <Campo rotulo={t('auth.nome')}>
          <Entrada required value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
        </Campo>
        <Campo rotulo={t('auth.email')}>
          <Entrada type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Campo>
        <Campo rotulo={t('auth.senha')}>
          <Entrada type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
        </Campo>
        <Campo rotulo={t('auth.confirmarSenha')}>
          <Entrada type="password" required minLength={8} value={senha2} onChange={(e) => setSenha2(e.target.value)} autoComplete="new-password" />
        </Campo>
        <label className="flex items-start gap-2 text-xs text-texto-2">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-0.5 accent-brand-azul"
          />
          <span>
            <Trans
              i18nKey="auth.aceiteTermos"
              components={{
                termos: <a href="/termos" target="_blank" className="font-semibold text-brand-azul hover:underline" />,
                privacidade: <a href="/privacidade" target="_blank" className="font-semibold text-brand-azul hover:underline" />,
              }}
            />
          </span>
        </label>
        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <Botao type="submit" disabled={enviando} className="w-full">
          {t('auth.criarConta')}
        </Botao>
      </form>
      <Link to="/login" className="mt-4 block text-center text-xs font-semibold text-brand-azul hover:underline">
        {t('auth.jaTemConta')}
      </Link>
    </MolduraAuth>
  );
}

/** Sem empresa: cria a primeira (vira Dono) ou escolhe entre as existentes */
export function PaginaEmpresa() {
  const { t } = useTranslation();
  const { memberships, criarEmpresa, trocarEmpresa, sair } = useAuth();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();

  async function criar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const msg = await criarEmpresa(nome);
    if (msg) setErro(msg);
    else navigate('/', { replace: true });
    setEnviando(false);
  }

  return (
    <MolduraAuth>
      {memberships.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-ink">{t('empresa.selecionar')}</h2>
          <div className="space-y-1.5">
            {memberships.map((m) => (
              <button
                key={m.id}
                onClick={async () => {
                  await trocarEmpresa(m.tenant_id);
                  navigate('/', { replace: true });
                }}
                className="flex w-full items-center justify-between rounded-lg border border-borda px-3 py-2.5 text-left text-sm font-semibold text-ink hover:border-brand-azul hover:bg-brand-azul/5"
              >
                {m.tenant.nome}
                <span className="text-[11px] font-normal text-texto-2">
                  {t(`config.papelLabel.${m.papel}`)}
                </span>
              </button>
            ))}
          </div>
          <div className="my-4 h-px bg-borda" />
        </div>
      )}
      <h1 className="mb-1 text-lg font-extrabold text-ink">
        {memberships.length > 0 ? t('empresa.criarNova') : t('onboarding.titulo')}
      </h1>
      <p className="mb-4 text-xs text-texto-2">{t('onboarding.subtitulo')}</p>
      <form onSubmit={criar} className="space-y-3">
        <Campo rotulo={t('onboarding.nomeEmpresa')}>
          <Entrada required value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <Botao type="submit" variante="acento" disabled={enviando} className="w-full">
          {t('onboarding.criarEmpresa')}
        </Botao>
        <p className="text-center text-[11px] text-texto-2">{t('onboarding.trial')}</p>
      </form>
      <button onClick={sair} className="mt-4 block w-full text-center text-xs text-texto-2 hover:text-ink">
        {t('nav.sair')}
      </button>
    </MolduraAuth>
  );
}

/** /convite/:token — aceita convite e entra na empresa */
export function PaginaConvite() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const { session, recarregar } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const navigate = useNavigate();

  if (!session) {
    // guarda o destino e manda logar/cadastrar primeiro
    sessionStorage.setItem('convite_token', token ?? '');
    return <Navigate to="/login" replace />;
  }

  async function aceitar() {
    const { error } = await supabase.rpc('aceitar_convite', { p_token: token });
    if (error) setErro(error.message);
    else {
      setOk(true);
      await recarregar();
      navigate('/', { replace: true });
    }
  }

  return (
    <MolduraAuth>
      <h1 className="mb-2 text-lg font-extrabold text-ink">{t('empresa.convitePendente')}</h1>
      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}
      {!ok && (
        <Botao variante="acento" className="w-full" onClick={aceitar}>
          {t('empresa.aceitarConvite')}
        </Botao>
      )}
    </MolduraAuth>
  );
}
