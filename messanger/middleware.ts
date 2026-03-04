import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  defaultSiteLocale,
  normalizeSiteLocale,
  siteLocaleCookieName,
  stripSiteLocalePrefix,
} from '@/lib/site-locale';

const LEGACY_DATALAB_LOCALE_PATH = /^\/(en|ru|es|zh-CN|ja)(?:\/.*)?$/;

function shouldBypass(pathname: string) {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/data') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon-16.png' ||
    pathname === '/favicon-32.png' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/logo.png'
  );
}

function withCookie(response: NextResponse, locale: string) {
  response.cookies.set(siteLocaleCookieName, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

function buildDatalabPath(locale: string, restSegments: string[] = []) {
  const suffix = restSegments.length > 0 ? `/${restSegments.join('/')}` : '';
  return `/datalab/${locale}${suffix}`;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldBypass(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/l/')) {
    const { locale, pathname: strippedPathname } = stripSiteLocalePrefix(pathname);
    const resolvedLocale = locale ?? defaultSiteLocale;

    if (resolvedLocale === defaultSiteLocale) {
      const target = request.nextUrl.clone();
      target.pathname = strippedPathname;
      return withCookie(NextResponse.redirect(target, 308), resolvedLocale);
    }

    if (strippedPathname.startsWith('/datalab')) {
      const target = request.nextUrl.clone();
      target.pathname = strippedPathname;
      return withCookie(NextResponse.redirect(target, 308), resolvedLocale);
    }

    const rewriteTarget = request.nextUrl.clone();
    rewriteTarget.pathname = strippedPathname;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-site-locale', resolvedLocale);

    return withCookie(
      NextResponse.rewrite(rewriteTarget, {
        request: {
          headers: requestHeaders,
        },
      }),
      resolvedLocale,
    );
  }

  if (LEGACY_DATALAB_LOCALE_PATH.test(pathname)) {
    const target = request.nextUrl.clone();

    target.pathname = `/datalab${pathname}`;
    return NextResponse.redirect(target, 308);
  }

  if (pathname.startsWith('/datalab')) {
    const segments = pathname.split('/').filter(Boolean);
    const rawLocale = segments[1];
    const pathLocale = normalizeSiteLocale(rawLocale);
    const localeFromCookie = normalizeSiteLocale(request.cookies.get(siteLocaleCookieName)?.value);
    const locale = pathLocale ?? localeFromCookie ?? defaultSiteLocale;
    const trailing = pathLocale ? segments.slice(2) : segments.slice(1);
    const hasCanonicalLocaleSegment = typeof rawLocale === 'string' && rawLocale === pathLocale;

    if (!pathLocale || !hasCanonicalLocaleSegment) {
      const target = request.nextUrl.clone();
      target.pathname = buildDatalabPath(locale, trailing);
      return withCookie(NextResponse.redirect(target, 308), locale);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-site-locale', locale);

    return withCookie(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
      locale,
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
