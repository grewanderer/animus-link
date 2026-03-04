import Link from 'next/link';

import { HomeLiveKpis } from '@/components/regression/home-live-kpis';
import { Button } from '@/components/ui/button';
import { getLiveMetricsSnapshot } from '@/lib/github-metrics';
import type { LiveMetricsSnapshot } from '@/lib/live-metrics-types';
import { regressionRepo } from '@/lib/regression-repo';
import { localizeSitePath } from '@/lib/site-locale';
import { getRequestSiteText } from '@/lib/site-text';
import { CorePanelVisual } from '@/sections/landing/core-panel-visual';

function createFallbackMetricsSnapshot(): LiveMetricsSnapshot {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    refreshIntervalSeconds: 60,
    repository: {
      owner: regressionRepo.owner,
      name: regressionRepo.repo,
      fullName: `${regressionRepo.owner}/${regressionRepo.repo}`,
      url: regressionRepo.webBase,
    },
    tokens: {
      updatedAt: now,
      tokensTotal: 0,
      tokens24h: 0,
      tokens7d: 0,
      source: 'unavailable',
    },
    stars: 0,
    forks: 0,
    watchers: 0,
    openIssues: 0,
    openPullRequests: 0,
    mergedPullRequests7d: 0,
    commits7d: 0,
    branch: {
      name: 'main',
      commitSha: '',
      committedAt: now,
      status: 'unknown',
      commitUrl: undefined,
    },
    ci: {
      workflow: '',
      conclusion: 'unknown',
      createdAt: now,
      updatedAt: now,
      latestSuccessDurationSeconds: undefined,
      url: undefined,
    },
    latestRelease: undefined,
    observatory: {
      githubReachable: false,
      tokensSchemaValid: false,
      tokensFresh: false,
      tokensAgeHours: 0,
      windows: {
        '24h': {
          tokens: 0,
          previousTokens: undefined,
          commits: 0,
          previousCommits: 0,
          mergedPrs: 0,
          previousMergedPrs: 0,
          workflowRuns: 0,
          workflowSuccessRate: undefined,
          previousWorkflowSuccessRate: undefined,
          medianWorkflowDurationSeconds: undefined,
          previousMedianWorkflowDurationSeconds: undefined,
          brokenMainMinutes: undefined,
          brokenMainReason: 'insufficient_data',
          medianPrLeadTimeHours: undefined,
          previousMedianPrLeadTimeHours: undefined,
          latestConclusions: [],
        },
        '7d': {
          tokens: 0,
          previousTokens: undefined,
          commits: 0,
          previousCommits: 0,
          mergedPrs: 0,
          previousMergedPrs: 0,
          workflowRuns: 0,
          workflowSuccessRate: undefined,
          previousWorkflowSuccessRate: undefined,
          medianWorkflowDurationSeconds: undefined,
          previousMedianWorkflowDurationSeconds: undefined,
          brokenMainMinutes: undefined,
          brokenMainReason: 'insufficient_data',
          medianPrLeadTimeHours: undefined,
          previousMedianPrLeadTimeHours: undefined,
          latestConclusions: [],
        },
      },
      config: {
        tokensFreshnessMaxHours: 24,
        tokenBudget24h: 0,
        tokenBudget7d: 0,
        workflowTargetDurationSeconds: 1800,
        prLeadTimeTargetHours: 24,
      },
    },
    commitWeeklyTrend: [],
    mergedPrDailyTrend: [],
    issues: [],
  };
}

