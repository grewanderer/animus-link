import Link from 'next/link';

import {
  createTranslator,
  defaultLocale,
  localizedPath,
  resolveLocaleParam,
  type Locale,
} from '@/lib/i18n';

type Props = {
  params?: Promise<{ locale?: string | string[] }>;
};

const copy: Partial<Record<Locale, { label: string; title: string; description: string; cta: string }>> & {
  en: { label: string; title: string; description: string; cta: string };
} = {
  en: {
    label: 'Animus · 404',
    title: 'Page not found',
    description: 'The page you are looking for does not exist or has moved.',
    cta: 'Back to home',
  },
  ru: {
    label: 'Animus · 404',
    title: 'Страница не найдена',
    description: 'Страница не существует или была перемещена.',
    cta: 'На главную',
  },
  es: {
    label: 'Animus · 404',
    title: 'Página no encontrada',
    description: 'La página no existe o fue movida.',
    cta: 'Volver al inicio',
  },
  'zh-CN': {
    label: 'Animus · 404',
    title: '页面未找到',
    description: '页面不存在或已移动。',
    cta: '返回首页',
  },
  ja: {
    label: 'Animus · 404',
    title: 'ページが見つかりません',
    description: 'ページは存在しないか移動されました。',
    cta: 'ホームへ戻る',
  },
};

export default async function NotFound({ params }: Props) {
  const resolvedParams = (await params) ?? {};
  const locale = resolveLocaleParam(resolvedParams.locale) ?? defaultLocale;
  const t = createTranslator(locale, copy);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-start justify-center gap-4 px-6 py-16 text-white">
      <p className="text-xs uppercase tracking-[0.3em] text-white/50">{t('label')}</p>
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="text-white/75">{t('description')}</p>
      <Link
        href={localizedPath(locale, '/')}
        className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:border-white/30"
      >
        {t('cta')}
      </Link>
    </div>
  );
}
