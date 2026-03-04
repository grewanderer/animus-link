import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MarketingHero } from '@/sections/landing/hero';
import { ContactForm } from '@/sections/landing/contact-form';
import { EmailLink } from '@/sections/landing/email-link';
import { MarketingSection } from '@/sections/landing/section';
import { MarketingNav } from '@/sections/landing/marketing-nav';
import { MobileNav } from '@/sections/landing/mobile-nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CONTACT_EMAIL } from '@/lib/contact';
import {
  createTranslator,
  defaultLocale,
  resolveLocaleParam,
  localizedPath,
  type Locale,
} from '@/lib/i18n';
import { buildPageMetadata } from '@/lib/seo';

type PageProps = { params?: Promise<{ locale?: string | string[] }> };

const metaCopy: Partial<Record<Locale, { title: string; description: string }>> & {
  en: { title: string; description: string };
} = {
  en: {
    title: 'Animus',
    description:
      'Enterprise ML laboratory for reproducible research, controlled environments, and long-term collaboration continuity.',
  },
  ru: {
    title: 'Animus',
    description:
      'Корпоративная лаборатория воспроизводимых ML-исследований, контролируемых сред и непрерывности сотрудничества.',
  },
  es: {
    title: 'Animus',
    description:
      'Laboratorio ML empresarial para investigación reproducible, entornos controlados y continuidad de colaboración.',
  },
  'zh-CN': {
    title: 'Animus',
    description: '面向可复现实验、受控环境与长期协作连续性的企业级 ML 实验室。',
  },
  ja: {
    title: 'Animus',
    description:
      '再現可能な研究、統制された環境、長期的な協業継続性のためのエンタープライズ ML ラボラトリー。',
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
  return buildPageMetadata({ ...meta, path: '/', locale });
}

type WorkflowGroup = { title: string; description: string; items: string[] };
type CtaPath = { title: string; description: string; action: string };
type OutcomeItem = {
  title: string;
  description: string;
  label: string;
  bullets: string[];
};
type ProblemsItem = { title: string; description: string };
type TrustItem = { title: string; description: string; note: string };
type HowStep = { title: string; description: string };

type Copy = {
  problemsEyebrow: string;
  problemsTitle: string;
  problemsSubtitle: string;
  problemsItems: ProblemsItem[];
  outcomesEyebrow: string;
  outcomesTitle: string;
  outcomesSubtitle: string;
  outcomesItems: OutcomeItem[];
  howEyebrow: string;
  howTitle: string;
  howSubtitle: string;
  howStepsTitle: string;
  howSteps: HowStep[];
  howOutcomeTitle: string;
  howOutcomeBullets: string[];
  workflowsEyebrow: string;
  workflowsTitle: string;
  workflowsSubtitle: string;
  workflows: WorkflowGroup[];
  trustEyebrow: string;
  trustTitle: string;
  trustLead: string;
  trustItems: TrustItem[];
  trustCtaText: string;
  trustCtaPrimary: string;
  trustCtaSecondary: string;
  ctaEyebrow: string;
  ctaTitle: string;
  ctaSubtitle: string;
  ctaPaths: CtaPath[];
  contactEyebrow: string;
  contactTitle: string;
  contactSubtitle: string;
  contactBullets: string[];
  contactEmailLabel: string;
  contactNextTitle: string;
  contactNextDescription: string;
};

const copy: Partial<Record<Locale, Copy>> & { en: Copy } = {
  en: {
    problemsEyebrow: 'For whom',
    problemsTitle: 'Animus is used in organizations where it is critical:',
    problemsSubtitle: '',
    problemsItems: [
      {
        title: 'Preserving scientific value',
        description:
          'Research results must remain reproducible, interpretable, and reusable, passing the test of time.',
      },
      {
        title: 'Verifiability and trust',
        description:
          'Obtained results must be verifiable, confirmable, and resilient to audit and external review.',
      },
      {
        title: 'Work under enterprise constraints',
        description:
          'ML development operates in an environment with security, compliance, and controlled-access requirements.',
      },
    ],
    outcomesEyebrow: 'Project goals',
    outcomesTitle: 'Core tasks solved by Animus',
    outcomesSubtitle:
      'Infrastructure and research requirements define the development environment.',
    outcomesItems: [
      {
        title: 'Formal reproducibility of results',
        description:
          'Animus fixes the context of each run as a mandatory execution condition:\nversions of data, code, environment, and active policies.',
        label: 'This allows:',
        bullets: [
          'reproduce results over time;',
          'confirm experiment correctness;',
          'reuse accumulated research without losing context.',
        ],
      },
      {
        title: 'Working environment without violating enterprise requirements',
        description:
          'Animus provides interactive and batch work environments\nwithout bypassing security and access-control requirements.',
        label: 'This allows:',
        bullets: [
          'work with code and data in a governed environment;',
          'exclude non-auditable actions;',
          'maintain compliance with internal and external regulatory requirements.',
        ],
      },
      {
        title: 'Unified collaborative environment',
        description:
          'Animus creates a unified space for researchers and engineers,\nwhere results retain context, interpretability, and quality\nwhen transferred across teams and project stages.',
        label: 'This reduces:',
        bullets: [
          'loss of knowledge between R&D and production;',
          'dependency on specific individuals;',
          'risk of result degradation during scaling.',
        ],
      },
    ],
    howEyebrow: 'Execution model',
    howTitle: 'Animus operates as a managed execution contour',
    howSubtitle:
      'Run context is fixed in advance, execution occurs in a controlled environment, and results are stored with a verifiable history.',
    howStepsTitle: 'Execution contour',
    howSteps: [
      {
        title: 'Run context fixation',
        description:
          'Versions of data, code, environment, and active policies are set before execution.',
      },
      {
        title: 'Controlled execution',
        description:
          'Runs operate under corporate constraints for access, network, and secrets.',
      },
      {
        title: 'Verifiable results',
        description:
          'Artifacts and events are available for analysis, reproduction, and audit.',
      },
    ],
    howOutcomeTitle: 'What the organization gets',
    howOutcomeBullets: [
      'reproducibility of results over time without loss of context;',
      'verifiability of experiment correctness and artifact provenance;',
      'embedding the laboratory into existing infrastructure (IdP, storage, SIEM) without bypass contours.',
    ],
    workflowsEyebrow: 'Capabilities by workflow',
    workflowsTitle: 'Functions are organized by operational workflows',
    workflowsSubtitle:
      'Capabilities are defined through operational workflows and fixed constraints.',
    workflows: [
      {
        title: 'Runs and pipelines',
        description: 'Deterministic execution, retries, and orchestration.',
        items: [
          'Run specifications with idempotent creation and explicit inputs.',
          'PipelineRun as a DAG with maxParallelism control and safe cancellation.',
        ],
      },
      {
        title: 'Datasets and artifacts',
        description: 'Immutable data versions and traceable artifacts.',
        items: [
          'DatasetVersion is immutable and lineage-ready.',
          'Artifacts with checksums and controlled download access.',
        ],
      },
      {
        title: 'DevEnvs (VS Code IDE)',
        description: 'Managed developer environments without loss of governance.',
        items: [
          'IDE sessions follow the same governance model as production Run.',
          'Access only via a proxy with TTL.',
        ],
      },
      {
        title: 'Model registry',
        description: 'Verifiable model lifecycle and export control.',
        items: [
          'Version states: draft → validated → approved → deprecated.',
          'Export is deny-by-default, only via approval.',
        ],
      },
      {
        title: 'Governance and audit (SIEM)',
        description: 'End-to-end audit, export, and operational transparency.',
        items: [
          'Append-only audit for all critical operations.',
          'Export to SIEM (webhook/syslog) with DLQ and replay.',
        ],
      },
    ],
    trustEyebrow: 'Integration',
    trustTitle: 'Enterprise-standard by default',
    trustLead:
      'Security, audit, and deployment guarantees are defined as operational constraints.',
    trustItems: [
      {
        title: 'Closed contours and on-prem',
        description:
          'Deployment in private cloud and isolated environments without loss of control and evidence base.',
        note: 'Including air-gapped scenarios.',
      },
      {
        title: 'Audit and evidence',
        description:
          'Critical actions and access to results are recorded in immutable history suitable for verification and export.',
        note: 'SIEM integration via event delivery.',
      },
      {
        title: 'Deny-by-default access',
        description:
          'Access to data and operations is defined by roles and policies; any exceptions must be explicitly allowed.',
        note: 'No hidden bypass paths.',
      },
    ],
    trustCtaText:
      'If reproducibility and control over ML development in the corporate contour are required, request a technical walkthrough.',
    trustCtaPrimary: 'Request technical walkthrough',
    trustCtaSecondary: 'Read documentation',
    ctaEyebrow: '',
    ctaTitle: '',
    ctaSubtitle: '',
    ctaPaths: [],
    contactEyebrow: 'Contact',
    contactTitle: 'Request technical walkthrough',
    contactSubtitle: 'Provide operational context and security requirements.',
    contactBullets: [
      'Describe the deployment contour and compliance constraints.',
      'List mandatory integrations and external dependencies.',
      'Confirm Run inputs and audit requirements.',
    ],
    contactEmailLabel: 'Or email',
    contactNextTitle: 'Next steps',
    contactNextDescription:
      'Architecture and security alignment based on the documentation.',
  },
  ru: {
    problemsEyebrow: 'Для кого',
    problemsTitle: 'Animus используется в организациях, где критично:',
    problemsSubtitle: '',
    problemsItems: [
      {
        title: 'Сохранение научной ценности',
        description:
          'Результаты исследований должны оставаться воспроизводимыми, интерпретируемыми и пригодными для повторного использования, проходя проверку временем.',
      },
      {
        title: 'Проверяемость и доверие',
        description:
          'Полученные результаты должны иметь подтверждаемое происхождение, формальную историю изменений и быть пригодными для внутреннего и внешнего аудита.',
      },
      {
        title: 'Работа в условиях корпоративных ограничений',
        description:
          'ML-разработка должна выполняться в среде с заданными требованиями безопасности, комплаенса и контроля доступа без упрощения или обхода существующих ограничений.',
      },
    ],
    outcomesEyebrow: 'Цели проекта',
    outcomesTitle: 'Основные задачи, которые решает Animus',
    outcomesSubtitle:
      'Инфраструктурные и исследовательские требования формируют среду разработки.',
    outcomesItems: [
      {
        title: 'Формальная воспроизводимость результатов',
        description:
          'Animus фиксирует контекст каждого запуска как обязательное условие исполнения:\nверсии данных, код, окружение и действующие политики.',
        label: 'Это позволяет:',
        bullets: [
          'воспроизводить результаты спустя время;',
          'подтверждать корректность экспериментов;',
          'использовать накопленные исследования повторно без утраты контекста.',
        ],
      },
      {
        title: 'Рабочая среда без нарушения корпоративных требований',
        description:
          'Animus предоставляет интерактивную и batch-среду работы\nбез обхода требований безопасности и контроля доступа.',
        label: 'Это позволяет:',
        bullets: [
          'работать с кодом и данными в управляемой среде;',
          'исключать неаудируемые действия;',
          'сохранять соответствие внутренним и внешним регуляторным требованиям.',
        ],
      },
      {
        title: 'Единая среда совместной работы',
        description:
          'Animus создаёт единое пространство взаимодействия исследователей и инженеров,\nв котором результаты исследований сохраняют контекст, интерпретируемость и качество\nпри передаче между командами и стадиями проектов.',
        label: 'Это снижает:',
        bullets: [
          'потери знаний между R&D и production;',
          'зависимость от конкретных исполнителей;',
          'риск деградации результатов при масштабировании.',
        ],
      },
    ],
    howEyebrow: 'Модель исполнения',
    howTitle: 'Animus работает как управляемый контур исполнения',
    howSubtitle:
      'Контекст запуска фиксируется заранее, исполнение проходит в контролируемой среде, результаты сохраняются с проверяемой историей.',
    howStepsTitle: 'Контур исполнения',
    howSteps: [
      {
        title: 'Фиксация контекста запуска',
        description:
          'Версии данных, код, окружение и действующие политики задаются до исполнения.',
      },
      {
        title: 'Контролируемое исполнение',
        description:
          'Запуск выполняется в корпоративных ограничениях доступа, сети и секретов.',
      },
      {
        title: 'Проверяемые результаты',
        description:
          'Артефакты и события доступны для анализа, воспроизведения и аудита.',
      },
    ],
    howOutcomeTitle: 'Что получает организация',
    howOutcomeBullets: [
      'воспроизводимость результатов спустя время без утраты контекста;',
      'проверяемость корректности экспериментов и происхождения артефактов;',
      'встраивание лаборатории в существующую инфраструктуру (IdP, хранилище, SIEM) без обходных контуров.',
    ],
    workflowsEyebrow: 'Возможности по workflow',
    workflowsTitle: 'Функции организованы по рабочим сценариям',
    workflowsSubtitle:
      'Возможности заданы через операционные сценарии и фиксированные ограничения.',
    workflows: [
      {
        title: 'Запуски и пайплайны',
        description: 'Детерминированное исполнение, ретраи и оркестрация.',
        items: [
          'Run‑спецификации с идемпотентным созданием и явными входами.',
          'PipelineRun как DAG с контролем maxParallelism и безопасной отменой.',
        ],
      },
      {
        title: 'Датасеты и артефакты',
        description: 'Неизменяемые версии данных и трассируемые артефакты.',
        items: [
          'DatasetVersion неизменяема и пригодна для lineage.',
          'Артефакты с контрольными суммами и контролем скачивания.',
        ],
      },
      {
        title: 'DevEnvs (VS Code IDE)',
        description: 'Управляемые среды разработчика без потери governance.',
        items: [
          'IDE‑сессии работают под той же моделью governance, что и production‑Run.',
          'Доступ только через прокси с TTL.',
        ],
      },
      {
        title: 'Реестр моделей',
        description: 'Проверяемый жизненный цикл моделей и контроль экспорта.',
        items: [
          'Статусы версии: draft → validated → approved → deprecated.',
          'Экспорт — deny‑by‑default, только через approval.',
        ],
      },
      {
        title: 'Управление и аудит (SIEM)',
        description: 'Сквозной аудит, экспорт и операционная прозрачность.',
        items: [
          'Append‑only аудит для всех критичных операций.',
          'Экспорт в SIEM (webhook/syslog) с DLQ и replay.',
        ],
      },
    ],
    trustEyebrow: 'Интеграция',
    trustTitle: 'Enterprise‑стандарт по умолчанию',
    trustLead:
      'Гарантии безопасности, аудита и развёртывания заданы как операционные ограничения.',
    trustItems: [
      {
        title: 'Закрытые контуры и on-prem',
        description:
          'Развёртывание в private cloud и изолированных средах без потери управляемости и доказательной базы.',
        note: 'Включая сценарии air-gapped.',
      },
      {
        title: 'Аудит и доказательства',
        description:
          'Критичные действия и доступ к результатам фиксируются в неизменяемой истории, пригодной для проверки и экспорта.',
        note: 'Интеграция с SIEM — через поставку событий.',
      },
      {
        title: 'Deny-by-default доступ',
        description:
          'Доступ к данным и операциям задаётся ролями и политиками; любые исключения должны быть явно разрешены.',
        note: 'Без ‘скрытых’ путей обхода.',
      },
    ],
    trustCtaText:
      'Если нужно обеспечить воспроизводимость исследований и сохранить контроль над ML-разработкой в корпоративном контуре — запросите технический разбор.',
    trustCtaPrimary: 'Запросить технический разбор',
    trustCtaSecondary: 'Читать документацию',
    ctaEyebrow: '',
    ctaTitle: '',
    ctaSubtitle: '',
    ctaPaths: [],
    contactEyebrow: 'Контакт',
    contactTitle: 'Запросить технический разбор',
    contactSubtitle:
      'Укажите операционный контекст и требования безопасности.',
    contactBullets: [
      'Опишите контур развёртывания и ограничения комплаенса.',
      'Перечислите обязательные интеграции и внешние зависимости.',
      'Подтвердите входы Run и требования к аудиту.',
    ],
    contactEmailLabel: 'Или email',
    contactNextTitle: 'Дальнейшие шаги',
    contactNextDescription:
      'Архитектурная и security‑согласованность на базе документации.',
  },
  es: {
    problemsEyebrow: 'Para quién',
    problemsTitle: 'Animus se utiliza en organizaciones donde es crítico:',
    problemsSubtitle: '',
    problemsItems: [
      {
        title: 'Preservación del valor científico',
        description:
          'Los resultados de investigación deben mantenerse reproducibles, interpretables y reutilizables, superando la prueba del tiempo.',
      },
      {
        title: 'Verificabilidad y confianza',
        description:
          'Los resultados obtenidos deben ser verificables, confirmables y resistentes a auditoría y revisión externa.',
      },
      {
        title: 'Trabajo bajo restricciones corporativas',
        description:
          'El desarrollo de ML se realiza en un entorno con requisitos de seguridad, cumplimiento y acceso controlado.',
      },
    ],
    outcomesEyebrow: 'Objetivos del proyecto',
    outcomesTitle: 'Tareas principales que resuelve Animus',
    outcomesSubtitle:
      'Los requisitos de infraestructura e investigación determinan el entorno de desarrollo.',
    outcomesItems: [
      {
        title: 'Reproducibilidad formal de resultados',
        description:
          'Animus fija el contexto de cada ejecución como condición obligatoria:\nversiones de datos, código, entorno y políticas vigentes.',
        label: 'Esto permite:',
        bullets: [
          'reproducir resultados con el tiempo;',
          'confirmar la corrección de los experimentos;',
          'reutilizar investigación acumulada sin pérdida de contexto.',
        ],
      },
      {
        title: 'Entorno de trabajo sin violar requisitos corporativos',
        description:
          'Animus proporciona trabajo interactivo y batch\nsin eludir requisitos de seguridad y control de acceso.',
        label: 'Esto permite:',
        bullets: [
          'trabajar con código y datos en un entorno gobernado;',
          'excluir acciones no auditables;',
          'mantener cumplimiento de requisitos regulatorios internos y externos.',
        ],
      },
      {
        title: 'Entorno unificado de colaboración',
        description:
          'Animus crea un espacio unificado para investigadores e ingenieros,\ndonde los resultados mantienen contexto, interpretabilidad y calidad\nal transferirse entre equipos y etapas de proyecto.',
        label: 'Esto reduce:',
        bullets: [
          'pérdida de conocimiento entre I+D y producción;',
          'dependencia de personas específicas;',
          'riesgo de degradación de resultados al escalar.',
        ],
      },
    ],
    howEyebrow: 'Modelo de ejecución',
    howTitle: 'Animus opera como un contorno de ejecución gobernado',
    howSubtitle:
      'El contexto de la ejecución se fija de antemano, la ejecución ocurre en un entorno controlado y los resultados se conservan con un historial verificable.',
    howStepsTitle: 'Contorno de ejecución',
    howSteps: [
      {
        title: 'Fijación del contexto de ejecución',
        description:
          'Las versiones de datos, código, entorno y políticas vigentes se establecen antes de ejecutar.',
      },
      {
        title: 'Ejecución controlada',
        description:
          'La ejecución ocurre bajo restricciones corporativas de acceso, red y secretos.',
      },
      {
        title: 'Resultados verificables',
        description:
          'Artefactos y eventos están disponibles para análisis, reproducción y auditoría.',
      },
    ],
    howOutcomeTitle: 'Qué obtiene la organización',
    howOutcomeBullets: [
      'reproducibilidad de resultados con el tiempo sin pérdida de contexto;',
      'verificabilidad de la corrección de los experimentos y el origen de los artefactos;',
      'integración del laboratorio en la infraestructura existente (IdP, almacenamiento, SIEM) sin vías de elusión.',
    ],
    workflowsEyebrow: 'Capacidades por workflow',
    workflowsTitle: 'Funciones organizadas por escenarios operativos',
    workflowsSubtitle:
      'Las capacidades se definen mediante escenarios operativos y restricciones fijas.',
    workflows: [
      {
        title: 'Runs y pipelines',
        description: 'Ejecución determinista, reintentos y orquestación.',
        items: [
          'Especificaciones de Run con creación idempotente y entradas explícitas.',
          'PipelineRun como DAG con control de maxParallelism y cancelación segura.',
        ],
      },
      {
        title: 'Datasets y artefactos',
        description: 'Versiones de datos inmutables y artefactos trazables.',
        items: [
          'DatasetVersion es inmutable y apta para lineage.',
          'Artefactos con sumas de verificación y control de descarga.',
        ],
      },
      {
        title: 'DevEnvs (VS Code IDE)',
        description: 'Entornos de desarrollo gestionados sin perder governance.',
        items: [
          'Las sesiones IDE operan bajo el mismo modelo de governance que el Run de producción.',
          'Acceso solo a través de proxy con TTL.',
        ],
      },
      {
        title: 'Registro de modelos',
        description: 'Ciclo de vida verificable y control de exportación.',
        items: [
          'Estados de versión: draft → validated → approved → deprecated.',
          'Exportación deny-by-default, solo con approval.',
        ],
      },
      {
        title: 'Gobernanza y auditoría (SIEM)',
        description: 'Auditoría integral, exportación y transparencia operativa.',
        items: [
          'Auditoría append-only para todas las operaciones críticas.',
          'Exportación a SIEM (webhook/syslog) con DLQ y replay.',
        ],
      },
    ],
    trustEyebrow: 'Integración',
    trustTitle: 'Estándar enterprise por defecto',
    trustLead:
      'Las garantías de seguridad, auditoría y despliegue se fijan como restricciones operativas.',
    trustItems: [
      {
        title: 'Contornos cerrados y on-prem',
        description:
          'Despliegue en private cloud y entornos aislados sin pérdida de control ni base probatoria.',
        note: 'Incluye escenarios air-gapped.',
      },
      {
        title: 'Auditoría y evidencia',
        description:
          'Acciones críticas y acceso a resultados se registran en historial inmutable apto para verificación y exportación.',
        note: 'Integración con SIEM mediante entrega de eventos.',
      },
      {
        title: 'Acceso deny-by-default',
        description:
          'El acceso a datos y operaciones se define por roles y políticas; cualquier excepción debe autorizarse explícitamente.',
        note: 'Sin vías ocultas de bypass.',
      },
    ],
    trustCtaText:
      'Si se requiere reproducibilidad y control del desarrollo de ML en el contorno corporativo, solicite una revisión técnica.',
    trustCtaPrimary: 'Solicitar revisión técnica',
    trustCtaSecondary: 'Leer documentación',
    ctaEyebrow: '',
    ctaTitle: '',
    ctaSubtitle: '',
    ctaPaths: [],
    contactEyebrow: 'Contacto',
    contactTitle: 'Solicitar revisión técnica',
    contactSubtitle: 'Indique el contexto operativo y los requisitos de seguridad.',
    contactBullets: [
      'Describa el contorno de despliegue y las restricciones de cumplimiento.',
      'Enumere integraciones obligatorias y dependencias externas.',
      'Confirme las entradas de Run y los requisitos de auditoría.',
    ],
    contactEmailLabel: 'O correo',
    contactNextTitle: 'Próximos pasos',
    contactNextDescription:
      'Alineación de arquitectura y seguridad basada en la documentación.',
  },
  'zh-CN': {
    problemsEyebrow: '适用对象',
    problemsTitle: 'Animus 面向以下关键场景的组织：',
    problemsSubtitle: '',
    problemsItems: [
      {
        title: '保持科研价值',
        description: '研究结果必须长期保持可复现、可解释、可复用。',
      },
      {
        title: '可验证与可信',
        description: '产出结果必须可验证、可确认，并能承受审计与外部评审。',
      },
      {
        title: '在企业约束下工作',
        description: 'ML 开发需要在安全、合规与受控访问的环境中运行。',
      },
    ],
    outcomesEyebrow: '项目目标',
    outcomesTitle: 'Animus 解决的核心任务',
    outcomesSubtitle: '基础设施与研究约束共同定义开发环境。',
    outcomesItems: [
      {
        title: '结果的形式化可复现',
        description:
          'Animus 将每次运行的上下文固定为强制执行条件：数据版本、代码版本、环境与生效策略。',
        label: '由此可以：',
        bullets: [
          '在时间维度上复算结果；',
          '确认实验结果的正确性；',
          '在不丢失上下文的前提下复用积累研究。',
        ],
      },
      {
        title: '不违背企业要求的工作环境',
        description:
          'Animus 提供交互式与批处理工作环境，不绕过安全与访问控制约束。',
        label: '由此可以：',
        bullets: [
          '在治理环境中处理代码与数据；',
          '消除不可审计操作；',
          '满足内部与外部监管要求。',
        ],
      },
      {
        title: '统一协作环境',
        description:
          'Animus 为研究人员与工程师提供统一协作空间，在团队与阶段切换时保留上下文、可解释性与质量。',
        label: '这将降低：',
        bullets: [
          'R&D 到生产之间的知识损失；',
          '对个体人员的依赖；',
          '规模化过程中结果退化风险。',
        ],
      },
    ],
    howEyebrow: '执行模型',
    howTitle: 'Animus 作为受治理的执行边界运行',
    howSubtitle: '运行上下文预先固定，执行在受控环境中进行，结果携带可验证历史。',
    howStepsTitle: '执行边界',
    howSteps: [
      {
        title: '固定运行上下文',
        description: '在执行前固定数据、代码、环境与策略版本。',
      },
      {
        title: '受控执行',
        description: '运行受企业访问、网络与密钥约束治理。',
      },
      {
        title: '可验证结果',
        description: '工件与事件可用于分析、复现与审计。',
      },
    ],
    howOutcomeTitle: '组织获得的价值',
    howOutcomeBullets: [
      '结果可长期复现且不丢失上下文；',
      '实验正确性与工件来源可验证；',
      '实验室可嵌入现有基础设施（IdP、存储、SIEM）而不产生绕行路径。',
    ],
    workflowsEyebrow: '按工作流划分能力',
    workflowsTitle: '功能按运营工作流组织',
    workflowsSubtitle: '能力以固定约束下的运营流程定义。',
    workflows: [
      {
        title: 'Runs 与流水线',
        description: '确定性执行、重试与编排。',
        items: ['Run 规范支持幂等创建与显式输入。', 'PipelineRun 作为 DAG，支持 maxParallelism 与安全取消。'],
      },
      {
        title: '数据集与工件',
        description: '不可变数据版本与可追溯工件。',
        items: ['DatasetVersion 不可变并支持 lineage。', '工件附带校验和并受下载访问控制。'],
      },
      {
        title: 'DevEnvs（VS Code IDE）',
        description: '受管开发环境且不丧失治理能力。',
        items: ['IDE 会话遵循与生产 Run 相同治理模型。', '仅通过带 TTL 的代理访问。'],
      },
      {
        title: '模型注册',
        description: '可验证模型生命周期与导出控制。',
        items: ['版本状态：draft → validated → approved → deprecated。', '导出默认拒绝，仅在审批后允许。'],
      },
      {
        title: '治理与审计（SIEM）',
        description: '端到端审计、导出与运营透明性。',
        items: ['关键操作采用 append-only 审计。', '可导出到 SIEM（webhook/syslog），支持 DLQ 与 replay。'],
      },
    ],
    trustEyebrow: '集成',
    trustTitle: '默认企业级标准',
    trustLead: '安全、审计与部署保证被定义为运行约束。',
    trustItems: [
      {
        title: '封闭边界与 on-prem',
        description: '可在私有云与隔离环境中部署，且不损失控制与证据链。',
        note: '包括 air-gapped 场景。',
      },
      {
        title: '审计与证据',
        description: '关键操作与结果访问被写入不可变历史，支持验证与导出。',
        note: '通过事件投递集成 SIEM。',
      },
      {
        title: '默认拒绝访问',
        description: '数据与操作访问由角色与策略定义，例外必须显式授权。',
        note: '不存在隐藏 bypass 路径。',
      },
    ],
    trustCtaText: '若你需要在企业边界内实现 ML 开发的可复现与可控，请申请技术评审。',
    trustCtaPrimary: '申请技术评审',
    trustCtaSecondary: '阅读文档',
    ctaEyebrow: '',
    ctaTitle: '',
    ctaSubtitle: '',
    ctaPaths: [],
    contactEyebrow: '联系',
    contactTitle: '申请技术评审',
    contactSubtitle: '请提供运行背景与安全要求。',
    contactBullets: ['描述部署边界与合规约束。', '列出必需集成与外部依赖。', '确认 Run 输入与审计要求。'],
    contactEmailLabel: '或邮箱',
    contactNextTitle: '下一步',
    contactNextDescription: '基于文档进行架构与安全对齐。',
  },
  ja: {
    problemsEyebrow: '対象',
    problemsTitle: 'Animus は次の要件が重要な組織で利用されます：',
    problemsSubtitle: '',
    problemsItems: [
      {
        title: '科学的価値の維持',
        description:
          '研究成果は長期にわたり再現可能・解釈可能・再利用可能である必要があります。',
      },
      {
        title: '検証可能性と信頼性',
        description: '得られた結果は検証可能で、監査や外部レビューに耐える必要があります。',
      },
      {
        title: 'エンタープライズ制約下での運用',
        description: 'ML 開発はセキュリティ・コンプライアンス・アクセス制御要件下で実行されます。',
      },
    ],
    outcomesEyebrow: 'プロジェクト目標',
    outcomesTitle: 'Animus が解決する中核課題',
    outcomesSubtitle: 'インフラ要件と研究要件が開発環境を規定します。',
    outcomesItems: [
      {
        title: '成果の形式的再現性',
        description:
          'Animus は各 Run の文脈を必須条件として固定します：データ版、コード版、環境、適用ポリシー。',
        label: 'これにより：',
        bullets: [
          '時間が経っても結果を再現できる；',
          '実験の正しさを確認できる；',
          '文脈を失わずに知見を再利用できる。',
        ],
      },
      {
        title: '企業要件を破らない作業環境',
        description:
          'Animus はセキュリティとアクセス制御を迂回せずに、対話型・バッチ実行の作業環境を提供します。',
        label: 'これにより：',
        bullets: [
          '統制環境でコードとデータを扱える；',
          '監査不能な操作を排除できる；',
          '内部外部の規制要件への適合を維持できる。',
        ],
      },
      {
        title: '統合コラボレーション環境',
        description:
          'Animus は研究者とエンジニアの統合空間を提供し、チーム間・工程間移管でも文脈と品質を保持します。',
        label: 'これにより低減：',
        bullets: ['R&D と本番間の知識損失；', '特定個人への依存；', 'スケール時の成果劣化リスク。'],
      },
    ],
    howEyebrow: '実行モデル',
    howTitle: 'Animus は管理された実行コンターとして動作します',
    howSubtitle: 'Run 文脈を事前固定し、統制環境で実行し、検証可能な履歴とともに結果を保存します。',
    howStepsTitle: '実行コンター',
    howSteps: [
      {
        title: 'Run 文脈の固定',
        description: '実行前にデータ、コード、環境、ポリシーの版を固定します。',
      },
      {
        title: '統制実行',
        description: 'Run は企業のアクセス・ネットワーク・シークレット制約下で実行されます。',
      },
      {
        title: '検証可能な結果',
        description: 'アーティファクトとイベントは分析・再現・監査に利用できます。',
      },
    ],
    howOutcomeTitle: '組織が得るもの',
    howOutcomeBullets: [
      '文脈を失わない長期的再現性；',
      '実験正当性とアーティファクト由来の検証可能性；',
      '既存基盤（IdP、ストレージ、SIEM）へ迂回なしで組み込み可能。',
    ],
    workflowsEyebrow: 'ワークフロー別機能',
    workflowsTitle: '機能は運用ワークフローとして構成されます',
    workflowsSubtitle: '機能は固定制約を伴う運用シナリオとして定義されます。',
    workflows: [
      {
        title: 'Runs とパイプライン',
        description: '決定論的実行、リトライ、オーケストレーション。',
        items: ['明示入力を持つ idempotent な Run 仕様。', 'PipelineRun は DAG として maxParallelism と安全な停止を提供。'],
      },
      {
        title: 'データセットとアーティファクト',
        description: '不変データ版と追跡可能なアーティファクト。',
        items: ['DatasetVersion は不変で lineage 可能。', 'アーティファクトはチェックサム付きでダウンロード制御。'],
      },
      {
        title: 'DevEnvs（VS Code IDE）',
        description: 'ガバナンスを保った管理型開発環境。',
        items: ['IDE セッションは本番 Run と同一の統制モデルに従う。', 'アクセスは TTL 付きプロキシ経由のみ。'],
      },
      {
        title: 'モデルレジストリ',
        description: '検証可能なモデルライフサイクルとエクスポート制御。',
        items: ['版状態: draft → validated → approved → deprecated。', 'エクスポートは deny-by-default、承認時のみ許可。'],
      },
      {
        title: 'ガバナンスと監査（SIEM）',
        description: 'エンドツーエンド監査、エクスポート、運用可視性。',
        items: ['重要操作は append-only 監査。', 'SIEM 連携（webhook/syslog）で DLQ と replay を提供。'],
      },
    ],
    trustEyebrow: '統合',
    trustTitle: '標準でエンタープライズ品質',
    trustLead: 'セキュリティ、監査、デプロイ保証は運用制約として実装されます。',
    trustItems: [
      {
        title: 'クローズド境界と on-prem',
        description: 'プライベートクラウドや隔離環境でも制御と証跡を維持して導入可能。',
        note: 'air-gapped シナリオを含む。',
      },
      {
        title: '監査と証拠',
        description: '重要操作と結果アクセスは不変履歴に記録され、検証とエクスポートに利用可能。',
        note: 'イベント配信で SIEM 連携。',
      },
      {
        title: 'deny-by-default アクセス',
        description: 'データと操作アクセスはロール/ポリシーで制御され、例外は明示許可が必要。',
        note: '隠れた bypass 経路なし。',
      },
    ],
    trustCtaText:
      '企業境界で ML 開発の再現性と統制が必要な場合は、技術ウォークスルーを依頼してください。',
    trustCtaPrimary: '技術ウォークスルーを依頼',
    trustCtaSecondary: 'ドキュメントを読む',
    ctaEyebrow: '',
    ctaTitle: '',
    ctaSubtitle: '',
    ctaPaths: [],
    contactEyebrow: 'お問い合わせ',
    contactTitle: '技術ウォークスルーを依頼',
    contactSubtitle: '運用コンテキストとセキュリティ要件を共有してください。',
    contactBullets: ['デプロイ境界とコンプライアンス制約を記述。', '必須統合と外部依存を列挙。', 'Run 入力と監査要件を確認。'],
    contactEmailLabel: 'またはメール',
    contactNextTitle: '次のステップ',
    contactNextDescription: 'ドキュメントに基づくアーキテクチャ/セキュリティ整合。',
  },
};

export default async function MarketingPage({ params }: PageProps) {
  const resolvedParams = (await params) ?? {};
  const locale = getLocaleOrThrow(resolvedParams.locale);
  const t = createTranslator(locale, copy);
  const hasCtaSection = Boolean(
    t('ctaTitle') || t('ctaSubtitle') || t('ctaPaths').length > 0,
  );
  return (
    <>
      <MarketingHero locale={locale} />
      <section className="flex flex-wrap items-center gap-4 border-b border-white/10 pb-3 text-xs uppercase tracking-[0.2em] text-white/70">
        <MarketingNav locale={locale} />
        <MobileNav locale={locale} />
      </section>

      <MarketingSection
        id="problems"
        eyebrow={t('problemsEyebrow')}
        title={t('problemsTitle')}
        subtitle={t('problemsSubtitle')}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {t('problemsItems').map((item) => (
            <Card key={item.title} className="border-white/12 bg-[#0b1626]/85">
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        id="outcomes"
        eyebrow={t('outcomesEyebrow')}
        title={t('outcomesTitle')}
        subtitle={t('outcomesSubtitle')}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {t('outcomesItems').map((item) => (
            <Card key={item.title || item.description} className="border-white/12 bg-[#0b1626]/85">
              <CardHeader>
                {item.title ? <CardTitle>{item.title}</CardTitle> : null}
                {item.description ? <CardDescription>{item.description}</CardDescription> : null}
              </CardHeader>
              <CardContent>
                {item.label ? (
                  <div className="text-xs uppercase tracking-[0.22em] text-white/60">
                    {item.label}
                  </div>
                ) : null}
                {item.bullets.length > 0 ? (
                  <ul className="mt-3 space-y-3 text-sm text-white/80">
                    {item.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        id="managed-execution"
        eyebrow={t('howEyebrow')}
        title={t('howTitle')}
        subtitle={t('howSubtitle')}
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-white/12 bg-[#0b1626]/85">
            <CardHeader>
              <CardTitle>{t('howStepsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {t('howSteps').map((step, index) => (
                <div key={step.title} className="flex items-start gap-3 text-sm text-white/80">
                  <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-xs text-white/70">
                    {index + 1}
                  </span>
                  <div className="space-y-1">
                    <div className="font-medium text-white">{step.title}</div>
                    <div className="text-sm text-white/75">{step.description}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-white/12 bg-[#0b1626]/85">
            <CardHeader>
              <CardTitle>{t('howOutcomeTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-white/80">
                {t('howOutcomeBullets').map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </MarketingSection>

      <MarketingSection
        id="workflows"
        eyebrow={t('workflowsEyebrow')}
        title={t('workflowsTitle')}
        subtitle={t('workflowsSubtitle')}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {t('workflows').map((workflow) => (
            <Card key={workflow.title} className="border-white/12 bg-[#0b1626]/85">
              <CardHeader>
                <CardTitle>{workflow.title}</CardTitle>
                <CardDescription>{workflow.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-white/80">
                  {workflow.items.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        id="trust"
        eyebrow={t('trustEyebrow')}
        title={t('trustTitle')}
        subtitle={t('trustLead')}
        className="pb-6"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {t('trustItems').map((item) => {
            return (
              <Card
                key={item.title}
                className="rounded-[28px] border border-white/12 bg-[#0b1626]/90 p-6 shadow-[0_28px_60px_rgba(4,10,20,0.6)]"
              >
                <CardHeader className="p-0">
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                {item.note ? (
                  <CardContent className="p-0 pt-3 text-xs text-white/55">{item.note}</CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
        <div className="rounded-[28px] border border-white/12 bg-[#0b1626]/90 p-5 shadow-[0_28px_60px_rgba(4,10,20,0.6)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
            <p className="text-sm text-white/80">{t('trustCtaText')}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="accent">
                <a href="#contact">{t('trustCtaPrimary')}</a>
              </Button>
              <Button asChild variant="outline">
                <a href={localizedPath(locale, '/docs')}>{t('trustCtaSecondary')}</a>
              </Button>
            </div>
          </div>
        </div>
      </MarketingSection>

      {hasCtaSection ? (
        <MarketingSection
          eyebrow={t('ctaEyebrow')}
          title={t('ctaTitle')}
          subtitle={t('ctaSubtitle')}
        >
          {t('ctaPaths').length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {t('ctaPaths').map((path) => (
                <Card key={path.title} className="border-white/12 bg-[#0b1626]/85">
                  <CardHeader>
                    <CardTitle>{path.title}</CardTitle>
                    <CardDescription>{path.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline" size="sm">
                      <a href="#contact">{path.action}</a>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </MarketingSection>
      ) : null}

      <MarketingSection
        id="contact"
        eyebrow={t('contactEyebrow')}
        title={t('contactTitle')}
        subtitle={t('contactSubtitle')}
        className="mt-12"
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <Card className="border-white/12 bg-[#0b1626]/85 p-6">
            <ContactForm locale={locale} />
          </Card>
          <Card className="border-white/12 bg-[#0b1626]/85">
            <CardHeader>
              <CardTitle>{t('contactNextTitle')}</CardTitle>
              <CardDescription>{t('contactNextDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-white/80">
                {t('contactBullets').map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center gap-2 text-sm text-white/75">
                <span>{t('contactEmailLabel')}</span>
                <EmailLink locale={locale} className="text-white underline">
                  {CONTACT_EMAIL}
                </EmailLink>
              </div>
            </CardContent>
          </Card>
        </div>
      </MarketingSection>
    </>
  );
}
