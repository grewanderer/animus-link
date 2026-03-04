'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { getMarketingData } from '@/lib/marketing-data';
import { cn } from '@/lib/utils';
import { createTranslator, type Locale, localizedPath } from '@/lib/i18n';

type Props = {
  locale: Locale;
};

export function MobileNav({ locale }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? '';
  const { marketingNav } = getMarketingData(locale);
  const copy: Partial<Record<Locale, { menu: string; close: string }>> & {
    en: { menu: string; close: string };
  } = {
    en: { menu: 'Menu', close: 'Close' },
    ru: { menu: 'Меню', close: 'Закрыть' },
    es: { menu: 'Menú', close: 'Cerrar' },
    'zh-CN': { menu: '菜单', close: '关闭' },
    ja: { menu: 'メニュー', close: '閉じる' },
  };
  const t = createTranslator(locale, copy);

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        className="inline-flex min-w-[96px] items-center justify-center whitespace-nowrap rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70 sm:text-xs"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? t('close') : t('menu')}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? t('close') : t('menu')}
      </button>
      {open ? (
        <div
          id="mobile-nav-panel"
          className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-white/10 bg-[#0b1626]/95 p-3 shadow-[0_20px_40px_rgba(4,10,18,0.5)]"
        >
          <nav className="flex flex-col gap-1 text-sm text-white/70">
            {marketingNav.map((item) => {
              const isHashLink = item.href.startsWith('#');
              const isExternal = item.href.startsWith('http');
              const href =
                (pathname === `/${locale}` || pathname === `/${locale}/`) && isHashLink
                  ? item.href
                  : localizedPath(locale, item.href);
              const isActive = !isExternal && (pathname === href || pathname.startsWith(`${href}/`));

              if (isExternal) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                );
              }

              if (item.children?.length) {
                return (
                  <div key={item.href} className="rounded-lg px-3 py-2">
                    <Link
                      href={href}
                      className={cn(
                        'block rounded-md px-2 py-1 text-sm transition hover:bg-white/5 hover:text-white',
                        isActive ? 'bg-white/10 text-white' : 'text-white/70',
                      )}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </Link>
                    <div className="mt-2 flex flex-col gap-1 pl-3">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={localizedPath(locale, child.href)}
                          className="rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/5 hover:text-white"
                          onClick={() => setOpen(false)}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    'rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white',
                    isActive ? 'bg-white/10 text-white' : undefined,
                  )}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
