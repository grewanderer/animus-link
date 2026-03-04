import { createSiteTranslator } from '@/lib/site-translations';
import { getRequestSiteLocale } from '@/lib/site-request-locale';

export async function getRequestSiteText() {
  const locale = await getRequestSiteLocale();
  const t = createSiteTranslator(locale);
  return { locale, t };
}
