'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  BudgetBar,
  CycleConsoleRow,
  DetailsAccordion,
  DiscreteStrip,
  GaugeTile,
  LatencyStat,
  PrimaryPanel,
  ReleaseBadge,
  ResearchIndicesPanel,
  StatTile,
  type StripState,
} from '@/components/regression/cycle-observatory-widgets';
import { useLiveJson } from '@/components/regression/use-live-json';
import { Button } from '@/components/ui/button';
import { TrendSparkline } from '@/components/viz/trend-sparkline';
import { VizPanel } from '@/components/viz/viz-panel';
import { parseLiveMetricsSnapshot } from '@/lib/live-metrics-schema';
import type { CycleWindow, LiveMetricsSnapshot, WorkflowConclusion } from '@/lib/live-metrics-types';
import { localizeSitePath, toIntlLocale, type SiteLocale } from '@/lib/site-locale';
import { createSiteTranslator } from '@/lib/site-translations';
import { cn } from '@/lib/utils';
import { CorePanelVisual } from '@/sections/landing/core-panel-visual';

type Props = {
  initialMetrics: LiveMetricsSnapshot;
  locale: SiteLocale;
};

type IndexResult = {
  value?: number;
  delta?: number;
  reason?: string;
  formula: string;
};

const WINDOW_KEYS: CycleWindow[] = ['24h', '7d'];

