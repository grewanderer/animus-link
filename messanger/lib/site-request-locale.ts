import { cookies, headers } from 'next/headers';

import {
  defaultSiteLocale,
  normalizeSiteLocale,
  parseSiteLocaleFromAnyPath,
  siteLocaleCookieName,
  type SiteLocale,
} from '@/lib/site-locale';

export async function getRequestSiteLocale(): Promise<SiteLocale> {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const headerLocale = normalizeSiteLocale(headerStore.get('x-site-locale') ?? undefined);
  if (headerLocale) {
    return headerLocale;
  }

  const pathname = headerStore.get('x-invoke-path') ?? headerStore.get('x-matched-path') ?? '';
  const pathnameLocale = parseSiteLocaleFromAnyPath(pathname);
  if (pathnameLocale) {
    return pathnameLocale;
  }

  const cookieLocale = normalizeSiteLocale(cookieStore.get(siteLocaleCookieName)?.value);
  if (cookieLocale) {
    return cookieLocale;
  }

  return defaultSiteLocale;
}
