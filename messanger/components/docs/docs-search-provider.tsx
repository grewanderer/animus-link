'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { type DocsSearchResult, prepareSearchIndex, searchDocs } from '@/lib/docs-search';
import { type Locale } from '@/lib/i18n';

type SearchContextValue = {
  locale: Locale;
  open: boolean;
  openModal: (seedQuery?: string) => void;
  closeModal: () => void;
  query: string;
  setQuery: (value: string) => void;
  results: DocsSearchResult[];
  loading: boolean;
  activeIndex: number;
  setActiveIndex: (value: number) => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);

const indexCache = new Map<string, ReturnType<typeof prepareSearchIndex>>();
const inflight = new Map<string, Promise<ReturnType<typeof prepareSearchIndex>>>();

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    target.isContentEditable ||
    target.getAttribute('role') === 'textbox'
  );
}

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

export function DocsSearchProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [index, setIndex] = useState<ReturnType<typeof prepareSearchIndex> | null>(null);
  const [loading, setLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const lastLocaleRef = useRef<Locale>(locale);

  const ensureIndex = useCallback(async () => {
    if (indexCache.has(locale)) {
      setIndex(indexCache.get(locale) ?? null);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchIndex(locale);
      setIndex(next);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (lastLocaleRef.current !== locale) {
      lastLocaleRef.current = locale;
      setIndex(indexCache.get(locale) ?? null);
    }
    if (open || query.trim()) {
      void ensureIndex();
    }
  }, [locale, open, query, ensureIndex]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 100);
    return () => window.clearTimeout(id);
  }, [query]);

  const results = useMemo(() => searchDocs(index, debouncedQuery), [index, debouncedQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results, debouncedQuery]);

  const openModal = useCallback(
    (seedQuery?: string) => {
      if (typeof seedQuery === 'string') {
        setQuery(seedQuery);
      }
      setOpen(true);
      void ensureIndex();
    },
    [ensureIndex],
  );

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openModal();
        return;
      }
      if (event.key === '/' && !isEditableTarget(event.target)) {
        event.preventDefault();
        openModal();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openModal]);

  const value = useMemo<SearchContextValue>(
    () => ({
      locale,
      open,
      openModal,
      closeModal,
      query,
      setQuery,
      results,
      loading,
      activeIndex,
      setActiveIndex,
    }),
    [
      locale,
      open,
      openModal,
      closeModal,
      query,
      results,
      loading,
      activeIndex,
      setActiveIndex,
    ],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useDocsSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error('useDocsSearch must be used within DocsSearchProvider');
  }
  return ctx;
}
