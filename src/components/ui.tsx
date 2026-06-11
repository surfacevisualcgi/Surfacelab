/**
 * Design system mínimo Surface Labs.
 * Base branca · detalhes pretos · gradiente azul→roxo→rosa como acento.
 */
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { moeda } from '@/lib/formato';
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
  className = '',
}: {
  rotulo: string;
  children: ReactNode;
  dica?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-texto-2">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-[11px] text-texto-2">{dica}</span>}
    </label>
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
      <span className={`text-sm tracking-wide ${claro ? 'text-white' : 'text-ink'}`}>
        <span className="font-extrabold">SURFACE</span>{' '}
        <span className="font-light italic">LABS</span>
      </span>
    </span>
  );
}
