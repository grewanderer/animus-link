import type { Metadata } from 'next';

import { site } from '@/config/site';
import { defaultLocale, locales, localizedPath, type Locale } from '@/lib/i18n';

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  locale: Locale;
};

const titleTemplate = '%s';
const metadataBase = new URL(site.url);
const openGraphImages = site.ogImage ? [{ url: site.ogImage, alt: site.name }] : undefined;
const twitterImages = site.ogImage ? [site.ogImage] : undefined;

export const baseMetadata: Metadata = {
  metadataBase,
  title: {
    default: site.name,
    template: titleTemplate,
  },
  description: site.description,
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: [{ url: '/favicon.ico' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    siteName: site.name,
    url: site.url,
    title: site.name,
    description: site.description,
    images: openGraphImages,
  },
  twitter: {
    card: 'summary_large_image',
    title: site.name,
    description: site.description,
    images: twitterImages,
  },
};

export function buildLanguageAlternates(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const languages: Record<string, string> = {};
  locales.forEach((locale) => {
    languages[locale] = `${site.url}${localizedPath(locale, normalized)}`;
  });
  languages['x-default'] = `${site.url}${localizedPath(defaultLocale, normalized)}`;
  return { languages };
}

export function buildPageMetadata({
  title: _title,
  description,
  path,
  locale,
}: PageMetadataInput): Metadata {
  void _title;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(localizedPath(locale, normalized), site.url).toString();
  const alternates = buildLanguageAlternates(normalized);

  return {
    title: site.name,
    description,
    alternates: {
      canonical: url,
      languages: alternates.languages,
    },
    openGraph: {
      type: 'website',
      siteName: site.name,
      title: site.name,
      description,
      url,
      locale,
      images: openGraphImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: site.name,
      description,
      images: twitterImages,
    },
  };
}
