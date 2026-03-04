import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DocsNav } from '@/components/docs/docs-nav';
import { DocsSearch } from '@/components/docs/docs-search';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { site } from '@/config/site';
import { getDocsCards } from '@/lib/docs-content';
import {
  createTranslator,
  defaultLocale,
  localizedPath,
  resolveLocaleParam,
  type Locale,
} from '@/lib/i18n';
import { buildPageMetadata } from '@/lib/seo';

type PageProps = { params?: Promise<{ locale?: string | string[] }> };

type StartHereItem = {
  label: string;
  href: string;
  note: string;
  secondary?: { label: string; href: string; joiner: string };
};

type DocsIndexCopy = {
  docsLabel: string;
  heroTitle: string;
  heroSubtitle: string;
  sectionsLabel: string;
  resourcesTitle: string;
  resourcesDescription: string;
  repositoryLabel: string;
  readmeLabel: string;
  startHereTitle: string;
  startHereDescription: string;
  startHereItems: StartHereItem[];
  atGlanceTitle: string;
  atGlanceItems: string[];
};

const metaCopy: Partial<Record<Locale, { title: string; description: string }>> & {
  en: { title: string; description: string };
} = {
  en: {
    title: 'Docs',
    description:
      'Reference documentation for Animus Datalab architecture, execution model, security, operations, and governance.',
  },
  ru: {
    title: 'Документация',
    description:
      'Справочная документация Animus Datalab по архитектуре, модели исполнения, безопасности, эксплуатации и управлению.',
  },
  es: {
    title: 'Documentación',
    description:
      'Documentación de referencia de Animus Datalab sobre arquitectura, modelo de ejecución, seguridad, operaciones y gobernanza.',
  },
  'zh-CN': {
    title: '文档',
    description: 'Animus Datalab 参考文档：架构、执行模型、安全、运维与治理。',
  },
  ja: {
    title: 'ドキュメント',
    description:
      'Animus Datalab のリファレンス文書。アーキテクチャ、実行モデル、セキュリティ、運用、ガバナンスを収録。',
  },
};

