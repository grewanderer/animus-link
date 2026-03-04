import { redirect } from 'next/navigation';

import { localizeSitePath } from '@/lib/site-locale';
import { getRequestSiteLocale } from '@/lib/site-request-locale';

export const dynamic = 'force-dynamic';

export default async function RunDetailRedirectPage() {
  const locale = await getRequestSiteLocale();
  redirect(localizeSitePath(locale, '/metrics'));
}
