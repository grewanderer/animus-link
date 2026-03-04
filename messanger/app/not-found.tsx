import Link from 'next/link';

import { localizeSitePath } from '@/lib/site-locale';
import { getRequestSiteText } from '@/lib/site-text';

export default async function NotFound() {
  const { locale, t } = await getRequestSiteText();

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-start justify-center gap-4 px-6 py-16 text-white">
      <p className="text-xs uppercase tracking-[0.3em] text-white/50">{t('notFound.label')}</p>
      <h1 className="text-3xl font-semibold">{t('notFound.title')}</h1>
      <p className="text-white/75">{t('notFound.description')}</p>
      <Link
        href={localizeSitePath(locale, '/')}
        className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:border-white/30"
      >
        {t('notFound.cta')}
      </Link>
    </div>
  );
}
