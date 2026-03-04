'use client';

import {
  defaultSiteLocale,
  normalizeSiteLocale,
  parseSiteLocaleFromPath,
  siteLocaleCookieName,
  type SiteLocale,
} from '@/lib/site-locale';
import { createSiteTranslator } from '@/lib/site-translations';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

function cookieLocale(): SiteLocale | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const rawCookie = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${siteLocaleCookieName}=`));

  if (!rawCookie) {
    return undefined;
  }

  const value = rawCookie.split('=').slice(1).join('=');
  return normalizeSiteLocale(decodeURIComponent(value));
}

function resolveLocale(): SiteLocale {
  if (typeof window === 'undefined') {
    return defaultSiteLocale;
  }

  const fromPath = parseSiteLocaleFromPath(window.location.pathname);
  if (fromPath) {
    return fromPath;
  }

  return cookieLocale() ?? defaultSiteLocale;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  console.error('[app] global error', error);

  const locale = resolveLocale();
  const t = createSiteTranslator(locale);

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-[#040910] text-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-16">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">{t('error.label')}</p>
          <h1 className="text-2xl font-semibold">{t('error.title')}</h1>
          <div className="text-white/75">
            <p>{t('error.description')}</p>
            <p className="mt-2 text-sm text-white/70">
              <span>{t('error.debugLabel')}</span>
              <code className="ml-2">{error.message}</code>
              {error.digest ? (
                <span className="ml-2 text-xs text-white/50">({error.digest})</span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="w-fit rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:border-white/25"
          >
            {t('error.retry')}
          </button>
        </div>
      </body>
    </html>
  );
}
