import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DocsBreadcrumbs } from '@/components/docs/docs-breadcrumbs';
import { DocsNav } from '@/components/docs/docs-nav';
import { DocsSearch } from '@/components/docs/docs-search';
import { DocsSectionBlock } from '@/components/docs/docs-section';
import { DocsToc } from '@/components/docs/docs-toc';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { site } from '@/config/site';
import { docsSlugs, getDocBySlug } from '@/lib/docs-content';
import { createTranslator, defaultLocale, localizedPath, resolveLocaleParam, type Locale } from '@/lib/i18n';
import { buildPageMetadata } from '@/lib/seo';

type PageProps = {
  params?: Promise<{ locale?: string | string[]; slug?: string }>;
};

type DocsPageCopy = {
  docsLabel: string;
  backToDocs: string;
  sectionsLabel: string;
  resourcesTitle: string;
  resourcesDescription: string;
  repositoryLabel: string;
  readmeLabel: string;
  metaFallbackTitle: string;
  metaFallbackDescription: string;
};

const copy: Partial<Record<Locale, DocsPageCopy>> & { en: DocsPageCopy } = {
  en: {
    docsLabel: 'Docs',
    backToDocs: 'Back to docs',
    sectionsLabel: 'Sections',
    resourcesTitle: 'Resources',
    resourcesDescription: 'Reference material and repository.',
    repositoryLabel: 'Repository',
    readmeLabel: 'README',
    metaFallbackTitle: 'Docs',
    metaFallbackDescription:
      'Reference documentation for Animus Datalab architecture, execution model, security, and operations.',
  },
  ru: {
    docsLabel: 'Документация',
    backToDocs: 'Назад к документации',
    sectionsLabel: 'Разделы',
    resourcesTitle: 'Ресурсы',
    resourcesDescription: 'Справочные материалы и репозиторий.',
    repositoryLabel: 'Репозиторий',
    readmeLabel: 'README',
    metaFallbackTitle: 'Документация',
    metaFallbackDescription:
      'Справочная документация Animus Datalab по архитектуре, модели исполнения, безопасности и эксплуатации.',
  },
  es: {
    docsLabel: 'Documentación',
    backToDocs: 'Volver a docs',
    sectionsLabel: 'Secciones',
    resourcesTitle: 'Recursos',
    resourcesDescription: 'Material de referencia y repositorio.',
    repositoryLabel: 'Repositorio',
    readmeLabel: 'README',
    metaFallbackTitle: 'Documentación',
    metaFallbackDescription:
      'Documentación de referencia de Animus Datalab sobre arquitectura, modelo de ejecución, seguridad y operaciones.',
  },
  'zh-CN': {
    docsLabel: '文档',
    backToDocs: '返回文档',
    sectionsLabel: '章节',
    resourcesTitle: '资源',
    resourcesDescription: '参考资料与代码仓库。',
    repositoryLabel: '仓库',
    readmeLabel: 'README',
    metaFallbackTitle: '文档',
    metaFallbackDescription: 'Animus Datalab 参考文档：架构、执行模型、安全与运维。',
  },
  ja: {
    docsLabel: 'ドキュメント',
    backToDocs: 'ドキュメントへ戻る',
    sectionsLabel: 'セクション',
    resourcesTitle: 'リソース',
    resourcesDescription: '参照資料とリポジトリ。',
    repositoryLabel: 'リポジトリ',
    readmeLabel: 'README',
    metaFallbackTitle: 'ドキュメント',
    metaFallbackDescription:
      'Animus Datalab のリファレンス文書。アーキテクチャ、実行モデル、セキュリティ、運用。',
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return docsSlugs.map((slug) => ({ slug }));
}

function getLocaleOrThrow(value: string | string[] | undefined): Locale {
  if (!value) return defaultLocale;
  const resolved = resolveLocaleParam(value);
  if (!resolved) {
    notFound();
  }
  return resolved;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = (await params) ?? {};
  const locale = getLocaleOrThrow(resolvedParams.locale);
  const t = createTranslator(locale, copy);
  const slug = resolvedParams.slug ?? '';
  const page = getDocBySlug(locale, slug);
  if (!page) {
    return buildPageMetadata({
      title: t('metaFallbackTitle'),
      description: t('metaFallbackDescription'),
      path: '/docs',
      locale,
    });
  }
  return buildPageMetadata({
    title: `${page.title} - ${t('metaFallbackTitle')}`,
    description: page.description,
    path: `/docs/${page.slug}`,
    locale,
  });
}

export default async function DocsPage({ params }: PageProps) {
  const resolvedParams = (await params) ?? {};
  const locale = getLocaleOrThrow(resolvedParams.locale);
  const t = createTranslator(locale, copy);
  const slug = resolvedParams.slug ?? '';
  const page = getDocBySlug(locale, slug);
  if (!page) {
    notFound();
  }

  const tocItems = page.sections.map((section) => ({
    id: section.id,
    title: section.title,
  }));

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <DocsBreadcrumbs
            locale={locale}
            items={[{ label: t('docsLabel'), href: '/docs' }, { label: page.title }]}
          />
          <Link
            href={localizedPath(locale, '/docs')}
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/60 hover:text-white"
          >
            {t('backToDocs')}
          </Link>
        </div>
        <div className="w-full md:w-[320px]">
          <DocsSearch locale={locale} />
        </div>
      </div>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">{page.title}</h1>
        <p className="text-base text-white/80">{page.description}</p>
      </div>

      <div className="lg:hidden">
        <details className="rounded-2xl border border-white/12 bg-[#0b1626]/85 p-4 text-sm text-white/80">
          <summary className="cursor-pointer list-none text-xs uppercase tracking-[0.3em] text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1422]">
            {t('sectionsLabel')}
          </summary>
          <div className="mt-3">
            <DocsNav locale={locale} activeSlug={page.slug} />
          </div>
        </details>
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_200px]">
        <aside className="hidden lg:flex lg:flex-col lg:gap-6">
          <DocsNav locale={locale} activeSlug={page.slug} />
          <Card className="border-white/12 bg-[#0b1626]/85">
            <CardHeader>
              <CardTitle>{t('resourcesTitle')}</CardTitle>
              <CardDescription>{t('resourcesDescription')}</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6 text-sm text-white/70">
              <a
                href={site.repoUrl}
                className="block rounded-lg px-2 py-1 hover:bg-white/5 hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                {t('repositoryLabel')}
              </a>
              <a
                href={site.readmeUrl}
                className="block rounded-lg px-2 py-1 hover:bg-white/5 hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                {t('readmeLabel')}
              </a>
            </div>
          </Card>
        </aside>

        <article className="space-y-8 rounded-3xl border border-white/10 bg-[#0b1626]/85 p-6 sm:p-8">
          {page.sections.map((section) => (
            <DocsSectionBlock key={section.id} section={section} />
          ))}
        </article>

        <DocsToc items={tocItems} locale={locale} />
      </div>
    </section>
  );
}
