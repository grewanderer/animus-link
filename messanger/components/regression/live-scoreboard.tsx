'use client';

import { useLiveJson } from '@/components/regression/use-live-json';
import { VizPanel } from '@/components/viz/viz-panel';
import { parseLiveMetricsSnapshot } from '@/lib/live-metrics-schema';
import type { LiveMetricsSnapshot, LiveTrendPoint } from '@/lib/live-metrics-types';
import { toIntlLocale, type SiteLocale } from '@/lib/site-locale';
import { createSiteTranslator } from '@/lib/site-translations';
import { cn } from '@/lib/utils';
import { TrendSparkline } from '@/components/viz/trend-sparkline';

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
    return value;
  }
  return parsed.toLocaleString(toIntlLocale(locale), {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeAge(locale: SiteLocale, value?: string) {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  const diffSeconds = Math.round((parsed.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(toIntlLocale(locale), { numeric: 'auto' });

  if (absolute < 60) {
    return rtf.format(diffSeconds, 'second');
  }
  if (absolute < 3600) {
    return rtf.format(Math.round(diffSeconds / 60), 'minute');
  }
  if (absolute < 86400) {
    return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  }
  return rtf.format(Math.round(diffSeconds / 86400), 'day');
}

function shortSha(value: string | undefined) {
  if (!value) {
    return '—';
  }
  return value.slice(0, 8);
}

function buildTokenWindowPoints(data: LiveMetricsSnapshot): LiveTrendPoint[] {
  const dailyAverage = data.tokens.tokens7d > 0 ? Math.round(data.tokens.tokens7d / 7) : 0;
  return [
    { time: '7d_avg', value: dailyAverage },
    { time: '24h', value: data.tokens.tokens24h },
  ];
}

function ciTone(status: LiveMetricsSnapshot['ci']['conclusion']) {
  if (status === 'success') return 'border-sky-300/40 bg-sky-300/15 text-sky-100';
  if (status === 'failure') return 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100';
  if (status === 'queued' || status === 'in_progress') {
    return 'border-blue-200/40 bg-blue-200/15 text-blue-100';
  }
  return 'border-white/20 bg-white/10 text-white/80';
}

export function LiveScoreboard({ initialMetrics, locale }: Props) {
  const t = createSiteTranslator(locale);
  const { data, isLoading, error } = useLiveJson({
    url: '/api/metrics',
    parse: parseLiveMetricsSnapshot,
    fallback: initialMetrics,
    intervalMs: Math.max((initialMetrics.refreshIntervalSeconds || 15) * 1000, 15_000),
  });
  const commitSparkline = data.commitWeeklyTrend.slice(-7);
  const tokenSparkline = buildTokenWindowPoints(data);

  return (
    <section id="live-metrics" className="space-y-4" aria-labelledby="live-metrics-heading">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
          <span className="uppercase tracking-[0.24em]">{t('scoreboard.tag')}</span>
        </div>
        <h2 id="live-metrics-heading" className="text-2xl font-semibold text-white sm:text-3xl">
          {t('scoreboard.heading')}
        </h2>
        {isLoading ? <p className="text-sm text-white/70">{t('common.refreshing')}</p> : null}
        {error ? (
          <p className="rounded-xl border border-white/15 bg-[#0b1626]/80 px-3 py-2 text-sm text-white/80">
            {t('common.metricsUnavailable')}
          </p>
        ) : null}
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <VizPanel
          title={t('scoreboard.tokens')}
          controls={t('common.last24h')}
          footer={
            <TrendSparkline points={tokenSparkline} ariaLabel={t('scoreboard.tokensSparklineAria')} />
          }
          bodyClassName="items-start justify-start"
        >
          <div className="w-full space-y-1 text-sm text-white/80">
            <p className="font-metric-mono text-2xl text-white">{formatNumber(locale, data.tokens.tokens24h)}</p>
            <p>
              {t('common.total')}: <span className="font-metric-mono text-white">{formatNumber(locale, data.tokens.tokensTotal)}</span>
            </p>
            <p>
              {t('common.last7d')}: <span className="font-metric-mono text-white">{formatNumber(locale, data.tokens.tokens7d)}</span>
            </p>
            <p>
              {t('scoreboard.tokensUpdated')}: <span className="font-metric-mono text-white">{formatTime(locale, data.tokens.updatedAt)}</span>
            </p>
          </div>
        </VizPanel>

        <VizPanel
          title={t('scoreboard.repositorySignals')}
          controls={t('common.github')}
          bodyClassName="items-start justify-start"
          footer={`${t('scoreboard.watchers')}: ${formatNumber(locale, data.watchers)}`}
        >
          <div className="w-full space-y-1 text-sm text-white/80">
            <p>
              {t('scoreboard.stars')}: <span className="font-metric-mono text-white">{formatNumber(locale, data.stars)}</span>
            </p>
            <p>
              {t('scoreboard.forks')}: <span className="font-metric-mono text-white">{formatNumber(locale, data.forks)}</span>
            </p>
          </div>
        </VizPanel>

        <VizPanel
          title={t('scoreboard.activity')}
          controls={t('common.last7d')}
          bodyClassName="items-start justify-start"
          footer={<TrendSparkline points={commitSparkline} ariaLabel={t('scoreboard.commitSparklineAria')} />}
        >
          <div className="w-full space-y-1 text-sm text-white/80">
            <p>
              {t('scoreboard.commits')}: <span className="font-metric-mono text-white">{formatNumber(locale, data.commits7d)}</span>
            </p>
            <p>
              {t('scoreboard.mergedPrs')}: <span className="font-metric-mono text-white">{formatNumber(locale, data.mergedPullRequests7d)}</span>
            </p>
            <p>
              {t('scoreboard.openPrs')}: <span className="font-metric-mono text-white">{formatNumber(locale, data.openPullRequests)}</span>
            </p>
            <p>
              {t('scoreboard.openIssues')}: <span className="font-metric-mono text-white">{formatNumber(locale, data.openIssues)}</span>
            </p>
          </div>
        </VizPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <VizPanel
          title={t('scoreboard.branchStatusTitle')}
          bodyClassName="items-start justify-start"
          footer={formatTime(locale, data.branch.committedAt)}
        >
          <div className="w-full space-y-1 text-sm text-white/80">
            <p className="font-metric-mono text-xs uppercase tracking-[0.18em] text-white/70">{data.branch.name}</p>
            <p className="font-metric-mono text-white">{shortSha(data.branch.commitSha)}</p>
            <p>
              {t('scoreboard.age')}: <span className="font-metric-mono text-white">{formatRelativeAge(locale, data.branch.committedAt)}</span>
            </p>
            {data.branch.commitUrl ? (
              <a
                href={data.branch.commitUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline decoration-white/30 underline-offset-4"
              >
                {t('scoreboard.openCommit')}
              </a>
            ) : null}
          </div>
        </VizPanel>

        <VizPanel
          title={t('scoreboard.ciLatestTitle')}
          bodyClassName="items-start justify-start"
          footer={formatTime(locale, data.ci.updatedAt)}
        >
          <div className="w-full space-y-2 text-sm text-white/80">
            <p>{data.ci.workflow || '—'}</p>
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.12em]',
                ciTone(data.ci.conclusion),
              )}
            >
              {t(`ci.${data.ci.conclusion}`)}
            </span>
            {data.ci.url ? (
              <a
                href={data.ci.url}
                target="_blank"
                rel="noreferrer"
                className="block text-xs underline decoration-white/30 underline-offset-4"
              >
                {t('scoreboard.openWorkflow')}
              </a>
            ) : null}
          </div>
        </VizPanel>

        <VizPanel
          title={t('scoreboard.latestReleaseTitle')}
          bodyClassName="items-start justify-start"
          footer={data.latestRelease ? formatTime(locale, data.latestRelease.publishedAt) : t('scoreboard.noRelease')}
        >
          <div className="w-full space-y-1 text-sm text-white/80">
            {data.latestRelease ? (
              <>
                <p className="font-metric-mono text-white">{data.latestRelease.tag}</p>
                <a
                  href={data.latestRelease.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline decoration-white/30 underline-offset-4"
                >
                  {t('scoreboard.openRelease')}
                </a>
              </>
            ) : (
              <p>{t('scoreboard.noRelease')}</p>
            )}
          </div>
        </VizPanel>
      </div>
    </section>
  );
}
