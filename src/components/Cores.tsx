/**
 * Cores do catálogo: swatches (bolinhas de cor com nome) e editor de
 * "cores disponíveis" do Modelo 3D — cada cor tem nome + hex + foto opcional
 * (a peça impressa naquela cor).
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { enviarFoto, useTenantId } from '@/lib/fotos';
import { mensagemErro } from '@/lib/dados';
import { Botao, Entrada } from '@/components/ui';
import { Foto } from '@/components/GaleriaFotos';

export interface CorDisponivel {
  nome: string;
  hex: string;
  foto?: string;
}

/** Bolinha de cor acessível (título com o nome; borda para cores claras) */
export function Swatch({ hex, nome, tamanho = 'size-4' }: {
  hex: string;
  nome?: string;
  tamanho?: string;
}) {
  return (
    <span
      title={nome}
      aria-label={nome}
      className={`inline-block shrink-0 rounded-full border border-ink/15 ${tamanho}`}
      style={{ background: hex }}
    />
  );
}

export function LinhaSwatches({ cores, max = 5 }: { cores: CorDisponivel[]; max?: number }) {
  if (!cores || cores.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {cores.slice(0, max).map((c, i) => (
        <Swatch key={i} hex={c.hex} nome={c.nome} tamanho="size-3.5" />
      ))}
      {cores.length > max && (
        <span className="text-[10px] font-semibold text-texto-2">+{cores.length - max}</span>
      )}
    </span>
  );
}

/** Editor das cores disponíveis (ficha do Modelo 3D) */
export function EditorCores({ cores, prefixo, podeEditar, onChange }: {
  cores: CorDisponivel[];
  prefixo: string; // ex.: `modelos/${id}/cores`
  podeEditar: boolean;
  onChange: (cores: CorDisponivel[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const tenantId = useTenantId();
  const [nome, setNome] = useState('');
  const [hex, setHex] = useState('#4b6ce0');
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoIdx, setEnviandoIdx] = useState<number | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const [idxFoto, setIdxFoto] = useState<number | null>(null);

  async function adicionar() {
    if (!nome.trim()) return;
    setErro(null);
    try {
      await onChange([...cores, { nome: nome.trim(), hex }]);
      setNome('');
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function remover(i: number) {
    setErro(null);
    try {
      await onChange(cores.filter((_, j) => j !== i));
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function anexarFoto(arquivos: FileList | null) {
    if (!arquivos?.[0] || idxFoto == null || !tenantId) return;
    setEnviandoIdx(idxFoto);
    setErro(null);
    try {
      const path = await enviarFoto(tenantId, prefixo, arquivos[0]);
      await onChange(cores.map((c, j) => (j === idxFoto ? { ...c, foto: path } : c)));
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviandoIdx(null);
      setIdxFoto(null);
      if (inputFotoRef.current) inputFotoRef.current.value = '';
    }
  }

  return (
    <div>
      {cores.length === 0 && (
        <p className="mb-2 text-xs text-texto-2">{t('cores.nenhuma')}</p>
      )}
      <ul className="space-y-1.5">
        {cores.map((c, i) => (
          <li key={i} className="flex items-center gap-2.5 rounded-lg border border-borda bg-white px-2.5 py-1.5">
            <Swatch hex={c.hex} nome={c.nome} tamanho="size-5" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{c.nome}</span>
            {c.foto ? (
              <Foto path={c.foto} alt={c.nome} className="size-8 rounded-md object-cover" />
            ) : podeEditar ? (
              <button
                type="button"
                disabled={enviandoIdx === i}
                onClick={() => { setIdxFoto(i); inputFotoRef.current?.click(); }}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-brand-azul hover:bg-brand-azul/10 disabled:opacity-50"
              >
                {enviandoIdx === i ? '…' : `+ ${t('cores.foto')}`}
              </button>
            ) : null}
            {podeEditar && (
              <button type="button" onClick={() => remover(i)} aria-label={t('acoes.excluir')}
                className="text-texto-2 hover:text-erro">✕</button>
            )}
          </li>
        ))}
      </ul>

      {podeEditar && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            aria-label={t('cores.cor')}
            className="size-9 shrink-0 cursor-pointer rounded-lg border border-borda bg-white p-1"
          />
          <Entrada
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={t('cores.nomePlaceholder')}
            className="!py-1.5 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
          />
          <Botao type="button" variante="secundario" className="!px-2.5 !py-1.5" onClick={adicionar}>
            +
          </Botao>
        </div>
      )}
      {erro && <p className="mt-1.5 text-xs font-semibold text-erro">{erro}</p>}
      <input ref={inputFotoRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => anexarFoto(e.target.files)} />
    </div>
  );
}
