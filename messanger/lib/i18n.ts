export const locales = ['en', 'ru', 'es', 'zh-CN', 'ja'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export function isLocale(value: string | undefined): value is Locale {
  return !!value && locales.includes(value as Locale);
}

export function resolveLocaleParam(value: string | string[] | undefined): Locale | null {
  const first = Array.isArray(value) ? value[0] : value;
  return isLocale(first) ? first : null;
}

export function localizedPath(locale: Locale, path: string) {
  if (path.startsWith('http')) return path;
  if (path.startsWith('#')) return `/${locale}${path}`;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/') return `/${locale}`;
  return `/${locale}${normalized}`;
}

export function createTranslator<T extends Record<string, unknown>>(
  locale: Locale,
  dictionary: Partial<Record<Locale, T>> & { en: T },
) {
  const entries = dictionary[locale] ?? dictionary.en;
  return <K extends keyof T>(key: K) => entries[key];
}
