'use client';

import { useLiveJson } from '@/components/regression/use-live-json';
import { parseLiveMetricsSnapshot } from '@/lib/live-metrics-schema';
import type { LiveMetricsSnapshot } from '@/lib/live-metrics-types';
import { toIntlLocale, type SiteLocale } from '@/lib/site-locale';
import { createSiteTranslator } from '@/lib/site-translations';

type Props = {
  initialMetrics: LiveMetricsSnapshot;
  locale: SiteLocale;
};

function formatNumber(locale: SiteLocale, value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString(toIntlLocale(locale));
}

function formatTime(locale: SiteLocale, value?: string) {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString(toIntlLocale(locale), {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HomeKpiStrip({ initialMetrics, locale }: Props) {
  const t = createSiteTranslator(locale);
  const { data } = useLiveJson({
    url: '/api/metrics',
    parse: parseLiveMetricsSnapshot,
    fallback: initialMetrics,
    intervalMs: Math.max((initialMetrics.refreshIntervalSeconds || 15) * 1000, 15_000),
  });

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label={t('scoreboard.heading')}>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">{t('scoreboard.tokens')}</p>
        <p className="mt-1 font-metric-mono text-xl text-white">{formatNumber(locale, data.tokens.tokens24h)}</p>
        <p className="mt-1 text-xs text-white/70">
          {t('common.total')}: {formatNumber(locale, data.tokens.tokensTotal)}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">{t('scoreboard.commits')}</p>
        <p className="mt-1 font-metric-mono text-xl text-white">{formatNumber(locale, data.commits7d)}</p>
        <p className="mt-1 text-xs text-white/70">
          {t('scoreboard.mergedPrs')}: {formatNumber(locale, data.mergedPullRequests7d)}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">{t('scoreboard.ciLatestTitle')}</p>
        <p className="mt-1 text-sm uppercase tracking-[0.14em] text-white">{t(`ci.${data.ci.conclusion}`)}</p>
        <p className="mt-1 text-xs text-white/70">{formatTime(locale, data.ci.updatedAt)}</p>
      </div>
    </div>
  );
}
