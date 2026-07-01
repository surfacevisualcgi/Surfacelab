/**
 * Design system mínimo Surface Labs.
 * Base branca · detalhes pretos · gradiente azul→roxo→rosa como acento.
 */
import {
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { deCentavos, moeda, paraCentavos } from '@/lib/formato';
import { useAuth } from '@/auth/AuthProvider';

// ---------- Botões ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'perigo' | 'fantasma' | 'acento';
};

export function Botao({ variante = 'primario', className = '', ...props }: BtnProps) {
  const estilos: Record<string, string> = {
    primario:
      'bg-ink text-white hover:opacity-85 disabled:opacity-40',
    acento:
      'grad-acento text-white hover:opacity-90 disabled:opacity-40',
    secundario:
      'bg-white text-ink border border-borda hover:bg-surface-2 disabled:opacity-40',
    perigo:
      'bg-white text-erro border border-erro/40 hover:bg-erro/5 disabled:opacity-40',
    fantasma: 'text-texto-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${estilos[variante]} ${className}`}
      {...props}
    />
  );
}

// ---------- Campos ----------
export function Campo({
  rotulo,
  children,
  dica,
  ajuda,
  className = '',
}: {
  rotulo: string;
  children: ReactNode;
  dica?: string;
  /** texto de ajuda em balão ao passar o mouse no "!" ao lado do rótulo */
  ajuda?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-texto-2">
        {rotulo}
        {ajuda && <Ajuda texto={ajuda} />}
      </span>
      {children}
      {dica && <span className="mt-1 block text-[11px] text-texto-2">{dica}</span>}
    </label>
  );
}

/** Ícone "!" com balão de ajuda no hover/foco. */
export function Ajuda({ texto }: { texto: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        tabIndex={0}
        role="img"
        aria-label={texto}
        className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-texto-2/20 text-[10px] font-bold leading-none text-texto-2"
      >
        !
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 hidden w-56 max-w-[min(14rem,70vw)] rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-normal leading-snug text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {texto}
      </span>
    </span>
  );
}

const inputCls =
  'w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm text-ink ' +
  'placeholder:text-texto-2/60 focus:border-brand-azul focus:outline-none focus:ring-2 focus:ring-brand-azul/20';

