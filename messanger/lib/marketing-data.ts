import { site } from '@/config/site';
import { type Locale } from './i18n';

type NavItem = {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
};
type HeroMetric = { label: string; value: string; detail: string };

type Dataset = {
  marketingNav: NavItem[];
  heroMetrics: HeroMetric[];
  partnerLogos: string[];
};

const datasets: Partial<Record<Locale, Dataset>> & { en: Dataset } = {
  en: {
    marketingNav: [
      { label: 'For whom', href: '#problems' },
      { label: 'Project goals', href: '#outcomes' },
      { label: 'How it works', href: '#managed-execution' },
      { label: 'Workflows', href: '#workflows' },
      { label: 'Integration', href: '#trust' },
      { label: 'Repository', href: site.repoUrl },
      { label: 'Contact', href: '#contact' },
    ],
    heroMetrics: [
      {
        label: 'Execution unit',
        value: 'Run',
        detail: 'Defined by DatasetVersion, CodeRef, EnvironmentLock',
      },
      {
        label: 'Deployment models',
        value: 'Single / multi-cluster',
        detail: 'On-prem, private cloud, air-gapped',
      },
      { label: 'Audit', value: 'Append-only', detail: 'Exportable AuditEvent' },
    ],
    partnerLogos: ['Control Plane', 'Data Plane', 'Run', 'AuditEvent'],
  },
  ru: {
    marketingNav: [
      { label: 'Для кого', href: '#problems' },
      { label: 'Цели проекта', href: '#outcomes' },
      { label: 'Как работает', href: '#managed-execution' },
      { label: 'Сценарии', href: '#workflows' },
      { label: 'Интеграция', href: '#trust' },
      { label: 'Репозиторий', href: site.repoUrl },
      { label: 'Контакт', href: '#contact' },
    ],
    heroMetrics: [
      {
        label: 'Единица исполнения',
        value: 'Run',
        detail: 'DatasetVersion, CodeRef, EnvironmentLock',
      },
      {
        label: 'Модели развёртывания',
        value: 'Single / multi-cluster',
        detail: 'On-prem, private cloud, air-gapped',
      },
      { label: 'Аудит', value: 'Append-only', detail: 'Exportable AuditEvent' },
    ],
    partnerLogos: ['Control Plane', 'Data Plane', 'Run', 'AuditEvent'],
  },
  es: {
    marketingNav: [
      { label: 'Para quién', href: '#problems' },
      { label: 'Objetivos del proyecto', href: '#outcomes' },
      { label: 'Cómo funciona', href: '#managed-execution' },
      { label: 'Workflows', href: '#workflows' },
      { label: 'Integración', href: '#trust' },
      { label: 'Repositorio', href: site.repoUrl },
      { label: 'Contacto', href: '#contact' },
    ],
    heroMetrics: [
      {
        label: 'Unidad de ejecución',
        value: 'Run',
        detail: 'DatasetVersion, CodeRef, EnvironmentLock',
      },
      {
        label: 'Modelos de despliegue',
        value: 'Single / multi-cluster',
        detail: 'On-prem, nube privada, air-gapped',
      },
      { label: 'Auditoría', value: 'Append-only', detail: 'Exportable AuditEvent' },
    ],
    partnerLogos: ['Control Plane', 'Data Plane', 'Run', 'AuditEvent'],
  },
  'zh-CN': {
    marketingNav: [
      { label: '适用对象', href: '#problems' },
      { label: '项目目标', href: '#outcomes' },
      { label: '运行方式', href: '#managed-execution' },
      { label: '工作流', href: '#workflows' },
      { label: '集成', href: '#trust' },
      { label: '仓库', href: site.repoUrl },
      { label: '联系', href: '#contact' },
    ],
    heroMetrics: [
      {
        label: '执行单元',
        value: 'Run',
        detail: '由 DatasetVersion、CodeRef、EnvironmentLock 定义',
      },
      {
        label: '部署模型',
        value: 'Single / multi-cluster',
        detail: 'On-prem、私有云、air-gapped',
      },
      { label: '审计', value: 'Append-only', detail: '可导出 AuditEvent' },
    ],
    partnerLogos: ['Control Plane', 'Data Plane', 'Run', 'AuditEvent'],
  },
  ja: {
    marketingNav: [
      { label: '対象', href: '#problems' },
      { label: 'プロジェクト目標', href: '#outcomes' },
      { label: '実行モデル', href: '#managed-execution' },
      { label: 'ワークフロー', href: '#workflows' },
      { label: '統合', href: '#trust' },
      { label: 'リポジトリ', href: site.repoUrl },
      { label: '連絡', href: '#contact' },
    ],
    heroMetrics: [
      {
        label: '実行単位',
        value: 'Run',
        detail: 'DatasetVersion、CodeRef、EnvironmentLock で定義',
      },
      {
        label: 'デプロイモデル',
        value: 'Single / multi-cluster',
        detail: 'On-prem、プライベートクラウド、air-gapped',
      },
      { label: '監査', value: 'Append-only', detail: 'Exportable AuditEvent' },
    ],
    partnerLogos: ['Control Plane', 'Data Plane', 'Run', 'AuditEvent'],
  },
};

export function getMarketingData(locale: Locale = 'en'): Dataset {
  return datasets[locale] ?? datasets.en;
}
