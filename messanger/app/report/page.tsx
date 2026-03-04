import { redirect } from 'next/navigation';

import { localizeSitePath } from '@/lib/site-locale';
import { getRequestSiteLocale } from '@/lib/site-request-locale';

export default async function ReportPage() {
  const locale = await getRequestSiteLocale();
  redirect(localizeSitePath(locale, '/'));
}
