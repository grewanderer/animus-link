'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { getMarketingData } from '@/lib/marketing-data';
import { cn } from '@/lib/utils';
import { type Locale, localizedPath } from '@/lib/i18n';

type Props = {
  locale: Locale;
};

export function MarketingNav({ locale }: Props) {
  const pathname = usePathname() ?? '';
  const { marketingNav } = getMarketingData(locale);
  const isHome = pathname === `/${locale}` || pathname === `/${locale}/`;
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);

  const updateDropdownPosition = useCallback((index: number) => {
    const target = itemRefs.current[index];
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const padding = 16;
    const width = Math.min(224, Math.max(200, window.innerWidth - padding * 2));
    let left = rect.left;
    if (left + width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - width - padding);
    }
    if (left < padding) left = padding;
    const top = rect.bottom + 12;
    setDropdownStyle({ left, top, width });
  }, []);

  const openDropdown = useCallback(
    (index: number) => {
      setOpenIndex(index);
      updateDropdownPosition(index);
    },
    [updateDropdownPosition],
  );

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey) {
        return;
      }

      const overflowX = window.getComputedStyle(nav).overflowX;
      const canScrollHorizontally =
        overflowX !== 'visible' && nav.scrollWidth > nav.clientWidth + 1;
      if (!canScrollHorizontally) {
        return;
      }

      const absX = Math.abs(event.deltaX);
      const absY = Math.abs(event.deltaY);
      const isHorizontalIntent = event.shiftKey || absX > absY * 1.2;
      if (isHorizontalIntent || absY === 0) {
        return;
      }

      event.preventDefault();

      let deltaY = event.deltaY;
      if (event.deltaMode === 1) {
        deltaY *= 16;
      } else if (event.deltaMode === 2) {
        deltaY *= window.innerHeight;
      }

      window.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
    };

    nav.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      nav.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    if (openIndex === null) return;
    const handle = () => updateDropdownPosition(openIndex);
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [openIndex, updateDropdownPosition]);

  return (
    <nav
      ref={navRef}
      className="hidden items-center gap-4 overflow-x-auto text-sm text-white/70 md:flex md:w-full md:flex-nowrap md:justify-center md:pb-1 xl:gap-6 xl:overflow-visible"
    >
      {marketingNav.map((item, index) => {
        const isHashLink = item.href.startsWith('#');
        const isExternal = item.href.startsWith('http');
        const href = isHome && isHashLink ? item.href : localizedPath(locale, item.href);
        const isOpen = openIndex === index;

        if (isHome && isHashLink) {
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn('shrink-0 transition hover:text-white')}
            >
              {item.label}
            </a>
          );
        }

        if (isExternal) {
          return (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 transition hover:text-white"
            >
              {item.label}
            </a>
          );
        }

        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        if (item.children?.length) {
          return (
            <div
              key={item.href}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className="relative shrink-0"
              onMouseEnter={() => openDropdown(index)}
              onMouseLeave={() => setOpenIndex(null)}
              onFocusCapture={() => openDropdown(index)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setOpenIndex(null);
                }
              }}
            >
              <div className="inline-flex items-center gap-2">
                <Link
                  href={href}
                  className={cn(
                    'transition hover:text-white data-[active=true]:font-medium data-[active=true]:text-white',
                    isActive ? 'font-medium text-white' : undefined,
                  )}
                  data-active={isActive}
                >
                  {item.label}
                </Link>
                {isOpen && dropdownStyle ? (
                  <div
                    className="fixed z-30 rounded-2xl border border-white/10 bg-[#0b1626]/95 p-2 text-xs text-white/70 shadow-[0_20px_45px_rgba(5,12,24,0.6)]"
                    style={dropdownStyle}
                  >
                    <div className="flex flex-col gap-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={localizedPath(locale, child.href)}
                          className="rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              'shrink-0 transition hover:text-white data-[active=true]:font-medium data-[active=true]:text-white',
              isActive ? 'font-medium text-white' : undefined,
            )}
            data-active={isActive}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
