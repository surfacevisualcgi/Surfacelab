/**
 * Formatação sensível ao tenant (moeda/locale nunca hardcoded).
 * O TenantProvider injeta moeda/locale; estes helpers recebem como parâmetro.
 */

export interface FormatoTenant {
  moeda: string; // ex.: BRL
  locale: string; // ex.: pt-BR
}

export const FORMATO_PADRAO: FormatoTenant = { moeda: 'BRL', locale: 'pt-BR' };

/**
 * Moeda/locale a partir do idioma da pessoa: Português → R$ (BRL, pt-BR),
 * Inglês → US$ (USD, en-US). Os valores são guardados em centavos e NÃO são
 * convertidos por câmbio — só muda o símbolo e a formatação dos separadores.
 */
export function formatoDoIdioma(idioma: string): FormatoTenant {
  if (idioma === 'en') return { moeda: 'USD', locale: 'en-US' };
  return { moeda: 'BRL', locale: 'pt-BR' };
}

/** centavos (inteiro) → string localizada. 60402 → "R$ 604,02" */
export function moeda(centavos: number | null | undefined, f: FormatoTenant = FORMATO_PADRAO): string {
  if (centavos == null) return '•••'; // valor mascarado (sem permissão)
  return new Intl.NumberFormat(f.locale, {
    style: 'currency',
    currency: f.moeda,
  }).format(centavos / 100);
}

/** fração 0–1 → "35%" */
export function percentual(fracao: number | null | undefined, f: FormatoTenant = FORMATO_PADRAO): string {
  if (fracao == null) return '•••';
  return new Intl.NumberFormat(f.locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(fracao);
}

export function dataCurta(iso: string | null | undefined, f: FormatoTenant = FORMATO_PADRAO): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(f.locale, { dateStyle: 'short' }).format(new Date(iso));
}

/** reais digitados pelo usuário ("12,50") → centavos inteiros */
export function paraCentavos(texto: string | number): number {
  if (typeof texto === 'number') return Math.round(texto * 100);
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** centavos → string editável simples ("12,50") */
export function deCentavos(centavos: number): string {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

/** minutos → "6h45" */
export function duracao(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
