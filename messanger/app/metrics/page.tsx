import type { Metadata } from 'next';

import { LiveMetricsDashboard } from '@/components/regression/live-metrics-dashboard';
import { getLiveMetricsSnapshot } from '@/lib/github-metrics';
import { getRequestSiteLocale } from '@/lib/site-request-locale';
import { buildSitePageMetadata } from '@/lib/site-metadata';
import { getRequestSiteText } from '@/lib/site-text';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestSiteLocale();
  return buildSitePageMetadata(locale, '/metrics', 'meta.metrics.title', 'meta.metrics.description');
}

export default async function MetricsPage() {
  const { locale } = await getRequestSiteText();
  const metrics = await getLiveMetricsSnapshot();

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-12 sm:px-6 lg:px-10">
      <LiveMetricsDashboard initialMetrics={metrics} locale={locale} />
    </main>
  );
}