export function Entrada(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Selecao(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

/**
 * Campo de texto com sugestões (combobox): aceita digitar livremente E mostra
 * uma lista filtrada ancorada logo abaixo do campo. Substitui o <datalist>
 * nativo, cujo popup posiciona errado em alguns navegadores/webviews.
 */
export function EntradaSugestao({
  value, onChange, opcoes, name, placeholder, required, acaoAdicionar,
}: {
  value: string;
  onChange: (v: string) => void;
  opcoes: string[];
  name?: string;
  placeholder?: string;
  required?: boolean;
  acaoAdicionar?: {
    rotulo: string;
    onAdicionar: (valor: string) => void;
  };
}) {
  const [aberto, setAberto] = useState(false);
  const alvo = (value ?? '').toLowerCase().trim();
  const filtradas = opcoes
    .filter((o) => o.toLowerCase().includes(alvo))
    .slice(0, 8);
  const podeAdicionar = !!acaoAdicionar && !!alvo && !opcoes.some((o) => o.toLowerCase() === alvo);

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 120)}
        className={inputCls}
      />
      {aberto && (filtradas.length > 0 || podeAdicionar) && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-lg border border-borda bg-white py-1 shadow-lg">
          {filtradas.map((o) => (
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(o); setAberto(false); }}
                className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-surface-2"
              >
                {o}
              </button>
            </li>
          ))}
          {podeAdicionar && (
            <li className={filtradas.length > 0 ? 'border-t border-borda' : ''}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  acaoAdicionar.onAdicionar(value.trim());
                  setAberto(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-brand-roxo hover:bg-brand-roxo/5"
              >
                + {acaoAdicionar.rotulo}: {value.trim()}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Campo de dinheiro estilo app de banco: o usuário só digita dígitos e o valor
 * vai se montando da direita pra esquerda já formatado na moeda do idioma
 * (R$ / US$), com os separadores certos. Trabalha sempre em centavos.
 *
 * Três modos de uso:
 *  • Formulário (FormData):   <EntradaDinheiro name="preco" defaultCentavos={x} />
 *      → injeta um <input hidden name=...> com o valor editável ("62,12"), então
 *        os submits que já usam paraCentavos(f.get('preco')) seguem funcionando.
 *  • Controlado por string:   <EntradaDinheiro value={s} onChange={e=>setS(e.target.value)} />
 *      → drop-in dos campos com total ao vivo (devolve a string "62,12").
 *  • Controlado por centavos: <EntradaDinheiro centavos={c} onCentavos={setC} />
 */
type EntradaDinheiroProps = {
  name?: string;
  defaultCentavos?: number;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  centavos?: number;
  onCentavos?: (c: number) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
};

export function EntradaDinheiro({
  name, defaultCentavos = 0, value, onChange, centavos, onCentavos,
  placeholder, required, className, disabled,
}: EntradaDinheiroProps) {
  const { formato } = useAuth();
  const [interno, setInterno] = useState(defaultCentavos);

  // centavos atuais conforme o modo
  const cents = centavos != null
    ? centavos
    : value != null
      ? paraCentavos(value)
      : interno;

  function aoDigitar(e: ChangeEvent<HTMLInputElement>) {
    const digitos = e.target.value.replace(/\D/g, '');
    const novo = digitos ? parseInt(digitos, 10) : 0;
    if (onCentavos) onCentavos(novo);
    if (onChange) onChange({ target: { value: deCentavos(novo) } });
    if (centavos == null && value == null) setInterno(novo);
  }

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        value={moeda(cents, formato)}
        onChange={aoDigitar}
        placeholder={placeholder}
        disabled={disabled}
        className={`${inputCls} text-right tabular-nums ${className ?? ''}`}
      />
      {name && <input type="hidden" name={name} value={deCentavos(cents)} required={required} />}
    </>
  );
}

// ---------- Valores ----------
export function Dinheiro({ centavos, className = '' }: { centavos: number | null | undefined; className?: string }) {
  const { formato } = useAuth();
  return <span className={`tabular-nums ${className}`}>{moeda(centavos, formato)}</span>;
}

// ---------- Badges ----------
export function Etiqueta({
  cor = 'cinza',
  children,
}: {
  cor?: 'cinza' | 'verde' | 'amarelo' | 'vermelho' | 'azul' | 'roxo';
  children: ReactNode;
}) {
  const cores: Record<string, string> = {
    cinza: 'bg-surface-2 text-texto-2',
    verde: 'bg-ok/10 text-ok',
    amarelo: 'bg-alerta/10 text-alerta',
    vermelho: 'bg-erro/10 text-erro',
    azul: 'bg-brand-azul/10 text-brand-azul',
    roxo: 'bg-brand-roxo/10 text-brand-roxo',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cores[cor]}`}>
      {children}
    </span>
  );
}

// ---------- Cartão / cabeçalho ----------
export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-borda bg-white p-4 ${className}`}>{children}</div>
  );
}

export function CabecalhoPagina({
  titulo,
  subtitulo,
  acoes,
}: {
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-ink">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-sm text-texto-2">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex items-center gap-2">{acoes}</div>}
    </div>
  );
}

// ---------- Estados ----------
export function Carregando() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-texto-2">
      <span className="size-4 animate-spin rounded-full border-2 border-borda border-t-brand-azul" />
      {t('estados.carregando')}
    </div>
  );
}

export function EstadoVazio({ mensagem, acao }: { mensagem?: string; acao?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-borda py-14 text-center">
      <div className="size-10 rounded-full grad-acento opacity-20" />
      <p className="text-sm text-texto-2">{mensagem ?? t('estados.vazio')}</p>
      {acao}
    </div>
  );
}

export function EstadoErro({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-erro/30 bg-erro/5 py-10 text-center">
      <p className="text-sm font-semibold text-erro">{t('estados.erro')}</p>
      <p className="text-xs text-texto-2">{t('estados.erroDetalhe')}</p>
      {onRetry && (
        <Botao variante="secundario" onClick={onRetry}>
          {t('acoes.tentarNovamente')}
        </Botao>
      )}
    </div>
  );
}