function isWindowKey(value: string | null): value is CycleWindow {
  return value === '24h' || value === '7d';
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function formatNumber(locale: SiteLocale, value: number | undefined, fallback = '—') {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return value.toLocaleString(toIntlLocale(locale));
}

function formatFixed(locale: SiteLocale, value: number | undefined, digits = 1, fallback = '—') {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return value.toLocaleString(toIntlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatTime(locale: SiteLocale, value?: string, fallback = '—') {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toLocaleString(toIntlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function formatRelativeAge(locale: SiteLocale, value?: string, fallback = '—') {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
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

function formatDuration(
  t: ReturnType<typeof createSiteTranslator>,
  seconds: number | undefined,
) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;

  if (hours > 0) {
    return t('common.durationHour', { hours, minutes });
  }
  if (minutes > 0) {
    return t('common.durationMinute', { minutes, seconds: remainingSeconds });
  }
  return t('common.durationSecond', { seconds: remainingSeconds });
}

function shortSha(value: string | undefined, fallback = '—') {
  if (!value) {
    return fallback;
  }
  return value.slice(0, 8);
}

function formatDelta(locale: SiteLocale, delta?: number) {
  if (typeof delta !== 'number' || Number.isNaN(delta)) {
    return undefined;
  }
  const prefix = delta >= 0 ? '+' : '';
  return `${prefix}${formatFixed(locale, delta, 1)}`;
}

function computeWeightedScore(parts: Array<{ value?: number; weight: number }>) {
  const valid = parts.filter((item) => typeof item.value === 'number');
  if (valid.length === 0) {
    return undefined;
  }
  const totalWeight = valid.reduce((acc, item) => acc + item.weight, 0);
  if (totalWeight <= 0) {
    return undefined;
  }
  const total = valid.reduce((acc, item) => acc + (item.value || 0) * item.weight, 0);
  return clampPercent(total / totalWeight);
}

function conclusionTone(conclusion: WorkflowConclusion) {
  if (conclusion === 'success') {
    return 'border-sky-300/35 bg-sky-300/15 text-sky-100';
  }
  if (conclusion === 'failure') {
    return 'border-cyan-300/35 bg-cyan-300/15 text-cyan-100';
  }
  if (conclusion === 'queued' || conclusion === 'in_progress') {
    return 'border-blue-300/35 bg-blue-300/15 text-blue-100';
  }
  return 'border-white/20 bg-white/10 text-white/75';
}

function toStripState(value: WorkflowConclusion): StripState {
  if (value === 'success') {
    return 'success';
  }
  if (value === 'failure') {
    return 'failure';
  }
  if (value === 'queued' || value === 'in_progress') {
    return 'pending';
  }
  return 'unknown';
}

function budgetStatusKey(tokens: number, budget: number) {
  if (budget <= 0) {
    return 'metrics.observatory.budget.unset';
  }
  const ratio = tokens / budget;
  if (ratio <= 0.8) {
    return 'metrics.observatory.budget.ok';
  }
  if (ratio <= 1) {
    return 'metrics.observatory.budget.approaching';
  }
  return 'metrics.observatory.budget.exceeded';
}

function tokenFreshnessReason(
  locale: SiteLocale,
  data: LiveMetricsSnapshot,
  t: ReturnType<typeof createSiteTranslator>,
) {
  if (!data.observatory.tokensSchemaValid) {
    return t('metrics.observatory.reason.tokensInvalidSchema');
  }
  if (!data.observatory.tokensFresh) {
    return t('metrics.observatory.reason.tokensStale', {
      hours: formatFixed(locale, data.observatory.tokensAgeHours, 1, t('metrics.observatory.na')),
      threshold: data.observatory.config.tokensFreshnessMaxHours,
    });
  }
  return undefined;
}

function workflowUnavailableReason(
  data: LiveMetricsSnapshot,
  t: ReturnType<typeof createSiteTranslator>,
) {
  const rateLimit = data.issues.some((issue) => issue.toLowerCase().includes('rate limit'));
  if (rateLimit) {
    return t('metrics.observatory.reason.workflowRateLimit');
  }
  return t('metrics.observatory.reason.noWorkflowData');
}

function formatIndexDeltaText(
  t: ReturnType<typeof createSiteTranslator>,
  locale: SiteLocale,
  delta?: number,
) {
  if (typeof delta !== 'number') {
    return t('metrics.observatory.index.deltaNa');
  }
  return t('metrics.observatory.index.delta', {
    value: formatDelta(locale, delta) || t('metrics.observatory.na'),
  });
}

function computeIndexes(
  data: LiveMetricsSnapshot,
  stats: LiveMetricsSnapshot['observatory']['windows'][CycleWindow],
  windowKey: CycleWindow,
  t: ReturnType<typeof createSiteTranslator>,
) {
  const config = data.observatory.config;
  const tokenBudget = windowKey === '24h' ? config.tokenBudget24h : config.tokenBudget7d;

  const reproducibilityValue = computeWeightedScore([
    { value: data.observatory.githubReachable ? 100 : 0, weight: 0.35 },
    { value: data.observatory.tokensSchemaValid ? 100 : 0, weight: 0.25 },
    { value: data.observatory.tokensFresh ? 100 : 0, weight: 0.2 },
    { value: 100, weight: 0.2 },
  ]);

  const stabilityCurrent = computeWeightedScore([
    { value: stats.workflowSuccessRate, weight: 0.6 },
    {
      value:
        typeof stats.brokenMainMinutes === 'number'
          ? clampPercent(100 - (stats.brokenMainMinutes / (windowKey === '24h' ? 120 : 720)) * 100)
          : undefined,
      weight: 0.25,
    },
    {
      value:
        typeof stats.medianWorkflowDurationSeconds === 'number'
          ? clampPercent(100 - (stats.medianWorkflowDurationSeconds / config.workflowTargetDurationSeconds) * 100)
          : undefined,
      weight: 0.15,
    },
  ]);

  const stabilityPrevious = computeWeightedScore([
    { value: stats.previousWorkflowSuccessRate, weight: 0.75 },
    {
      value:
        typeof stats.previousMedianWorkflowDurationSeconds === 'number'
          ? clampPercent(
              100 -
                (stats.previousMedianWorkflowDurationSeconds / config.workflowTargetDurationSeconds) *
                  100,
            )
          : undefined,
      weight: 0.25,
    },
  ]);

  const tokenPressure =
    tokenBudget > 0 ? Math.min(100, (stats.tokens / Math.max(1, tokenBudget)) * 100) : undefined;
  const previousTokenPressure =
    tokenBudget > 0 && typeof stats.previousTokens === 'number'
      ? Math.min(100, (stats.previousTokens / Math.max(1, tokenBudget)) * 100)
      : undefined;

  const durationPressure =
    typeof stats.medianWorkflowDurationSeconds === 'number'
      ? Math.min(100, (stats.medianWorkflowDurationSeconds / config.workflowTargetDurationSeconds) * 100)
      : undefined;
  const previousDurationPressure =
    typeof stats.previousMedianWorkflowDurationSeconds === 'number'
      ? Math.min(
          100,
          (stats.previousMedianWorkflowDurationSeconds / config.workflowTargetDurationSeconds) * 100,
        )
      : undefined;

  const leadPressure =
    typeof stats.medianPrLeadTimeHours === 'number'
      ? Math.min(100, (stats.medianPrLeadTimeHours / config.prLeadTimeTargetHours) * 100)
      : undefined;
  const previousLeadPressure =
    typeof stats.previousMedianPrLeadTimeHours === 'number'
      ? Math.min(100, (stats.previousMedianPrLeadTimeHours / config.prLeadTimeTargetHours) * 100)
      : undefined;

  const costCurrent = computeWeightedScore([
    { value: tokenPressure, weight: 0.5 },
    { value: durationPressure, weight: 0.3 },
    { value: leadPressure, weight: 0.2 },
  ]);
  const costPrevious = computeWeightedScore([
    { value: previousTokenPressure, weight: 0.5 },
    { value: previousDurationPressure, weight: 0.3 },
    { value: previousLeadPressure, weight: 0.2 },
  ]);

  const reproducibility: IndexResult = {
    value: reproducibilityValue,
    formula: t('metrics.observatory.index.repro.formula', {
      staleHours: config.tokensFreshnessMaxHours,
    }),
  };

  const stability: IndexResult = {
    value: stabilityCurrent,
    delta:
      typeof stabilityCurrent === 'number' && typeof stabilityPrevious === 'number'
        ? stabilityCurrent - stabilityPrevious
        : undefined,
    reason:
      typeof stabilityCurrent === 'number'
        ? undefined
        : stats.workflowRuns > 0
          ? t('metrics.observatory.reason.partialWindowData')
          : t('metrics.observatory.reason.noWorkflowData'),
    formula: t('metrics.observatory.index.stability.formula', {
      durationTarget: config.workflowTargetDurationSeconds,
    }),
  };

  const cost: IndexResult = {
    value: costCurrent,
    delta:
      typeof costCurrent === 'number' && typeof costPrevious === 'number'
        ? costCurrent - costPrevious
        : undefined,
    reason:
      typeof costCurrent === 'number'
        ? tokenBudget <= 0
          ? t('metrics.observatory.reason.budgetNotConfigured')
          : undefined
        : tokenBudget <= 0
          ? t('metrics.observatory.reason.budgetNotConfigured')
          : t('metrics.observatory.reason.noComparableWindow'),
    formula: t('metrics.observatory.index.cost.formula', {
      budget: tokenBudget,
      durationTarget: config.workflowTargetDurationSeconds,
      leadTarget: config.prLeadTimeTargetHours,
    }),
  };

  return {
    reproducibility,
    stability,
    cost,
    tokenBudget,
  };
}

function ConsoleAnchorItem({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/58">{label}</p>
      <p className="mt-0.5 font-metric-mono text-xs text-white/90">{value}</p>
      {detail ? <p className="mt-0.5 text-[11px] text-white/65">{detail}</p> : null}
    </div>
  );
}

function ConsoleLink({
  href,
  label,
  unavailableReason,
  icon,
}: {
  href?: string;
  label: string;
  unavailableReason: string;
  icon: string;
}) {
  if (!href) {
    return (
      <span
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 px-2.5 text-xs text-white/45"
        title={unavailableReason}
        aria-label={unavailableReason}
      >
        <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-[10px]">
          {icon}
        </span>
        <span>{label}</span>
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.02] px-2.5 text-xs text-white/75 transition hover:border-white/35 hover:text-white"
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-white/[0.05] text-[10px]">
        {icon}
      </span>
      <span>{label}</span>
    </a>
  );
}

export function LiveMetricsDashboard({ initialMetrics, locale }: Props) {
  const t = createSiteTranslator(locale);
  const router = useRouter();
  const pathname = usePathname() || '/metrics';
  const searchParams = useSearchParams();

  const { data, isLoading, error } = useLiveJson({
    url: '/api/metrics',
    parse: parseLiveMetricsSnapshot,
    fallback: initialMetrics,
    intervalMs: Math.max((initialMetrics.refreshIntervalSeconds || 15) * 1000, 15_000),
  });

  const selectedWindow = isWindowKey(searchParams?.get('window'))
    ? (searchParams?.get('window') as CycleWindow)
    : '24h';

  const stats = data.observatory.windows[selectedWindow];
  const na = t('metrics.observatory.na');

  const indexes = useMemo(
    () => computeIndexes(data, stats, selectedWindow, t),
    [data, selectedWindow, stats, t],
  );

  const latestStrip20 = stats.latestConclusions.slice(0, 20).map((value, index) => ({
    state: toStripState(value),
    label: `${t(`ci.${value}`)} ${index + 1}`,
  }));

  const workflowSuccesses =
    typeof stats.workflowSuccessRate === 'number'
      ? Math.round((stats.workflowSuccessRate / 100) * stats.workflowRuns)
      : undefined;
  const workflowFails =
    typeof workflowSuccesses === 'number'
      ? Math.max(0, stats.workflowRuns - workflowSuccesses)
      : undefined;

  const ciUnavailableReason = workflowUnavailableReason(data, t);
  const tokensReason = tokenFreshnessReason(locale, data, t);

  const brokenMainValue =
    typeof stats.brokenMainMinutes === 'number'
      ? formatNumber(locale, stats.brokenMainMinutes, na)
      : na;

  const brokenMainReason =
    typeof stats.brokenMainMinutes === 'number'
      ? stats.brokenMainReason === 'open_failure'
        ? t('metrics.observatory.panel.stability.brokenMainOpen')
        : undefined
      : stats.brokenMainReason === 'open_failure'
        ? t('metrics.observatory.panel.stability.brokenMainNoTransition')
        : t('metrics.observatory.panel.stability.brokenMainUnavailable');

  const medianDuration = formatDuration(t, stats.medianWorkflowDurationSeconds);
  const latestSuccessDuration = formatDuration(t, data.ci.latestSuccessDurationSeconds);

  const prLeadTime =
    typeof stats.medianPrLeadTimeHours === 'number'
      ? `${formatFixed(locale, stats.medianPrLeadTimeHours, 1, na)}h`
      : undefined;

  function applyWindow(windowKey: CycleWindow) {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('window', windowKey);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const embeddedPanelClass =
    'rounded-2xl border-white/10 bg-white/[0.02] shadow-none p-0 backdrop-blur-0';

  return (
    <section
      className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0b1626]/85 px-6 py-4 text-sm shadow-[0_28px_55px_rgba(4,10,20,0.5)] backdrop-blur-[2px] lg:min-h-[calc(100dvh-9.5rem)]"
      aria-labelledby="metrics-observatory-heading"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(120,190,230,0.16),transparent_42%),radial-gradient(circle_at_82%_30%,rgba(90,160,210,0.14),transparent_44%),linear-gradient(180deg,rgba(6,14,24,0.5),rgba(4,10,18,0.82))]" />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <CorePanelVisual className="absolute inset-0 opacity-62" quality="high" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(120,200,230,0.2),transparent_42%),radial-gradient(circle_at_84%_30%,rgba(90,160,210,0.16),transparent_46%),linear-gradient(180deg,rgba(5,12,22,0.5),rgba(5,10,18,0.76))]" />
      </div>

      <div className="relative z-10 flex min-h-[260px] items-end justify-end px-0 pb-3 pt-10 sm:min-h-[320px] lg:min-h-[calc(100dvh-10rem)]">
        <div className="absolute left-0 right-0 top-1 flex flex-wrap items-center gap-3">
          <span className="h-px w-8 bg-white/35" />
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/60">{t('metrics.observatory.eyebrow')}</p>
        </div>

        <div className="w-full self-start pt-8 sm:pt-9">
          <VizPanel
            title={
              <h1 id="metrics-observatory-heading" className="text-2xl font-semibold text-white sm:text-3xl">
                {t('metrics.observatory.title')}
              </h1>
            }
            subtitle={t('metrics.observatory.subtitle')}
            controls={
              <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70">
                {isLoading ? t('common.refreshing') : t('metrics.observatory.updatedLive')}
              </span>
            }
            className={embeddedPanelClass}
            bodyClassName="items-start justify-start"
          >
            <div className="w-full space-y-3">
              {error ? (
                <p className="rounded-xl border border-white/15 bg-[#0b1626]/80 px-3 py-2 text-sm text-white/80">
                  {t('common.metricsUnavailable')}
                </p>
              ) : null}

              <CycleConsoleRow
                left={
                  <div className="flex flex-wrap items-center gap-2">
                    <ConsoleAnchorItem
                      label={t('metrics.observatory.console.anchorDeterministic')}
                      value={`${data.branch.name} · ${shortSha(data.branch.commitSha, na)}`}
                      detail={t('metrics.observatory.console.anchorAge', {
                        value: formatRelativeAge(locale, data.branch.committedAt, na),
                      })}
                    />
                    <ConsoleAnchorItem
                      label={t('metrics.observatory.console.anchorCi')}
                      value={t(`ci.${data.ci.conclusion}`)}
                      detail={formatTime(locale, data.ci.createdAt, na)}
                    />
                  </div>
                }
                controls={
                  <div className="flex items-center gap-2" aria-label={t('metrics.observatory.console.window')}>
                    {WINDOW_KEYS.map((windowKey) => (
                      <Button
                        key={`console-${windowKey}`}
                        type="button"
                        size="sm"
                        variant={windowKey === selectedWindow ? 'default' : 'outline'}
                        className="px-2.5"
                        onClick={() => applyWindow(windowKey)}
                      >
                        {t(windowKey === '24h' ? 'metrics.observatory.window24h' : 'metrics.observatory.window7d')}
                      </Button>
                    ))}
                  </div>
                }
                links={
                  <div className="flex items-center gap-1.5" aria-label={t('metrics.observatory.console.evidence')}>
                    <ConsoleLink
                      href={data.repository.url}
                      label={t('metrics.observatory.console.linkRepo')}
                      unavailableReason={t('metrics.observatory.reason.noWorkflowLink')}
                      icon="↗"
                    />
                    <ConsoleLink
                      href={data.ci.url}
                      label={t('metrics.observatory.console.linkWorkflow')}
                      unavailableReason={t('metrics.observatory.reason.noWorkflowLink')}
                      icon="●"
                    />
                    <ConsoleLink
                      href={data.latestRelease?.url}
                      label={t('metrics.observatory.console.linkRelease')}
                      unavailableReason={t('metrics.observatory.reason.noReleaseYet')}
                      icon="◆"
                    />
                  </div>
                }
              />

              <div className="grid gap-3 lg:grid-cols-2">
                <PrimaryPanel title={t('metrics.observatory.panel.stability.ciHealth')}>
                  <GaugeTile
                    label={t('metrics.observatory.kpi.ciTitle')}
                    value={stats.workflowSuccessRate}
                    detail={
                      typeof workflowSuccesses === 'number'
                        ? t('metrics.observatory.kpi.ciRuns', {
                            runs: formatNumber(locale, stats.workflowRuns, na),
                            fails: formatNumber(locale, workflowFails, na),
                          })
                        : na
                    }
                    reason={
                      medianDuration
                        ? t('metrics.observatory.panel.stability.medianDuration', {
                            value: medianDuration,
                          })
                        : ciUnavailableReason
                    }
                    size={140}
                    emptyValue={na}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.12em]',
                        conclusionTone(data.ci.conclusion),
                      )}
                    >
                      {t(`ci.${data.ci.conclusion}`)}
                    </span>
                    <span className="text-xs text-white/68">
                      {t('metrics.observatory.console.anchorCreated', {
                        value: formatTime(locale, data.ci.createdAt, na),
                      })}
                    </span>
                  </div>
                  {latestStrip20.length > 0 ? (
                    <DiscreteStrip
                      label={t('metrics.observatory.panel.stability.sparklineAria')}
                      values={latestStrip20}
                    />
                  ) : (
                    <p className="text-xs text-white/62">{ciUnavailableReason}</p>
                  )}
                </PrimaryPanel>

                <PrimaryPanel title={t('metrics.observatory.panel.cost.tokenBudget')}>
                  <StatTile
                    label={t('metrics.observatory.kpi.tokensTitle')}
                    value={formatNumber(locale, stats.tokens, na)}
                    detail={t('metrics.observatory.kpi.tokensDetail', {
                      total: formatNumber(locale, data.tokens.tokensTotal, na),
                    })}
                    delta={t('metrics.observatory.kpi.updatedAt', {
                      value: formatRelativeAge(locale, data.tokens.updatedAt, na),
                    })}
                  />
                  <BudgetBar
                    label={t('metrics.observatory.panel.cost.tokenBudget')}
                    used={stats.tokens}
                    budget={indexes.tokenBudget > 0 ? indexes.tokenBudget : undefined}
                    status={t(budgetStatusKey(stats.tokens, indexes.tokenBudget))}
                    reason={t('metrics.observatory.reason.budgetNotConfigured')}
                  />
                  {tokensReason ? <p className="text-xs text-white/62">{tokensReason}</p> : null}
                </PrimaryPanel>

                <PrimaryPanel title={t('metrics.observatory.panel.cost.throughput')}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatTile
                      label={t('scoreboard.commits')}
                      value={formatNumber(locale, stats.commits, na)}
                      detail={t('metrics.observatory.panel.cost.mergedPrs', {
                        value: formatNumber(locale, stats.mergedPrs, na),
                      })}
                    />
                    <StatTile
                      label={t('metrics.observatory.panel.input.repoSignals')}
                      value={t('metrics.observatory.panel.input.openPrs', {
                        value: formatNumber(locale, data.openPullRequests, na),
                      })}
                      detail={t('metrics.observatory.panel.input.openIssues', {
                        value: formatNumber(locale, data.openIssues, na),
                      })}
                    />
                  </div>
                  {data.commitWeeklyTrend.length > 1 ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-2 py-2">
                      <TrendSparkline
                        points={data.commitWeeklyTrend}
                        ariaLabel={t('metrics.chart.activityAria')}
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-white/62">{t('metrics.observatory.reason.noSparklineData')}</p>
                  )}
                </PrimaryPanel>

                <ResearchIndicesPanel
                  title={t('metrics.observatory.panel.indicesTitle')}
                  thresholdMarks={[60, 80, 90]}
                  items={[
                    {
                      label: t('metrics.observatory.index.repro.title'),
                      value:
                        typeof indexes.reproducibility.value === 'number'
                          ? formatFixed(locale, indexes.reproducibility.value, 1, na)
                          : na,
                      delta: formatIndexDeltaText(t, locale, indexes.reproducibility.delta),
                      reason: indexes.reproducibility.reason,
                      formula: indexes.reproducibility.formula,
                    },
                    {
                      label: t('metrics.observatory.index.stability.title'),
                      value:
                        typeof indexes.stability.value === 'number'
                          ? formatFixed(locale, indexes.stability.value, 1, na)
                          : na,
                      delta: formatIndexDeltaText(t, locale, indexes.stability.delta),
                      reason: indexes.stability.reason,
                      formula: indexes.stability.formula,
                    },
                    {
                      label: t('metrics.observatory.index.cost.title'),
                      value:
                        typeof indexes.cost.value === 'number'
                          ? formatFixed(locale, indexes.cost.value, 1, na)
                          : na,
                      delta: formatIndexDeltaText(t, locale, indexes.cost.delta),
                      reason: indexes.cost.reason,
                      formula: indexes.cost.formula,
                    },
                  ]}
                />
              </div>

              <div className="space-y-2">
                <DetailsAccordion
                  title={t('metrics.observatory.details.input.title')}
                  subtitle={t('metrics.observatory.details.input.subtitle')}
                >
                  <div className="grid gap-3 lg:grid-cols-3">
                    <StatTile
                      label={t('metrics.observatory.panel.input.branchState')}
                      value={data.branch.name}
                      detail={`${shortSha(data.branch.commitSha, na)} · ${t(`ci.${data.ci.conclusion}`)}`}
                      delta={t('metrics.observatory.console.anchorCreated', {
                        value: formatTime(locale, data.branch.committedAt, na),
                      })}
                    />
                    <StatTile
                      label={t('metrics.observatory.panel.input.repoSignals')}
                      value={t('metrics.repositoryDigest', {
                        stars: formatNumber(locale, data.stars, na),
                        forks: formatNumber(locale, data.forks, na),
                        watchers: formatNumber(locale, data.watchers, na),
                      })}
                      detail={t('metrics.activityDigest', {
                        commits: formatNumber(locale, stats.commits, na),
                        merged: formatNumber(locale, stats.mergedPrs, na),
                        openPrs: formatNumber(locale, data.openPullRequests, na),
                      })}
                    />
                    <ReleaseBadge
                      label={t('scoreboard.latestReleaseTitle')}
                      value={data.latestRelease?.tag || na}
                      detail={
                        data.latestRelease?.publishedAt
                          ? formatTime(locale, data.latestRelease.publishedAt, na)
                          : undefined
                      }
                      reason={
                        data.latestRelease?.publishedAt
                          ? t('metrics.observatory.console.anchorAge', {
                              value: formatRelativeAge(locale, data.latestRelease.publishedAt, na),
                            })
                          : t('metrics.observatory.reason.noReleaseYet')
                      }
                    />
                  </div>
                </DetailsAccordion>

                <DetailsAccordion
                  title={t('metrics.observatory.details.stability.title')}
                  subtitle={t('metrics.observatory.details.stability.subtitle')}
                >
                  <div className="grid gap-3 lg:grid-cols-3">
                    <StatTile
                      label={t('metrics.observatory.panel.stability.brokenMainLabel')}
                      value={brokenMainValue}
                      detail={brokenMainReason}
                    />
                    <StatTile
                      label={t('metrics.observatory.panel.stability.medianDurationLabel')}
                      value={medianDuration || na}
                      detail={
                        latestSuccessDuration
                          ? t('metrics.observatory.console.anchorTimeToGreen', {
                              value: latestSuccessDuration,
                            })
                          : t('metrics.observatory.reason.noTimeToGreen')
                      }
                    />
                    <LatencyStat
                      label={t('metrics.observatory.details.stability.percentiles')}
                      median={na}
                      p90={na}
                      reason={t('metrics.observatory.reason.noDurationPercentiles')}
                      emptyValue={na}
                    />
                  </div>
                </DetailsAccordion>

                <DetailsAccordion
                  title={t('metrics.observatory.details.cost.title')}
                  subtitle={t('metrics.observatory.details.cost.subtitle')}
                >
                  <div className="grid gap-3 lg:grid-cols-3">
                    <StatTile
                      label={t('metrics.observatory.details.cost.tokensBreakdown')}
                      value={`${formatNumber(locale, data.tokens.tokens24h, na)} / ${formatNumber(locale, data.tokens.tokens7d, na)} / ${formatNumber(locale, data.tokens.tokensTotal, na)}`}
                      detail={t('metrics.observatory.console.anchorTokensUpdated', {
                        value: formatTime(locale, data.tokens.updatedAt, na),
                      })}
                      delta={tokensReason || t('metrics.observatory.details.cost.tokensFresh')}
                    />
                    <LatencyStat
                      label={t('metrics.observatory.panel.cost.prLeadTimeLabel')}
                      median={prLeadTime}
                      p90={undefined}
                      reason={
                        prLeadTime
                          ? t('metrics.observatory.reason.noDurationPercentiles')
                          : t('metrics.observatory.reason.insufficientMergedPrs')
                      }
                      emptyValue={na}
                    />
                    <StatTile
                      label={t('metrics.observatory.details.cost.mergedTrend')}
                      value={t('metrics.observatory.panel.cost.mergedPrs', {
                        value: formatNumber(locale, stats.mergedPrs, na),
                      })}
                      detail={t('metrics.observatory.panel.cost.commits', {
                        value: formatNumber(locale, stats.commits, na),
                      })}
                      visual={
                        data.mergedPrDailyTrend.length > 1 ? (
                          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-2 py-2">
                            <TrendSparkline
                              points={data.mergedPrDailyTrend}
                              ariaLabel={t('metrics.chart.activityAria')}
                              className="w-full"
                            />
                          </div>
                        ) : undefined
                      }
                    />
                  </div>
                  {data.mergedPrDailyTrend.length <= 1 ? (
                    <p className="text-xs text-white/62">{t('metrics.observatory.reason.noSparklineData')}</p>
                  ) : null}
                </DetailsAccordion>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/68">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t('metrics.observatory.dataSource')}</span>
                  <Link
                    href={localizeSitePath(locale, '/')}
                    className="underline decoration-white/35 underline-offset-4 hover:text-white"
                  >
                    {t('metrics.observatory.methodLink')}
                  </Link>
                </div>
              </div>
            </div>
          </VizPanel>
        </div>
      </div>
    </section>
  );
}
