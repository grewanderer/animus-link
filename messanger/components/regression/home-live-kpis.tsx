'use client';

import { useLiveJson } from '@/components/regression/use-live-json';
import { parseLiveMetricsSnapshot } from '@/lib/live-metrics-schema';
import type { LiveMetricsSnapshot } from '@/lib/live-metrics-types';
import { localizeSitePath, toIntlLocale, type SiteLocale } from '@/lib/site-locale';
import { createSiteTranslator } from '@/lib/site-translations';

type Props = {
  initialMetrics: LiveMetricsSnapshot;
  locale: SiteLocale;
};

type KpiTileProps = {
  label: string;
  value: string;
  hint?: string;
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

function KpiTile({ label, value, hint }: KpiTileProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/60">{label}</p>
      <p className="mt-1 font-metric-mono text-sm text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/70">{hint}</p> : null}
    </div>
  );
}

export function HomeLiveKpis({ initialMetrics, locale }: Props) {
  const t = createSiteTranslator(locale);
  const { data, isLoading, error } = useLiveJson({
    url: '/api/metrics',
    parse: parseLiveMetricsSnapshot,
    fallback: initialMetrics,
    intervalMs: Math.max((initialMetrics.refreshIntervalSeconds || 15) * 1000, 15_000),
  });

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 sm:p-4" aria-labelledby="home-live-kpi-heading">
      <header className="space-y-2">
        <h2 id="home-live-kpi-heading" className="text-lg font-semibold text-white sm:text-xl">
          {t('home.live.title')}
        </h2>
        <p className="text-sm text-white/75">{t('home.live.subtitle')}</p>
        {isLoading ? <p className="text-xs text-white/65">{t('common.refreshing')}</p> : null}
        {error ? <p className="text-xs text-white/65">{t('common.metricsUnavailable')}</p> : null}
      </header>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        <KpiTile label={t('home.live.kpi.tokens24h')} value={formatNumber(locale, data.tokens.tokens24h)} />
        <KpiTile label={t('home.live.kpi.tokens7d')} value={formatNumber(locale, data.tokens.tokens7d)} />
        <KpiTile label={t('home.live.kpi.tokensTotal')} value={formatNumber(locale, data.tokens.tokensTotal)} />
        <KpiTile label={t('home.live.kpi.tokensUpdated')} value={formatTime(locale, data.tokens.updatedAt)} />
        <KpiTile
          label={t('home.live.kpi.defaultBranch')}
          value={`${data.branch.name} · ${shortSha(data.branch.commitSha)}`}
          hint={formatRelativeAge(locale, data.branch.committedAt)}
        />
        <KpiTile
          label={t('home.live.kpi.ciStatus')}
          value={t(`ci.${data.ci.conclusion}`)}
          hint={formatTime(locale, data.ci.updatedAt)}
        />
        <KpiTile label={t('home.live.kpi.commits7d')} value={formatNumber(locale, data.commits7d)} />
        <KpiTile
          label={t('home.live.kpi.mergedPrs7d')}
          value={formatNumber(locale, data.mergedPullRequests7d)}
        />
        <KpiTile label={t('home.live.kpi.openPrs')} value={formatNumber(locale, data.openPullRequests)} />
        <KpiTile label={t('home.live.kpi.openIssues')} value={formatNumber(locale, data.openIssues)} />
        <KpiTile
          label={t('home.live.kpi.latestRelease')}
          value={data.latestRelease ? data.latestRelease.tag : t('scoreboard.noRelease')}
          hint={data.latestRelease ? formatTime(locale, data.latestRelease.publishedAt) : undefined}
        />
        <KpiTile
          label={t('home.live.kpi.repoSignals')}
          value={`${formatNumber(locale, data.stars)} / ${formatNumber(locale, data.forks)} / ${formatNumber(locale, data.watchers)}`}
          hint={t('home.live.kpi.repoSignalsHint')}
        />
      </div>

      <footer className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/65">
        <span>{t('home.live.source')}</span>
        <a
          href={localizeSitePath(locale, '/metrics')}
          className="underline decoration-white/35 underline-offset-4 hover:text-white"
        >
          {t('home.live.dataSourceLink')}
        </a>
      </footer>
    </section>
  );
}
