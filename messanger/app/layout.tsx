import '@/styles/globals.css';
import { headers } from 'next/headers';

import { TopTabs } from '@/components/navigation/top-tabs';
import { LiveFrame } from '@/sections/landing/live-frame';
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
        <div className={isLegacyDatalab ? undefined : 'marketing-shell'}>
          {!isLegacyDatalab ? <LiveFrame /> : null}
          <div className={isLegacyDatalab ? undefined : 'relative z-10'}>
            <div className="relative z-30 mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-7 lg:px-10">
              <header className="rounded-[30px] border border-white/8 bg-[#0b1626]/72 px-5 py-3.5 text-sm shadow-[0_10px_26px_rgba(4,10,20,0.3)] backdrop-blur-[1px]">
                <TopTabs initialLocale={locale} />
              </header>
            </div>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
