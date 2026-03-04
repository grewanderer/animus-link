import type { Metadata } from 'next';

import { site } from '@/config/site';
import { localizeSitePath, type SiteLocale } from '@/lib/site-locale';
import { createSiteTranslator } from '@/lib/site-translations';

export function buildSitePageMetadata(
  locale: SiteLocale,
  path: string,
  _titleKey: string,
  descriptionKey: string,
): Metadata {
  const t = createSiteTranslator(locale);
  const localizedPath = localizeSitePath(locale, path);
  const canonical = new URL(localizedPath, site.url).toString();
  const description = t(descriptionKey);

  return {
    title: site.name,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: site.name,
      description,
      url: canonical,
      type: 'website',
      locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: site.name,
      description,
    },
  };
}
