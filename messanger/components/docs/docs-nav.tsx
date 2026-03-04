import Link from 'next/link';

import { getDocsNav } from '@/lib/docs-content';
import { createTranslator, localizedPath, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
  locale: Locale;
  activeSlug?: string;
  className?: string;
};

export function DocsNav({ locale, activeSlug, className }: Props) {
  const copy: Partial<Record<Locale, { ariaLabel: string }>> & {
    en: { ariaLabel: string };
  } = {
    en: { ariaLabel: 'Docs navigation' },
    ru: { ariaLabel: 'Навигация по документации' },
    es: { ariaLabel: 'Navegación de documentación' },
    'zh-CN': { ariaLabel: '文档导航' },
    ja: { ariaLabel: 'ドキュメントナビゲーション' },
  };
  const t = createTranslator(locale, copy);
  const docsNav = getDocsNav(locale);
  return (
    <nav aria-label={t('ariaLabel')} className={cn('space-y-1 text-sm text-white/80', className)}>
      {docsNav.map((item) => {
        const isActive = activeSlug === item.slug;
        return (
          <Link
            key={item.slug}
            href={localizedPath(locale, `/docs/${item.slug}`)}
            className={cn(
              'rounded-lg px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1422]',
              'block border-l-2 border-transparent pl-3',
              isActive
                ? 'border-brand-400/80 bg-white/10 text-white shadow-[0_0_0_1px_rgba(56,180,255,0.25)]'
                : 'text-white/70 hover:border-white/30 hover:bg-white/5 hover:text-white',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
