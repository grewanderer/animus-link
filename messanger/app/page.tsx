import type { Metadata } from 'next';

import { ResearchHome } from '@/components/regression/research-home';
import { getRequestSiteLocale } from '@/lib/site-request-locale';
import { buildSitePageMetadata } from '@/lib/site-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestSiteLocale();
  return buildSitePageMetadata(locale, '/', 'meta.home.title', 'meta.home.description');
}

export default function RootPage() {
  return <ResearchHome />;
}
