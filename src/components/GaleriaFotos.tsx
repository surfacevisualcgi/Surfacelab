/**
 * Galeria de fotos (Modelo 3D e Produto): foto PRINCIPAL em destaque +
 * miniaturas, com adicionar (upload real ao Storage), remover e definir
 * principal (1ª posição do array). Estrutura da ficha v2.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { enviarFoto, removerFoto, useFotoUrl, useTenantId } from '@/lib/fotos';
import { mensagemErro } from '@/lib/dados';

export function Foto({ path, alt = '', className = '' }: {
  path: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  const url = useFotoUrl(path);
  if (!path) return null;
  if (!url) return <div className={`animate-pulse bg-surface-2 ${className}`} />;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}

/** Placeholder com o cubo da marca quando não há foto */
export function FotoOuPlaceholder({ path, alt = '', className = '' }: {
  path: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  const url = useFotoUrl(path);
  if (path && url) return <img src={url} alt={alt} className={className} loading="lazy" />;
  if (path && !url) return <div className={`animate-pulse bg-surface-2 ${className}`} />;
  return (
    <div className={`flex items-center justify-center bg-surface-2 ${className}`}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="url(#fop-g)" strokeWidth="1.2" className="opacity-50">
        <defs>
          <linearGradient id="fop-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#29c2f2" /><stop offset="1" stopColor="#8a3fd1" />
          </linearGradient>
        </defs>
        <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3L18.6 8 12 11.7 5.4 8 12 4.3ZM5 9.7l6 3.4v6.6l-6-3.4V9.7Zm8 10v-6.6l6-3.4v6.6l-6 3.4Z" />
      </svg>
    </div>
  );
}

export function GaleriaFotos({ fotos, prefixo, podeEditar, onChange }: {
  fotos: string[];
  /** subpasta dentro do tenant, ex.: `modelos/${id}` */
  prefixo: string;
  podeEditar: boolean;
  onChange: (fotos: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const tenantId = useTenantId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const principal = fotos[0] ?? null;

  async function adicionar(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0 || !tenantId) return;
    setEnviando(true);
    setErro(null);
    try {
      const novos: string[] = [];
      for (const arquivo of Array.from(arquivos)) {
        if (!arquivo.type.startsWith('image/')) continue;
        if (arquivo.size > 8 * 1024 * 1024) {
          throw new Error(t('fotos.grandeDemais'));
        }
        novos.push(await enviarFoto(tenantId, prefixo, arquivo));
      }
      if (novos.length > 0) await onChange([...fotos, ...novos]);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remover(path: string) {
    setErro(null);
    try {
      await onChange(fotos.filter((f) => f !== path));
      await removerFoto(path);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function definirPrincipal(path: string) {
    setErro(null);
    try {
      await onChange([path, ...fotos.filter((f) => f !== path)]);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <div>
      {/* principal em destaque */}
      <div className="overflow-hidden rounded-xl border border-borda">
        <FotoOuPlaceholder path={principal} alt="" className="aspect-square w-full object-cover" />
      </div>

      {/* miniaturas + adicionar */}
      <div className="mt-2 flex flex-wrap gap-2">
        {fotos.map((path, i) => (
          <div key={path} className="group relative">
            <button
              type="button"
              onClick={() => podeEditar && i !== 0 && definirPrincipal(path)}
              title={i === 0 ? t('fotos.principal') : t('fotos.definirPrincipal')}
              className={`block size-14 overflow-hidden rounded-lg border-2 ${
                i === 0 ? 'border-brand-roxo' : 'border-borda hover:border-brand-azul'
              }`}
            >
              <Foto path={path} className="size-full object-cover" />
            </button>
            {i === 0 && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full grad-acento px-1.5 text-[8px] font-bold text-white">
                ★
              </span>
            )}
            {podeEditar && (
              <button
                type="button"
                onClick={() => remover(path)}
                aria-label={t('acoes.excluir')}
                className="absolute -right-1.5 -top-1.5 hidden size-4.5 items-center justify-center rounded-full bg-erro text-[10px] font-bold text-white group-hover:flex"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {podeEditar && (
          <button
            type="button"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
            className="flex size-14 items-center justify-center rounded-lg border-2 border-dashed border-borda text-lg text-texto-2 hover:border-brand-azul hover:text-brand-azul disabled:opacity-50"
            aria-label={t('fotos.adicionar')}
          >
            {enviando ? (
              <span className="size-4 animate-spin rounded-full border-2 border-borda border-t-brand-azul" />
            ) : (
              '+'
            )}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => adicionar(e.target.files)}
        />
      </div>
      {erro && <p className="mt-1.5 text-xs font-semibold text-erro">{erro}</p>}
    </div>
  );
}