// ---------- Modal ----------
export function Modal({
  aberto,
  titulo,
  onFechar,
  children,
  largura = 'max-w-lg',
}: {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  largura?: string;
}) {
  if (!aberto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${largura}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{titulo}</h2>
          <button
            onClick={onFechar}
            className="rounded-md p-1 text-texto-2 hover:bg-surface-2 hover:text-ink"
            aria-label="Fechar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Tabela ----------
export function Tabela({ cabecalhos, children }: { cabecalhos: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-borda bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-borda bg-surface-2/60 text-left">
            {cabecalhos.map((c, i) => (
              <th key={i} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-texto-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda/70">{children}</tbody>
      </table>
    </div>
  );
}

// ---------- Abas (padrão v2: telas pesadas organizadas em abas) ----------
export function Abas<T extends string>({
  abas,
  ativa,
  onTrocar,
}: {
  abas: { id: T; rotulo: ReactNode }[];
  ativa: T;
  onTrocar: (id: T) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-borda" role="tablist">
      {abas.map((a) => (
        <button
          key={a.id}
          role="tab"
          aria-selected={ativa === a.id}
          onClick={() => onTrocar(a.id)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
            ativa === a.id
              ? 'border-brand-roxo text-ink'
              : 'border-transparent text-texto-2 hover:text-ink'
          }`}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}

// ---------- Acordeão (fórmulas, observações, alertas — recolhidos) ----------
export function Acordeao({
  titulo,
  children,
  abertoInicial = false,
}: {
  titulo: ReactNode;
  children: ReactNode;
  abertoInicial?: boolean;
}) {
  return (
    <details className="group rounded-xl border border-borda bg-white" open={abertoInicial}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        {titulo}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" className="text-texto-2 transition-transform group-open:rotate-180">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-borda/70 px-4 py-3">{children}</div>
    </details>
  );
}

// ---------- KPI (máx. 4 por tela; rótulo + número grande + variação) ----------
export function Kpi({
  rotulo,
  children,
  variacao,
  destaque = false,
}: {
  rotulo: string;
  children: ReactNode;
  /** fração: 0.18 = ▲18% vs período anterior; negativo = ▼ */
  variacao?: number | null;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border border-borda bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-texto-2">{rotulo}</p>
      <p className={`mt-1 text-xl font-extrabold tabular-nums ${destaque ? 'grad-texto' : 'text-ink'}`}>
        {children}
      </p>
      {variacao != null && Number.isFinite(variacao) && (
        <p className={`mt-0.5 text-[11px] font-semibold ${variacao >= 0 ? 'text-ok' : 'text-erro'}`}>
          {variacao >= 0 ? '▲' : '▼'} {Math.abs(variacao * 100).toFixed(0)}%
          <span className="ml-1 font-normal text-texto-2">vs. mês anterior</span>
        </p>
      )}
    </div>
  );
}

// ---------- Barra de progresso ----------
export function BarraProgresso({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-surface-2 ${className}`}
      role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full grad-acento transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

// ---------- Tabela responsiva: tabela no desktop, cards no mobile (v2) ----------
export interface ColunaDados<T> {
  titulo: string;
  render: (linha: T) => ReactNode;
  /** coluna principal — vira o título do card no mobile */
  principal?: boolean;
  /** alinhar à direita (números) */
  numerica?: boolean;
}

export function TabelaDados<T>({
  colunas,
  linhas,
  chave,
  acoes,
}: {
  colunas: ColunaDados<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  acoes?: (linha: T) => ReactNode;
}) {
  const principal = colunas.find((c) => c.principal) ?? colunas[0];
  const secundarias = colunas.filter((c) => c !== principal);
  return (
    <>
      {/* desktop: tabela (≤6 colunas, linhas ≥44px, status em chip) */}
      <div className="hidden overflow-x-auto rounded-xl border border-borda bg-white sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borda bg-surface-2/60 text-left">
              {colunas.map((c, i) => (
                <th key={i} className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-texto-2 ${c.numerica ? 'text-right' : ''}`}>
                  {c.titulo}
                </th>
              ))}
              {acoes && <th className="px-3 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda/70">
            {linhas.map((l) => (
              <tr key={chave(l)} className="hover:bg-surface-2/50">
                {colunas.map((c, i) => (
                  <td key={i} className={`px-3 py-2.5 ${c.numerica ? 'text-right tabular-nums' : ''}`}>
                    {c.render(l)}
                  </td>
                ))}
                {acoes && <td className="px-3 py-2.5 text-right whitespace-nowrap">{acoes(l)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* mobile: cada linha vira um card (sem rolagem horizontal) */}
      <div className="space-y-2 sm:hidden">
        {linhas.map((l) => (
          <div key={chave(l)} className="rounded-xl border border-borda bg-white p-3">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <div className="text-sm font-semibold text-ink">{principal.render(l)}</div>
              {acoes && <div className="shrink-0">{acoes(l)}</div>}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              {secundarias.map((c, i) => (
                <div key={i} className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase text-texto-2">{c.titulo}</dt>
                  <dd className="truncate text-xs text-ink">{c.render(l)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- Logo ----------
export function Logo({ claro = false, tamanho = 28 }: { claro?: boolean; tamanho?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src="/brand/spirograph.svg" width={tamanho} height={tamanho} alt="" />
      <span className={`text-sm tracking-wide ${claro ? 'text-current' : 'text-ink'}`}>
        <span className="font-extrabold">SURFACE</span>{' '}
        <span className="font-light italic">LABS</span>
      </span>
    </span>
  );
}
