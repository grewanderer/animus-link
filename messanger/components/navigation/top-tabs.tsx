'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { createSiteTranslator } from '@/lib/site-translations';
import {
  getSiteLocaleLabel,
  localizeSitePath,
  parseSiteLocaleFromAnyPath,
  siteLocaleCookieName,
  siteLocales,
  stripSiteLocalePrefix,
  type SiteLocale,
} from '@/lib/site-locale';
import { cn } from '@/lib/utils';

type Props = {
  initialLocale: SiteLocale;
};

function resolveBasePath(pathname: string) {
  const [pathOnly] = pathname.split('?');
  return stripSiteLocalePrefix(pathOnly || '/').pathname;
}

const datalabContentLocales = new Set(['en', 'ru', 'es', 'zh-CN', 'ja']);
const datalabRouteLocales = new Set([...datalabContentLocales]);
const knownLocaleSegments = new Set([...siteLocales, ...datalabRouteLocales]);

function localeSwitchPath(nextLocale: SiteLocale, path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/') {
    return `/l/${nextLocale}`;
  }
  return `/l/${nextLocale}${normalized}`;
}

function datalabRootPath(nextLocale: SiteLocale) {
  const requestedDatalabLocale = datalabRouteLocales.has(nextLocale) ? nextLocale : 'en';
  return `/datalab/${requestedDatalabLocale}`;
}

function localizedPathByLocale(nextLocale: SiteLocale, currentPathname: string) {
  const [pathOnly, ...searchParts] = currentPathname.split('?');
  const search = searchParts.length > 0 ? `?${searchParts.join('?')}` : '';
  const strippedPath = stripSiteLocalePrefix(pathOnly || '/').pathname;
  const segments = strippedPath.split('/').filter(Boolean);

  // Case A: explicit public Datalab mount (/datalab/*)
  if (segments[0] === 'datalab') {
    const hasEmbeddedLocale = knownLocaleSegments.has(segments[1] || '');
    const rest = hasEmbeddedLocale ? segments.slice(2) : segments.slice(1);
    const target = rest.length > 0 ? `${datalabRootPath(nextLocale)}/${rest.join('/')}` : datalabRootPath(nextLocale);
    return `${target}${search}`;
  }

  // Case B: rewritten legacy route exposed as /en|/ru|/es|/zh-CN/*
  if (datalabRouteLocales.has(segments[0] || '')) {
    const rest = segments.slice(1);
    const target = rest.length > 0 ? `${datalabRootPath(nextLocale)}/${rest.join('/')}` : datalabRootPath(nextLocale);
    return `${target}${search}`;
  }

  // Case C: Regression Engineering routes.
  return `${localeSwitchPath(nextLocale, strippedPath)}${search}`;
}

export function TopTabs({ initialLocale }: Props) {
  const pathname = usePathname() ?? '/';
  const [browserPathname, setBrowserPathname] = useState(pathname);
  const [pathOnly] = browserPathname.split('?');
  const locale =
    parseSiteLocaleFromAnyPath(pathOnly || '/') ??
    parseSiteLocaleFromAnyPath(pathname) ??
    initialLocale;
  const t = createSiteTranslator(locale);
  const [open, setOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nextPath = `${window.location.pathname || pathname}${window.location.search || ''}`;
    setBrowserPathname(nextPath);
  }, [pathname]);

  const basePath = resolveBasePath(browserPathname);
  const onDatalab = basePath.startsWith('/datalab');
  const onMessenger = basePath.startsWith('/messenger') || basePath.startsWith('/link');

  const researchHref = localizeSitePath(locale, '/');
  const datalabHref = datalabRootPath(locale);
  const messengerHref = localizeSitePath(locale, '/link');
  const homeHref = localizeSitePath(locale, '/');

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!switcherRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function persistLocale(nextLocale: SiteLocale) {
    document.cookie = `${siteLocaleCookieName}=${encodeURIComponent(nextLocale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  function switchLocale(nextLocale: SiteLocale) {
    const targetPath = localizedPathByLocale(nextLocale, browserPathname);
    persistLocale(nextLocale);
    setOpen(false);
    setBrowserPathname(targetPath);

    if (typeof window !== 'undefined') {
      window.location.assign(targetPath);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
      <Link
        href={homeHref}
        className="order-1 inline-flex h-8 items-center font-semibold uppercase tracking-[0.45em] text-white transition hover:text-white/90 sm:tracking-[0.6em]"
      >
        {t('shell.company')}
      </Link>

      <nav
        className="order-3 flex basis-full flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-2 text-xs uppercase tracking-[0.18em] text-white/70 md:order-2 md:basis-auto md:justify-start md:border-0 md:pt-0"
        aria-label={t('shell.productTabsAria')}
      >
        <Link
          href={researchHref}
          className={cn(
            'rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/30 hover:text-white',
            !onDatalab && !onMessenger ? 'border-white/35 bg-white/10 font-medium text-white' : undefined,
          )}
          aria-current={!onDatalab && !onMessenger ? 'page' : undefined}
        >
          {t('nav.research')}
        </Link>
        <Link
          href={messengerHref}
          className={cn(
            'rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/30 hover:text-white',
            onMessenger ? 'border-white/35 bg-white/10 font-medium text-white' : undefined,
          )}
          aria-current={onMessenger ? 'page' : undefined}
        >
          {t('nav.messenger')}
        </Link>
        <Link
          href={datalabHref}
          className={cn(
            'rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/30 hover:text-white',
            onDatalab ? 'border-white/35 bg-white/10 font-medium text-white' : undefined,
          )}
          aria-current={onDatalab ? 'page' : undefined}
        >
          {t('product.datalab')}
        </Link>
      </nav>

      <div ref={switcherRef} className="relative order-2 ml-auto md:order-3">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-full border border-white/15 bg-[#091322]/90 px-3 text-xs uppercase tracking-[0.18em] text-white/80 transition hover:border-white/30 hover:text-white focus:outline-none focus-visible:border-white/40"
          aria-label={t('shell.localeSwitcherAria')}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="uppercase tracking-[0.2em] text-white/60">{t('shell.language')}</span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[11px]">
            {locale.toUpperCase()}
          </span>
          <span className="text-[10px] text-white/70">{open ? '▲' : '▼'}</span>
        </button>

        {open ? (
          <div
            className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-48 rounded-2xl border border-white/10 bg-[#0b1626]/95 p-1.5 shadow-[0_20px_45px_rgba(5,12,24,0.6)]"
            role="listbox"
            aria-label={t('shell.localeSwitcherAria')}
          >
            {siteLocales.map((item) => (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={item === locale}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition',
                  item === locale
                    ? 'bg-white/10 text-white'
                    : 'text-white/75 hover:bg-white/5 hover:text-white',
                )}
                onClick={() => switchLocale(item)}
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.12em]">{item}</span>
                <span>{getSiteLocaleLabel(item)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
