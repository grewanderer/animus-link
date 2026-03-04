import { createTranslator, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type TocItem = {
  id: string;
  title: string;
};

type Props = {
  items: TocItem[];
  locale: Locale;
  className?: string;
};

export function DocsToc({ items, locale, className }: Props) {
  if (!items.length) return null;
  const copy: Partial<Record<Locale, { title: string }>> & { en: { title: string } } = {
    en: { title: 'On this page' },
    ru: { title: 'На этой странице' },
    es: { title: 'En esta página' },
    'zh-CN': { title: '本页内容' },
    ja: { title: 'このページ' },
  };
  const t = createTranslator(locale, copy);
  return (
    <aside className={cn('hidden xl:block', className)}>
      <div className="rounded-2xl border border-white/10 bg-[#0b1626]/85 p-4 text-sm text-white/70">
        <div className="text-xs uppercase tracking-[0.3em] text-white/60">{t('title')}</div>
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} className="hover:text-white">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
