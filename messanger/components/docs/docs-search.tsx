'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Input } from '@/components/ui/input';
import { prepareSearchIndex, searchDocs, type DocsSearchResult } from '@/lib/docs-search';
import { createTranslator, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
  locale: Locale;
  className?: string;
};

const copy: Partial<Record<Locale, Record<string, string>>> & { en: Record<string, string> } = {
  en: {
    'search.open': 'Search docs',
    'search.placeholder': 'Search docs',
    'search.noResults': 'No results.',
    'search.loading': 'Loading index…',
  },
  ru: {
    'search.open': 'Поиск по документации',
    'search.placeholder': 'Поиск по документации',
    'search.noResults': 'Ничего не найдено.',
    'search.loading': 'Загрузка индекса…',
  },
  es: {
    'search.open': 'Buscar en la documentación',
    'search.placeholder': 'Buscar en la documentación',
    'search.noResults': 'Sin resultados.',
    'search.loading': 'Cargando índice…',
  },
  'zh-CN': {
    'search.open': '搜索文档',
    'search.placeholder': '搜索文档',
    'search.noResults': '没有结果。',
    'search.loading': '索引加载中…',
  },
  ja: {
    'search.open': 'ドキュメント検索',
    'search.placeholder': 'ドキュメント検索',
    'search.noResults': '結果がありません。',
    'search.loading': 'インデックスを読み込み中…',
  },
};

const indexCache = new Map<string, ReturnType<typeof prepareSearchIndex>>();
const inflight = new Map<string, Promise<ReturnType<typeof prepareSearchIndex>>>();

async function fetchIndex(locale: Locale) {
  const cached = indexCache.get(locale);
  if (cached) return cached;
  const pending = inflight.get(locale);
  if (pending) return pending;
  const indexLocale = locale === 'zh-CN' || locale === 'ja' ? 'en' : locale;
  const promise = fetch(`/search/index.${indexLocale}.json`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load search index: ${response.status}`);
      }
      return response.json();
    })
    .then((raw) => prepareSearchIndex(raw));
  inflight.set(locale, promise);
  const index = await promise;
  indexCache.set(locale, index);
  inflight.delete(locale);
  return index;
}

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
      <mark key={`${part}-${index}`} className="rounded bg-brand-400/20 px-1 text-brand-100">
        {part}
      </mark>
    );
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

export function DocsSearch({ locale, className }: Props) {
  const t = createTranslator(locale, copy);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [index, setIndex] = useState<ReturnType<typeof prepareSearchIndex> | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 100);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!open && !query.trim()) return;
    setLoading(true);
    fetchIndex(locale)
      .then((next) => setIndex(next))
      .finally(() => setLoading(false));
  }, [locale, open, query]);

  const results = useMemo(
    () => searchDocs(index, debouncedQuery),
    [index, debouncedQuery],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [results, debouncedQuery]);

  const tokens = useMemo(
    () => debouncedQuery.trim().toLowerCase().split(/[\s/]+/).filter(Boolean),
    [debouncedQuery],
  );

  const listboxId = 'docs-search-inline-listbox';
  const activeId =
    results[activeIndex] != null ? `docs-search-inline-option-${activeIndex}` : undefined;

  const handleSelect = (result: DocsSearchResult) => {
    router.push(result.url);
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onFocusCapture={() => setOpen(true)}
      onBlur={() => {
        requestAnimationFrame(() => {
          if (!containerRef.current?.contains(document.activeElement)) {
            setOpen(false);
          }
        });
      }}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.open')}
        role="combobox"
        aria-expanded={open && !!query.trim()}
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
            handleSelect(results[activeIndex]);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />

      {open && query.trim() ? (
        <div className="absolute left-0 right-0 z-20 mt-2 rounded-2xl border border-white/10 bg-[#0b1626]/95 p-2 text-sm text-white/80 shadow-[0_20px_45px_rgba(5,12,24,0.55)]">
          {loading ? <div className="px-3 py-2 text-white/70">{t('search.loading')}</div> : null}
          {!loading && results.length === 0 ? (
            <div className="px-3 py-2 text-white/70">{t('search.noResults')}</div>
          ) : null}
          {!loading && results.length > 0 ? (
            <ul role="listbox" id={listboxId} className="space-y-2">
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
                    id={`docs-search-inline-option-${index}`}
                    aria-selected={isActive}
                  >
                    <Link
                      href={result.url}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'block rounded-xl border px-3 py-2 text-sm transition',
                        isActive
                          ? 'border-brand-400/60 bg-[#0e1d2f]/90 text-white'
                          : 'border-white/10 bg-[#0b1626]/85 text-white/75 hover:border-white/30',
                      )}
                    >
                      <div className="text-sm font-semibold text-white">{result.title}</div>
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
      ) : null}
    </div>
  );
}
