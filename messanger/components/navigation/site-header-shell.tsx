'use client';

import { usePathname } from 'next/navigation';

import { TopTabs } from '@/components/navigation/top-tabs';
import { defaultSiteLocale, stripSiteLocalePrefix, type SiteLocale } from '@/lib/site-locale';

type Props = {
  initialLocale: SiteLocale;
};

export function SiteHeaderShell({ initialLocale }: Props) {
  const pathname = usePathname() ?? '/';
  const { pathname: basePathname } = stripSiteLocalePrefix(pathname);
  const isMessengerRoute =
    basePathname.startsWith('/link') || basePathname.startsWith('/messenger');

  if (isMessengerRoute) {
    return null;
  }

  return (
    <div className="relative z-30 mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-7 lg:px-10">
      <header className="rounded-[30px] border border-white/8 bg-[#0b1626]/72 px-5 py-3.5 text-sm shadow-[0_10px_26px_rgba(4,10,20,0.3)] backdrop-blur-[1px]">
        <TopTabs initialLocale={initialLocale ?? defaultSiteLocale} />
      </header>
    </div>
  );
}