export async function ResearchHome() {
  const { locale, t } = await getRequestSiteText();
  const initialMetrics = await getLiveMetricsSnapshot().catch(() => createFallbackMetricsSnapshot());
  const impactCards = [
    { title: 'home.impact.card.1.title', description: 'home.impact.card.1.description' },
    { title: 'home.impact.card.2.title', description: 'home.impact.card.2.description' },
    { title: 'home.impact.card.3.title', description: 'home.impact.card.3.description' },
  ];
  const phases = [
    {
      title: 'home.trajectory.phase.0.title',
      description: 'home.trajectory.phase.0.description',
    },
    {
      title: 'home.trajectory.phase.1.title',
      description: 'home.trajectory.phase.1.description',
    },
    {
      title: 'home.trajectory.phase.2.title',
      description: 'home.trajectory.phase.2.description',
    },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-12 sm:px-6 lg:px-10">
      <section className="relative overflow-hidden rounded-[30px] border border-white/8 bg-[#0b1626]/72 px-5 py-3.5 text-sm shadow-[0_18px_38px_rgba(4,10,20,0.32)] backdrop-blur-[1px] lg:min-h-[calc(100dvh-9.5rem)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(120,190,230,0.16),transparent_42%),radial-gradient(circle_at_82%_30%,rgba(90,160,210,0.14),transparent_44%),linear-gradient(180deg,rgba(6,14,24,0.5),rgba(4,10,18,0.82))]" />
        </div>
        <div className="pointer-events-none absolute inset-0">
          <CorePanelVisual className="absolute inset-0 opacity-62" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(120,200,230,0.2),transparent_42%),radial-gradient(circle_at_84%_30%,rgba(90,160,210,0.16),transparent_46%),linear-gradient(180deg,rgba(5,12,22,0.5),rgba(5,10,18,0.76))]" />
        </div>

        <div className="relative z-10 flex min-h-[260px] items-end justify-end px-0 pb-5 pt-12 sm:min-h-[320px] lg:min-h-[calc(100dvh-12rem)] lg:pb-8 lg:pt-14">
          <div className="absolute left-0 right-0 top-2 flex items-center gap-3 sm:top-3">
            <div className="flex min-w-0 items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-white/60">
              <span className="h-px w-8 bg-white/35" />
              <span className="leading-relaxed">{t('home.heroEyebrow')}</span>
            </div>
          </div>

          <div className="w-full self-start pt-0">
            <div className="space-y-4">
              <div className="max-w-5xl rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/70">{t('home.heroBadge')}</p>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="group w-fit shrink-0 gap-1.5 rounded-full border-white/20 bg-white/[0.04] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white/85 shadow-[0_8px_20px_rgba(4,10,20,0.28)] hover:border-white/45 hover:bg-white/[0.1] focus-visible:border-white/45"
                  >
                    <a
                      href={regressionRepo.webBase}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t('nav.githubAria')}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-white/[0.08] text-[10px] leading-none text-white/90"
                      >
                        ↗
                      </span>
                      <span>{t('home.githubBadge')}</span>
                    </a>
                  </Button>
                </div>
                <h1 className="mt-2 text-xl font-semibold leading-tight text-white sm:text-2xl lg:text-3xl">
                  {t('home.heroTitle')}
                </h1>
                <p className="mt-2 max-w-4xl text-sm leading-relaxed text-white/80">{t('home.heroSubtitle')}</p>
                <p className="mt-3 text-xs leading-relaxed text-white/70">{t('home.heroMeasured')}</p>
              </div>

              <div className="max-w-5xl rounded-xl border border-white/10 bg-[#0b1626]/60 px-3 py-2.5 text-xs leading-relaxed text-white/82">
                <span className="font-semibold text-white">{t('home.principleLabel')}</span>{' '}
                {t('home.principleText')}
              </div>

              <HomeLiveKpis initialMetrics={initialMetrics} locale={locale} />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">{t('home.impact.title')}</h2>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {impactCards.map((card) => (
            <div key={card.title} className="rounded-2xl border border-white/10 bg-[#0b1626]/80 p-4">
              <h3 className="text-base font-semibold text-white">{t(card.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{t(card.description)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">{t('home.trajectory.title')}</h2>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {phases.map((phase, index) => (
            <div key={phase.title} className="rounded-2xl border border-white/10 bg-[#0b1626]/80 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-white/60">{t('home.trajectory.phaseLabel', { value: index })}</p>
              <h3 className="mt-1 text-base font-semibold text-white">{t(phase.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{t(phase.description)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#0b1626]/80 p-4">
        <p className="text-sm text-white/85">{t('home.footerCall.live')}</p>
        <p className="mt-1 text-sm text-white/85">{t('home.footerCall.code')}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button asChild size="sm">
            <Link href={localizeSitePath(locale, '/metrics')}>{t('home.cta.metrics')}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={regressionRepo.webBase} target="_blank" rel="noreferrer">
              {t('home.githubBadge')}
            </a>
          </Button>
        </div>
      </section>
    </main>
  );
}
