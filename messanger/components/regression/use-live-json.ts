'use client';

import { useEffect, useMemo, useState } from 'react';

type ParseResult<T> = {
  data: T;
  issues: string[];
};

type UseLiveJsonOptions<T> = {
  url: string;
  parse: (value: unknown) => ParseResult<T>;
  fallback: T;
  intervalMs: number;
};

type UseLiveJsonState<T> = {
  data: T;
  isLoading: boolean;
  error: string | null;
  issues: string[];
  fetchedAt: string | null;
};

export function useLiveJson<T>({
  url,
  parse,
  fallback,
  intervalMs,
}: UseLiveJsonOptions<T>): UseLiveJsonState<T> {
  const [state, setState] = useState<UseLiveJsonState<T>>({
    data: fallback,
    isLoading: true,
    error: null,
    issues: [],
    fetchedAt: null,
  });

  const stableInterval = useMemo(() => Math.max(intervalMs, 5000), [intervalMs]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const response = await fetch(url, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const json = (await response.json()) as unknown;
        const parsed = parse(json);

        if (!alive) {
          return;
        }

        setState({
          data: parsed.data,
          isLoading: false,
          error: null,
          issues: parsed.issues,
          fetchedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (!alive) {
          return;
        }

        setState((previous) => ({
          ...previous,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          fetchedAt: new Date().toISOString(),
        }));
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, stableInterval);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [parse, stableInterval, url]);

  return state;
}
