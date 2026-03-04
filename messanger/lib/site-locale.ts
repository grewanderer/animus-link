export const siteLocales = ['en', 'ru', 'es', 'zh-CN', 'ja'] as const;

export type SiteLocale = (typeof siteLocales)[number];

export const defaultSiteLocale: SiteLocale = 'en';
export const siteLocaleCookieName = 'site_locale';

const siteLocaleSet = new Set<SiteLocale>(siteLocales);

const siteLocaleAlias: Record<string, SiteLocale> = {
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  ru: 'ru',
  'ru-ru': 'ru',
  es: 'es',
  'es-es': 'es',
  'es-mx': 'es',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  ja: 'ja',
  'ja-jp': 'ja',
};

const siteLocaleLabels: Record<SiteLocale, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  'zh-CN': '简体中文',
  ja: '日本語',
};

export function getSiteLocaleLabel(locale: SiteLocale) {
  return siteLocaleLabels[locale];
}

export function isSiteLocale(value: string | undefined): value is SiteLocale {
  return typeof value === 'string' && siteLocaleSet.has(value as SiteLocale);
}

export function normalizeSiteLocale(value: string | undefined): SiteLocale | undefined {
  if (!value) {
    return undefined;
  }

  const lowered = value.toLowerCase();
  const mapped = siteLocaleAlias[lowered] ?? siteLocaleAlias[value];

  if (mapped && isSiteLocale(mapped)) {
    return mapped;
  }

  return undefined;
}

export function parseSiteLocaleFromPath(pathname: string): SiteLocale | undefined {
  if (!pathname.startsWith('/l/')) {
    return undefined;
  }

  const [, prefix, locale] = pathname.split('/');
  if (prefix !== 'l') {
    return undefined;
  }

  return normalizeSiteLocale(locale);
}

export function parseSiteLocaleFromAnyPath(pathname: string): SiteLocale | undefined {
  const localized = parseSiteLocaleFromPath(pathname);
  if (localized) {
    return localized;
  }

  const [pathOnly] = pathname.split('?');
  const segments = pathOnly.split('/').filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }

  if (segments[0] === 'datalab') {
    return normalizeSiteLocale(segments[1]);
  }

  return normalizeSiteLocale(segments[0]);
}

export function stripSiteLocalePrefix(pathname: string): { locale?: SiteLocale; pathname: string } {
  const locale = parseSiteLocaleFromPath(pathname);
  if (!locale) {
    return { pathname };
  }

  const prefix = `/l/${locale}`;
  const stripped = pathname === prefix ? '/' : pathname.slice(prefix.length);
  return {
    locale,
    pathname: stripped.length > 0 ? stripped : '/',
  };
}

export function localizeSitePath(locale: SiteLocale, path: string): string {
  if (path.startsWith('http') || path.startsWith('#')) {
    return path;
  }

  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (locale === defaultSiteLocale) {
    return normalized;
  }

  if (normalized === '/') {
    return `/l/${locale}`;
  }

  return `/l/${locale}${normalized}`;
}

export function toIntlLocale(locale: SiteLocale): string {
  return locale;
}

export function isNewSitePublicPath(pathname: string): boolean {
  if (pathname === '/') {
    return true;
  }

  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  return [
    'research',
    'dashboard',
    'metrics',
    'runs',
    'artifacts',
    'docs',
    'paper',
    'report',
    'community',
    'link',
    'messenger',
  ].includes(first);
}
