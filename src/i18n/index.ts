import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ptBR from './pt-BR.json';

/** Idiomas suportados. Inglês é o padrão; novos bundles entram aqui. */
export const IDIOMAS = ['en', 'pt-BR'] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const IDIOMA_PADRAO: Idioma = 'en';

/**
 * Resolve um código de idioma/locale qualquer (ex.: 'pt', 'pt-BR', 'en-US')
 * para um dos idiomas suportados. Usado para o padrão por país: contas novas
 * já veem o idioma do navegador quando suportado, senão caem no inglês.
 */
export function resolverIdioma(codigo: string | null | undefined): Idioma {
  if (!codigo) return IDIOMA_PADRAO;
  const c = codigo.toLowerCase();
  if (c === 'pt-br' || c.startsWith('pt')) return 'pt-BR';
  if (c.startsWith('en')) return 'en';
  return IDIOMA_PADRAO;
}

/** Idioma sugerido para uma conta nova, a partir do navegador. */
export function idiomaDoNavegador(): Idioma {
  const langs =
    typeof navigator !== 'undefined'
      ? [navigator.language, ...(navigator.languages ?? [])]
      : [];
  for (const l of langs) {
    const r = resolverIdioma(l);
    if (l && (r === 'pt-BR' || r === 'en')) return r;
  }
  return IDIOMA_PADRAO;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'pt-BR': { translation: ptBR },
  },
  lng: IDIOMA_PADRAO,
  fallbackLng: IDIOMA_PADRAO,
  supportedLngs: IDIOMAS as unknown as string[],
  interpolation: { escapeValue: false },
});

export default i18n;