const copy: Partial<Record<Locale, DocsIndexCopy>> & { en: DocsIndexCopy } = {
  en: {
    docsLabel: 'Docs',
    heroTitle: 'Documentation',
    heroSubtitle:
      'Reference documentation for Animus Datalab system definition, architecture, execution model, security, operations, and acceptance criteria.',
    sectionsLabel: 'Sections',
    resourcesTitle: 'Resources',
    resourcesDescription: 'Reference material and repository.',
    repositoryLabel: 'Repository',
    readmeLabel: 'README',
    startHereTitle: 'Start here',
    startHereDescription: 'Suggested reading order for new teams.',
    startHereItems: [
      {
        label: 'Overview',
        href: '/docs/overview',
        note: ' for scope and system boundaries.',
      },
      {
        label: 'System Definition',
        href: '/docs/system-definition',
        note: ' for invariants and explicit context requirements.',
      },
      {
        label: 'Architecture',
        href: '/docs/architecture',
        note: ' for plane separation and execution semantics.',
        secondary: { label: 'Execution Model', href: '/docs/execution-model', joiner: ' and ' },
      },
      {
        label: 'Security',
        href: '/docs/security',
        note: ' for RBAC, audit, isolation, and operational controls.',
        secondary: { label: 'Operations', href: '/docs/operations', joiner: ' and ' },
      },
    ],
    atGlanceTitle: 'At a glance',
    atGlanceItems: [
      'Control Plane / Data Plane separation',
      'Run reproducibility inputs (DatasetVersion, CodeRef, EnvironmentLock)',
      'On-prem, private cloud, and air-gapped deployments',
    ],
  },
  ru: {
    docsLabel: 'Документация',
    heroTitle: 'Документация',
    heroSubtitle:
      'Справочная документация Animus Datalab по определению системы, архитектуре, модели исполнения, безопасности, эксплуатации и критериям готовности.',
    sectionsLabel: 'Разделы',
    resourcesTitle: 'Ресурсы',
    resourcesDescription: 'Справочные материалы и репозиторий.',
    repositoryLabel: 'Репозиторий',
    readmeLabel: 'README',
    startHereTitle: 'Начните здесь',
    startHereDescription: 'Рекомендуемый порядок чтения для новых команд.',
    startHereItems: [
      {
        label: 'Обзор',
        href: '/docs/overview',
        note: ' для определения области и границ системы.',
      },
      {
        label: 'Определение системы',
        href: '/docs/system-definition',
        note: ' для инвариантов и требований явного контекста.',
      },
      {
        label: 'Архитектура',
        href: '/docs/architecture',
        note: ' для разделения плоскостей и семантики исполнения.',
        secondary: { label: 'Модель исполнения', href: '/docs/execution-model', joiner: ' и ' },
      },
      {
        label: 'Безопасность',
        href: '/docs/security',
        note: ' по RBAC, аудиту, изоляции и эксплуатации.',
        secondary: { label: 'Эксплуатация', href: '/docs/operations', joiner: ' и ' },
      },
    ],
    atGlanceTitle: 'Коротко',
    atGlanceItems: [
      'Разделение Control Plane и Data Plane',
      'Входы воспроизводимости Run (DatasetVersion, CodeRef, EnvironmentLock)',
      'On-prem, private cloud и air-gapped развёртывания',
    ],
  },
  es: {
    docsLabel: 'Documentación',
    heroTitle: 'Documentación',
    heroSubtitle:
      'Documentación de referencia de Animus Datalab: definición del sistema, arquitectura, modelo de ejecución, seguridad, operaciones y criterios de aceptación.',
    sectionsLabel: 'Secciones',
    resourcesTitle: 'Recursos',
    resourcesDescription: 'Material de referencia y repositorio.',
    repositoryLabel: 'Repositorio',
    readmeLabel: 'README',
    startHereTitle: 'Empieza aquí',
    startHereDescription: 'Orden de lectura sugerido para equipos nuevos.',
    startHereItems: [
      {
        label: 'Resumen',
        href: '/docs/overview',
        note: ' para alcance y límites del sistema.',
      },
      {
        label: 'Definición del sistema',
        href: '/docs/system-definition',
        note: ' para invariantes y contexto explícito.',
      },
      {
        label: 'Arquitectura',
        href: '/docs/architecture',
        note: ' para separación de planos y semántica de ejecución.',
        secondary: { label: 'Modelo de ejecución', href: '/docs/execution-model', joiner: ' y ' },
      },
      {
        label: 'Seguridad',
        href: '/docs/security',
        note: ' para RBAC, auditoría, aislamiento y operaciones.',
        secondary: { label: 'Operaciones', href: '/docs/operations', joiner: ' y ' },
      },
    ],
    atGlanceTitle: 'De un vistazo',
    atGlanceItems: [
      'Separación Control Plane / Data Plane',
      'Entradas de reproducibilidad Run (DatasetVersion, CodeRef, EnvironmentLock)',
      'Despliegues on-prem, nube privada y air-gapped',
    ],
  },
  'zh-CN': {
    docsLabel: '文档',
    heroTitle: '文档',
    heroSubtitle:
      'Animus Datalab 参考文档：系统定义、架构、执行模型、安全、运维与验收标准。',
    sectionsLabel: '章节',
    resourcesTitle: '资源',
    resourcesDescription: '参考资料与代码仓库。',
    repositoryLabel: '仓库',
    readmeLabel: 'README',
    startHereTitle: '从这里开始',
    startHereDescription: '适用于新团队的建议阅读顺序。',
    startHereItems: [
      { label: '概览', href: '/docs/overview', note: '，用于理解范围与系统边界。' },
      { label: '系统定义', href: '/docs/system-definition', note: '，用于理解不变量与显式上下文要求。' },
      {
        label: '架构',
        href: '/docs/architecture',
        note: '，用于理解平面分离与执行语义。',
        secondary: { label: '执行模型', href: '/docs/execution-model', joiner: ' 与 ' },
      },
      {
        label: '安全',
        href: '/docs/security',
        note: '，用于理解 RBAC、审计、隔离与运营控制。',
        secondary: { label: '运维', href: '/docs/operations', joiner: ' 与 ' },
      },
    ],
    atGlanceTitle: '速览',
    atGlanceItems: [
      'Control Plane / Data Plane 分离',
      'Run 可复现输入（DatasetVersion、CodeRef、EnvironmentLock）',
      '支持 on-prem、私有云、air-gapped 部署',
    ],
  },
  ja: {
    docsLabel: 'ドキュメント',
    heroTitle: 'ドキュメント',
    heroSubtitle:
      'Animus Datalab のリファレンス文書。システム定義、アーキテクチャ、実行モデル、セキュリティ、運用、受入条件を扱います。',
    sectionsLabel: 'セクション',
    resourcesTitle: 'リソース',
    resourcesDescription: '参照資料とリポジトリ。',
    repositoryLabel: 'リポジトリ',
    readmeLabel: 'README',
    startHereTitle: 'まず読む',
    startHereDescription: '新規チーム向けの推奨読書順です。',
    startHereItems: [
      { label: '概要', href: '/docs/overview', note: ' で範囲と境界を確認。' },
      { label: 'システム定義', href: '/docs/system-definition', note: ' で不変条件と明示コンテキスト要件を確認。' },
      {
        label: 'アーキテクチャ',
        href: '/docs/architecture',
        note: ' で平面分離と実行意味論を確認。',
        secondary: { label: '実行モデル', href: '/docs/execution-model', joiner: ' と ' },
      },
      {
        label: 'セキュリティ',
        href: '/docs/security',
        note: ' で RBAC、監査、分離、運用制御を確認。',
        secondary: { label: '運用', href: '/docs/operations', joiner: ' と ' },
      },
    ],
    atGlanceTitle: '要点',
    atGlanceItems: [
      'Control Plane / Data Plane の分離',
      'Run 再現入力（DatasetVersion、CodeRef、EnvironmentLock）',
      'on-prem、プライベートクラウド、air-gapped への対応',
    ],
  },
};

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
  const meta = metaCopy[locale] ?? metaCopy.en;
  return buildPageMetadata({ ...meta, path: '/docs', locale });
}

