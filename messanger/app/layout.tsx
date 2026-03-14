import '@/styles/globals.css';
import { headers } from 'next/headers';

import { SiteHeaderShell } from '@/components/navigation/site-header-shell';
import { LiveFrame } from '@/sections/landing/live-frame';
import { cn } from '@/lib/utils';
import { defaultSiteLocale, stripSiteLocalePrefix } from '@/lib/site-locale';
import { getRequestSiteLocale } from '@/lib/site-request-locale';
import { baseMetadata } from '@/lib/seo';

export const metadata = baseMetadata;

function resolveRequestPathname(rawPath: string | null): string {
  if (!rawPath) {
    return '/';
  }
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    try {
      return new URL(rawPath).pathname;
    } catch {
      return '/';
    }
  }
  return rawPath;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getRequestSiteLocale()) ?? defaultSiteLocale;
  const headerStore = await headers();
  const rawPath =
    headerStore.get('x-invoke-path') ?? headerStore.get('x-matched-path') ?? headerStore.get('next-url');
  const pathname = resolveRequestPathname(rawPath);
  const { pathname: basePathname } = stripSiteLocalePrefix(pathname);
  const isLegacyDatalab =
    basePathname.startsWith('/datalab') || /^\/(en|ru|es|zh-CN|ja)(?:\/|$)/.test(pathname);

  return (
    <html lang={locale}>
      <body className="min-h-[100dvh] min-h-screen bg-[#040910] text-white">
        <div className={isLegacyDatalab ? undefined : 'marketing-shell site-shell'}>
          {!isLegacyDatalab ? <LiveFrame /> : null}
          <div className={cn(isLegacyDatalab ? undefined : 'site-shell-content relative z-10')}>
            {!isLegacyDatalab ? <SiteHeaderShell initialLocale={locale} /> : null}
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
