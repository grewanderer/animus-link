import type { Metadata } from 'next';

import { MessengerApp } from '@/components/messenger/messenger-app';
import { buildSitePageMetadata } from '@/lib/site-metadata';
import { getRequestSiteLocale } from '@/lib/site-request-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestSiteLocale();
  return buildSitePageMetadata(locale, '/link', 'meta.home.title', 'meta.home.description');
}

export default function MessengerPage() {
  return <MessengerApp />;
}