export default async function DocsIndexPage({ params }: PageProps) {
  const resolvedParams = (await params) ?? {};
  const locale = getLocaleOrThrow(resolvedParams.locale);
  const t = createTranslator(locale, copy);
  const docsCards = getDocsCards(locale);
  return (
    <section className="space-y-12">
      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_220px]">
        <aside className="hidden lg:flex lg:flex-col lg:gap-4">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60">{t('sectionsLabel')}</div>
          <DocsNav locale={locale} />
        </aside>

        <div className="space-y-10">
          <header className="space-y-4">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">{t('docsLabel')}</div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">{t('heroTitle')}</h1>
            <p className="max-w-2xl text-base text-white/85 sm:text-lg">{t('heroSubtitle')}</p>
          </header>

          <DocsSearch locale={locale} className="max-w-2xl" />

          <div className="rounded-2xl border border-white/12 bg-[#0b1626]/90 p-5 text-sm text-white/85 sm:p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">{t('startHereTitle')}</div>
            <p className="mt-2 text-sm text-white/80">{t('startHereDescription')}</p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-white/85">
              {t('startHereItems').map((item) => (
                <li key={item.href}>
                  <Link href={localizedPath(locale, item.href)} className="underline decoration-white/40 underline-offset-4">
                    {item.label}
                  </Link>
                  {item.secondary ? (
                    <>
                      {item.secondary.joiner}
                      <Link
                        href={localizedPath(locale, item.secondary.href)}
                        className="underline decoration-white/40 underline-offset-4"
                      >
                        {item.secondary.label}
                      </Link>
                      {item.note}
                    </>
                  ) : (
                    item.note
                  )}
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {docsCards.map((card) => (
              <Link
                key={card.slug}
                href={localizedPath(locale, `/docs/${card.slug}`)}
                className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1422]"
              >
                <Card className="h-full border-white/12 bg-[#0b1626]/90 p-6 shadow-none backdrop-blur-none transition hover:border-white/30 hover:bg-[#0b1626]/95">
                  <CardHeader className="mb-0">
                    <CardTitle className="flex items-center justify-between">
                      <span>{card.title}</span>
                      <span
                        aria-hidden="true"
                        className="text-white/40 transition group-hover:text-white/70"
                      >
                        →
                      </span>
                    </CardTitle>
                    <CardDescription className="text-white/70">{card.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>

          <div className="lg:hidden">
            <details className="rounded-2xl border border-white/12 bg-[#0b1626]/85 p-4 text-sm text-white/80">
              <summary className="cursor-pointer list-none text-xs uppercase tracking-[0.3em] text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1422]">
                {t('sectionsLabel')}
              </summary>
              <div className="mt-3">
                <DocsNav locale={locale} />
              </div>
            </details>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-white/12 bg-[#0b1626]/90 p-4 text-sm text-white/80">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">{t('atGlanceTitle')}</div>
            <ul className="mt-3 space-y-2 text-white/80">
              {t('atGlanceItems').map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/12 bg-[#0b1626]/90 p-4 text-sm text-white/80">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">{t('resourcesTitle')}</div>
            <p className="mt-2 text-sm text-white/75">{t('resourcesDescription')}</p>
            <div className="mt-3 space-y-2">
              <a
                href={site.repoUrl}
                className="block rounded-lg px-2 py-1 text-white/80 hover:bg-white/5 hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                {t('repositoryLabel')}
              </a>
              <a
                href={site.readmeUrl}
                className="block rounded-lg px-2 py-1 text-white/80 hover:bg-white/5 hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                {t('readmeLabel')}
              </a>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
