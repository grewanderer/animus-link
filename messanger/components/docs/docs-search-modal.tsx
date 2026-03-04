'use client';

import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useDocsSearch } from '@/components/docs/docs-search-provider';
import { Input } from '@/components/ui/input';
import { createTranslator, localizedPath, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const copy: Partial<Record<Locale, Record<string, string>>> & { en: Record<string, string> } = {
  en: {
    'search.open': 'Search docs',
    'search.placeholder': 'Search docs',
    'search.noResults': 'No results for "{query}".',
    'search.hintNavigate': '↑↓ to navigate',
    'search.hintSelect': 'Enter to open',
    'search.hintClose': 'Esc to close',
    'search.quickLinks': 'Quick links',
    'search.loading': 'Loading index…',
    'search.close': 'Close search',
  },
  ru: {
    'search.open': 'Поиск по документации',
    'search.placeholder': 'Поиск по документации',
    'search.noResults': 'Нет результатов по запросу «{query}».',
    'search.hintNavigate': '↑↓ навигация',
    'search.hintSelect': 'Enter открыть',
    'search.hintClose': 'Esc закрыть',
    'search.quickLinks': 'Быстрые ссылки',
    'search.loading': 'Загрузка индекса…',
    'search.close': 'Закрыть поиск',
  },
  es: {
    'search.open': 'Buscar en la documentación',
    'search.placeholder': 'Buscar en la documentación',
    'search.noResults': 'Sin resultados para "{query}".',
    'search.hintNavigate': '↑↓ para navegar',
    'search.hintSelect': 'Enter para abrir',
    'search.hintClose': 'Esc para cerrar',
    'search.quickLinks': 'Enlaces rápidos',
    'search.loading': 'Cargando índice…',
    'search.close': 'Cerrar búsqueda',
  },
  'zh-CN': {
    'search.open': '搜索文档',
    'search.placeholder': '搜索文档',
    'search.noResults': '没有找到“{query}”相关结果。',
    'search.hintNavigate': '↑↓ 导航',
    'search.hintSelect': 'Enter 打开',
    'search.hintClose': 'Esc 关闭',
    'search.quickLinks': '快捷链接',
    'search.loading': '索引加载中…',
    'search.close': '关闭搜索',
  },
  ja: {
    'search.open': 'ドキュメント検索',
    'search.placeholder': 'ドキュメント検索',
    'search.noResults': '"{query}" に一致する結果はありません。',
    'search.hintNavigate': '↑↓ で移動',
    'search.hintSelect': 'Enter で開く',
    'search.hintClose': 'Esc で閉じる',
    'search.quickLinks': 'クイックリンク',
    'search.loading': 'インデックスを読み込み中…',
    'search.close': '検索を閉じる',
  },
};

const quickLinks: Partial<Record<Locale, { label: string; href: string }[]>> & {
  en: { label: string; href: string }[];
} = {
  en: [
    { label: 'Overview', href: '/docs/overview' },
    { label: 'System Definition', href: '/docs/system-definition' },
    { label: 'Architecture', href: '/docs/architecture' },
    { label: 'Security', href: '/docs/security' },
  ],
  ru: [
    { label: 'Обзор', href: '/docs/overview' },
    { label: 'Определение системы', href: '/docs/system-definition' },
    { label: 'Архитектура', href: '/docs/architecture' },
    { label: 'Безопасность', href: '/docs/security' },
  ],
  es: [
    { label: 'Resumen', href: '/docs/overview' },
    { label: 'Definición del sistema', href: '/docs/system-definition' },
    { label: 'Arquitectura', href: '/docs/architecture' },
    { label: 'Seguridad', href: '/docs/security' },
  ],
  'zh-CN': [
    { label: '概览', href: '/docs/overview' },
    { label: '系统定义', href: '/docs/system-definition' },
    { label: '架构', href: '/docs/architecture' },
    { label: '安全', href: '/docs/security' },
  ],
  ja: [
    { label: '概要', href: '/docs/overview' },
    { label: 'システム定義', href: '/docs/system-definition' },
    { label: 'アーキテクチャ', href: '/docs/architecture' },
    { label: 'セキュリティ', href: '/docs/security' },
  ],
};

function highlightSnippet(snippet: string, tokens: string[]) {
  if (!snippet) return snippet;
  const normalizedTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (!normalizedTokens.length) return snippet;
  const pattern = new RegExp(`(${normalizedTokens.map(escapeRegExp).join('|')})`, 'ig');
  const parts = snippet.split(pattern).filter(Boolean);
  return parts.map((part, index) => {
    const isMatch = normalizedTokens.some((token) => part.toLowerCase() === token.toLowerCase());
    if (!isMatch) {
      return <span key={`${part}-${index}`}>{part}</span>;
    }
    return (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-brand-400/20 px-1 text-brand-100"
      >
        {part}
      </mark>
    );
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

export function DocsSearchModal({ locale }: { locale: Locale }) {
  const {
    open,
    closeModal,
    query,
    setQuery,
    results,
    loading,
    activeIndex,
    setActiveIndex,
  } = useDocsSearch();
  const router = useRouter();
  const t = createTranslator(locale, copy);
  const localizedQuickLinks = quickLinks[locale] ?? quickLinks.en;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const tokens = useMemo(
    () => query.trim().toLowerCase().split(/[\s/]+/).filter(Boolean),
    [query],
  );

  useEffect(() => {
    if (!open) return;
    lastActiveRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeModal]);

  useEffect(() => {
    if (!open) {
      lastActiveRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const listboxId = 'docs-search-listbox';
  const activeId = results[activeIndex]
    ? `docs-search-option-${activeIndex}`
    : undefined;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-16">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label={t('search.close')}
        onClick={closeModal}
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('search.open')}
        className="relative w-full max-w-3xl"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
            'input, button, a, textarea, select, [tabindex]:not([tabindex=\"-1\"])',
          );
          if (!focusable || focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const isShift = event.shiftKey;
          if (isShift && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!isShift && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b1626]/95 shadow-[0_30px_70px_rgba(3,10,20,0.65)]">
          <div className="border-b border-white/10 px-4 py-4 sm:px-6">
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search.placeholder')}
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              className="flex h-12 w-full rounded-2xl border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-50 border-white/20 bg-[#0b1626]/92 text-white placeholder:text-white/45"
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex(Math.min(activeIndex + 1, Math.max(results.length - 1, 0)));
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex(Math.max(activeIndex - 1, 0));
                }
                if (event.key === 'Enter' && results[activeIndex]) {
                  event.preventDefault();
                  router.push(results[activeIndex].url);
                  closeModal();
                }
              }}
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-4 py-4 sm:px-6">
            {loading ? (
              <div className="text-sm text-white/70">{t('search.loading')}</div>
            ) : null}

            {!loading && query.trim() && results.length === 0 ? (
              <div className="space-y-4 text-sm text-white/70">
                <div>{t('search.noResults').replace('{query}', query.trim())}</div>
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-white/50">
                    {t('search.quickLinks')}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {localizedQuickLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={localizedPath(locale, link.href)}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:border-white/30 hover:text-white"
                        onClick={closeModal}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {!loading && query.trim() && results.length > 0 ? (
              <ul role="listbox" id={listboxId} className="space-y-3">
                {results.map((result, index) => {
                  const isActive = index === activeIndex;
                  const crumb =
                    result.heading && result.heading !== result.section
                      ? `${result.section} › ${result.heading}`
                      : result.section;
                  return (
                    <li
                      key={result.url}
                      role="option"
                      id={`docs-search-option-${index}`}
                      aria-selected={isActive}
                    >
                      <Link
                        href={result.url}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={closeModal}
                        className={cn(
                          'block rounded-2xl border px-4 py-3 text-sm transition',
                          isActive
                            ? 'border-brand-400/60 bg-[#0e1d2f]/90 text-white'
                            : 'border-white/10 bg-[#0b1626]/85 text-white/75 hover:border-white/30',
                        )}
                      >
                        <div className="flex items-center justify-between text-base font-semibold text-white">
                          <span>{result.title}</span>
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.2em] text-white/50">
                          {crumb}
                        </div>
                        <div className="mt-2 text-sm text-white/70">
                          {highlightSnippet(result.snippet, tokens)}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/50 sm:px-6">
            <span>{t('search.hintNavigate')}</span>
            <span>{t('search.hintSelect')}</span>
            <span>{t('search.hintClose')}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
