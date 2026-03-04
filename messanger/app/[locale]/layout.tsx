import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { AppProviders } from '@/app/providers';
import { LiveFrame } from '@/sections/landing/live-frame';
import { BackToTop } from '@/sections/landing/back-to-top';
import {
  createTranslator,
  defaultLocale,
  locales,
  resolveLocaleParam,
  type Locale,
} from '@/lib/i18n';

type Props = {
  children: ReactNode;
  params?: Promise<{ locale?: string | string[] }>;
};

function getLocaleOrThrow(value: string | string[] | undefined): Locale {
  if (!value) return defaultLocale;
  const resolved = resolveLocaleParam(value);
  if (!resolved) {
    notFound();
  }
  return resolved;
}

export const dynamicParams = false;

export default async function MarketingLayout({ children, params }: Props) {
  const resolvedParams = (await params) ?? {};
  const locale = getLocaleOrThrow(resolvedParams.locale);
  const currentYear = new Date().getUTCFullYear();
  const copy: Partial<Record<Locale, { footer: (year: number) => string }>> & {
    en: { footer: (year: number) => string };
  } = {
    en: {
      footer: (year) => `© ${year} ANIMUS.`,
    },
    ru: {
      footer: (year) => `© ${year} ANIMUS.`,
    },
    es: {
      footer: (year) => `© ${year} ANIMUS.`,
    },
    'zh-CN': {
      footer: (year) => `© ${year} ANIMUS.`,
    },
    ja: {
      footer: (year) => `© ${year} ANIMUS.`,
    },
  };
  const t = createTranslator(locale, copy);
  return (
    <AppProviders locale={locale}>
      <div
        className="min-h-[100dvh] min-h-screen bg-[#040910] text-white"
        lang={locale}
        data-locale={locale}
      >
        <div className="marketing-shell">
          <div id="top" aria-hidden="true" />
          <LiveFrame />
          <BackToTop locale={locale} />
          <div className="relative z-10 mx-auto flex min-h-[100dvh] min-h-screen w-full max-w-6xl flex-col gap-12 px-4 py-8 text-white sm:px-6 lg:px-10">
            <main className="flex-1 space-y-10">
              <div className="space-y-16">{children}</div>
            </main>

            <footer className="rounded-[32px] border border-white/10 bg-[#0b1626]/85 p-6 text-white/75 backdrop-blur-[2px]">
              <p className="text-sm">{t('footer')(currentYear)}</p>
            </footer>
          </div>
        </div>
      </div>
    </AppProviders>
  );
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
