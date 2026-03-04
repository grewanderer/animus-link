import { Button } from '@/components/ui/button';
import { createTranslator, type Locale, localizedPath } from '@/lib/i18n';
import { CorePanelVisual } from '@/sections/landing/core-panel-visual';

type HeroCopy = {
  kicker: string;
  title: string;
  headline: string;
  descriptionLines: string[];
  pillars: string[];
  ctaPrimary: string;
  ctaSecondary: string;
  trustAnchors: string[];
  cardsLabel: string;
  controlBadge: string;
  controlCardLabel: string;
  controlCardTitle: string;
  controlPlaneLabel: string;
  controlPlaneDescription: string;
  controlPlaneNote: string;
  dataPlaneLabel: string;
  dataPlaneDescription: string;
  dataPlaneNote: string;
  deploymentLabel: string;
  deploymentDescription: string;
  contextCardTitle: string;
  contextCardDescription: string;
  contextCardNote: string;
};

const heroCopy: Partial<Record<Locale, HeroCopy>> & { en: HeroCopy } = {
  en: {
    kicker: '',
    title: 'Animus Datalab',
    headline: 'Corporate digital laboratory for reproducible and verifiable ML research',
    descriptionLines: [
      'Animus ensures formal reproducibility of experiments and transparency of results, reducing the risk of losing scientific value and making accumulated research non-reusable.',
      'The platform provides a working environment for researchers and engineers without violating corporate security, audit, and compliance requirements.',
    ],
    pillars: [],
    ctaPrimary: 'Request technical walkthrough',
    ctaSecondary: 'Read documentation',
    trustAnchors: [],
    cardsLabel: 'Guarantees of reproducibility, verifiability, and integration',
    controlBadge: 'ANIMUS',
    controlCardLabel: 'Context',
    controlCardTitle: 'Run',
    controlPlaneLabel: 'Formal reproducibility of experiments',
    controlPlaneDescription:
      'Experiments can be repeated with the same input conditions and results, regardless of execution time or team composition.',
    controlPlaneNote: '',
    dataPlaneLabel: 'Verifiability and audit of results',
    dataPlaneDescription:
      'Results and artifacts are recorded with a full action history and can serve as verifiable evidence for audit and control.',
    dataPlaneNote: '',
    deploymentLabel: 'Embedding into enterprise infrastructure',
    deploymentDescription:
      'Research and development results can be used within existing engineering, production, and regulatory contours without violating accepted requirements and processes.',
    contextCardTitle: 'Working environment for developers and researchers',
    contextCardDescription:
      'Animus provides a governed working environment for development and experiments, where interactive and batch work run under unified rules for execution, access, and audit.\n\nResearchers and engineers work with code, data, and experiments without local bypasses, implicit state, or dependence on specific individuals.',
    contextCardNote:
      'Day-to-day work remains convenient while results stay verifiable.',
  },
  ru: {
    kicker: '',
    title: 'Animus Datalab',
    headline: 'Корпоративная цифровая лаборатория для воспроизводимых и проверяемых ML-исследований',
    descriptionLines: [
      'Animus обеспечивает формальную воспроизводимость экспериментов и прозрачность получаемых результатов,\nснижая риск утраты научной ценности и невозможности повторного использования накопленных исследований.',
      'Платформа создаёт рабочую среду для исследователей и инженеров\nбез нарушения корпоративных требований безопасности, аудита и комплаенса.',
    ],
    pillars: [],
    ctaPrimary: 'Запросить технический разбор',
    ctaSecondary: 'Читать документацию',
    trustAnchors: [],
    cardsLabel: 'Гарантии воспроизводимости, проверяемости и интеграции',
    controlBadge: 'ANIMUS',
    controlCardLabel: 'Контекст',
    controlCardTitle: 'Run',
    controlPlaneLabel: 'Формальная воспроизводимость экспериментов',
    controlPlaneDescription:
      'Эксперименты могут быть повторены с теми же входными условиями и результатами, независимо от времени выполнения и состава команды.',
    controlPlaneNote: '',
    dataPlaneLabel: 'Проверяемость и аудит результатов',
    dataPlaneDescription:
      'Результаты и артефакты фиксируются с полной историей действий и могут использоваться как подтверждаемая доказательная база для аудита и контроля.',
    dataPlaneNote: '',
    deploymentLabel: 'Встраиваемость в корпоративную инфраструктуру',
    deploymentDescription:
      'Результаты исследований и разработки могут использоваться в существующих инженерных, производственных и регуляторных контурах без нарушения принятых требований и процессов.',
    contextCardTitle: 'Рабочая среда для разработчиков и исследователей',
    contextCardDescription:
      'Animus предоставляет управляемую рабочую среду для разработки и экспериментов, в которой интерактивная и batch-работа выполняются в рамках единых правил исполнения, доступа и аудита.\n\nИсследователи и инженеры работают с кодом, данными и экспериментами без локальных обходов, неявных состояний и зависимости от конкретных исполнителей.',
    contextCardNote: 'Повседневная работа остаётся удобной, а результаты — проверяемыми.',
  },
  es: {
    kicker: '',
    title: 'Animus Datalab',
    headline: 'Laboratorio digital corporativo para investigación ML reproducible y verificable',
    descriptionLines: [
      'Animus garantiza la reproducibilidad formal de los experimentos y la transparencia de los resultados, reduciendo el riesgo de pérdida del valor científico y de inutilizar la investigación acumulada.',
      'La plataforma proporciona un entorno de trabajo para investigadores e ingenieros sin violar requisitos corporativos de seguridad, auditoría y compliance.',
    ],
    pillars: [],
    ctaPrimary: 'Solicitar revisión técnica',
    ctaSecondary: 'Leer documentación',
    trustAnchors: [],
    cardsLabel: 'Garantías de reproducibilidad, verificabilidad e integración',
    controlBadge: 'ANIMUS',
    controlCardLabel: 'Contexto',
    controlCardTitle: 'Run',
    controlPlaneLabel: 'Reproducibilidad formal de experimentos',
    controlPlaneDescription:
      'Los experimentos pueden repetirse con las mismas condiciones de entrada y resultados, sin depender del momento ni del equipo.',
    controlPlaneNote: '',
    dataPlaneLabel: 'Verificabilidad y auditoría de resultados',
    dataPlaneDescription:
      'Resultados y artefactos se registran con historial completo de acciones y pueden servir como evidencia verificable para auditoría y control.',
    dataPlaneNote: '',
    deploymentLabel: 'Integración en infraestructura corporativa',
    deploymentDescription:
      'Los resultados de investigación y desarrollo pueden utilizarse en contornos existentes de ingeniería, producción y regulación sin violar requisitos y procesos establecidos.',
    contextCardTitle: 'Entorno de trabajo para desarrolladores e investigadores',
    contextCardDescription:
      'Animus proporciona un entorno de trabajo gobernado para desarrollo y experimentación, donde el trabajo interactivo y batch se ejecuta bajo reglas unificadas de ejecución, acceso y auditoría.\n\nInvestigadores e ingenieros trabajan con código, datos y experimentos sin atajos locales, estados implícitos ni dependencia de personas específicas.',
    contextCardNote:
      'El trabajo cotidiano sigue siendo conveniente y los resultados permanecen verificables.',
  },
  'zh-CN': {
    kicker: '',
    title: 'Animus Datalab',
    headline: '面向可复现、可验证 ML 研究的企业数字实验室',
    descriptionLines: [
      'Animus 通过形式化机制保障实验可复现与结果透明，降低科研价值流失与累积研究不可复用风险。',
      '平台为研究人员和工程师提供工作环境，同时满足企业安全、审计与合规要求。',
    ],
    pillars: [],
    ctaPrimary: '申请技术评审',
    ctaSecondary: '阅读文档',
    trustAnchors: [],
    cardsLabel: '可复现性、可验证性与可集成性的保障',
    controlBadge: 'ANIMUS',
    controlCardLabel: '上下文',
    controlCardTitle: 'Run',
    controlPlaneLabel: '实验结果的形式化可复现',
    controlPlaneDescription:
      '实验在相同输入条件下可重复得到一致结果，不依赖执行时间或团队成员变化。',
    controlPlaneNote: '',
    dataPlaneLabel: '结果可验证与可审计',
    dataPlaneDescription:
      '结果与工件记录完整操作历史，可作为审计与控制的可验证证据。',
    dataPlaneNote: '',
    deploymentLabel: '嵌入企业基础设施',
    deploymentDescription:
      '研究与研发成果可在既有工程、生产与监管边界中使用，不破坏既定流程与要求。',
    contextCardTitle: '面向开发者与研究者的工作环境',
    contextCardDescription:
      'Animus 提供受治理的研发与实验环境，交互与批处理工作遵循统一执行、访问与审计规则。\n\n研究者与工程师可在无本地绕过、无隐式状态、无个人依赖的前提下处理代码、数据与实验。',
    contextCardNote: '日常工作保持高效，结果持续可验证。',
  },
  ja: {
    kicker: '',
    title: 'Animus Datalab',
    headline: '再現可能かつ検証可能な ML 研究のための企業向けデジタルラボ',
    descriptionLines: [
      'Animus は実験の形式的再現性と結果の透明性を担保し、科学的価値の喪失と知見の再利用不能化を抑制します。',
      '研究者とエンジニアに、企業のセキュリティ・監査・コンプライアンス要件を満たす作業環境を提供します。',
    ],
    pillars: [],
    ctaPrimary: '技術ウォークスルーを依頼',
    ctaSecondary: 'ドキュメントを読む',
    trustAnchors: [],
    cardsLabel: '再現性・検証可能性・統合性の保証',
    controlBadge: 'ANIMUS',
    controlCardLabel: 'コンテキスト',
    controlCardTitle: 'Run',
    controlPlaneLabel: '実験の形式的再現性',
    controlPlaneDescription:
      '同一入力条件で同一結果を再生成でき、実行時点やチーム構成に依存しません。',
    controlPlaneNote: '',
    dataPlaneLabel: '結果の検証可能性と監査性',
    dataPlaneDescription:
      '結果とアーティファクトは完全な操作履歴とともに記録され、監査証拠として利用できます。',
    dataPlaneNote: '',
    deploymentLabel: 'エンタープライズ基盤への組み込み',
    deploymentDescription:
      '研究・開発成果を既存のエンジニアリング/本番/規制コンターへ、既定要件を損なわず適用できます。',
    contextCardTitle: '開発者・研究者向けの作業環境',
    contextCardDescription:
      'Animus は統制された開発・実験環境を提供し、対話型とバッチ実行を共通の実行・アクセス・監査ルールで運用します。\n\n研究者とエンジニアは、ローカル迂回・暗黙状態・個人依存なしでコード、データ、実験を扱えます。',
    contextCardNote: '日常運用の利便性を保ちながら、成果の検証可能性を維持します。',
  },
};

type Props = {
  locale: Locale;
};

export function MarketingHero({ locale }: Props) {
  const t = createTranslator(locale, heroCopy);
  const kicker = t('kicker');
  return (
    <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[#0a1422]/85 px-6 py-16 shadow-[0_35px_70px_rgba(3,8,18,0.55)] md:px-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_22%,rgba(120,190,230,0.18),transparent_40%),radial-gradient(circle_at_78%_30%,rgba(90,160,210,0.16),transparent_42%),linear-gradient(180deg,rgba(6,14,24,0.65),rgba(4,10,18,0.92))]" />
        <div className="absolute inset-0 opacity-30 mix-blend-screen bg-[url('data:image/svg+xml,%3Csvg width=%22480%22 height=%22480%22 viewBox=%220 0 480 480%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath d=%22M0 0H480V480H0z%22 fill=%22transparent%22/%3E%3Cpath d=%22M0 120H480M0 240H480M0 360H480M120 0V480M240 0V480M360 0V480%22 stroke=%22rgba(255,255,255,0.05)%22 stroke-width=%221%22/%3E%3C/svg%3E')]" />
      </div>

      <div className="relative z-10 grid gap-12 lg:grid-cols-[1.15fr_0.95fr]">
        <div className="space-y-7">
          {kicker ? (
            <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.38em] text-white/60">
              <span className="h-px w-12 bg-white/35" />
              <span>{kicker}</span>
            </div>
          ) : null}
          <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-[56px] lg:leading-[1.02]">
            {t('title')}
          </h1>
          <p className="text-2xl font-semibold text-white/90 sm:text-3xl">{t('headline')}</p>
          <div className="max-w-2xl space-y-3 text-lg text-white/85">
            {t('descriptionLines').map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {t('pillars').length > 0 ? (
            <ul className="space-y-2 text-sm text-white/80">
              {t('pillars').map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" variant="accent">
              <a href="#contact">{t('ctaPrimary')}</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={localizedPath(locale, '/docs')}>{t('ctaSecondary')}</a>
            </Button>
          </div>
          {t('contextCardTitle') ? (
            <div className="rounded-2xl border border-white/15 bg-[#0b1626]/80 p-4 text-sm text-white/80 shadow-[0_18px_40px_rgba(5,12,24,0.4)]">
              <div className="text-sm font-semibold text-white">{t('contextCardTitle')}</div>
              <p className="mt-2 text-sm text-white/80">{t('contextCardDescription')}</p>
              {t('contextCardNote') ? (
                <p className="mt-2 text-xs text-white/60">{t('contextCardNote')}</p>
              ) : null}
            </div>
          ) : null}
          {t('trustAnchors').length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/60">
              {t('trustAnchors').map((anchor, index) => (
                <span key={anchor} className="flex items-center gap-3">
                  {index > 0 ? <span className="h-1 w-1 rounded-full bg-white/30" /> : null}
                  <span>{anchor}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[#0b1626]/90 shadow-[0_28px_60px_rgba(4,10,20,0.6)]">
            <div className="pointer-events-none absolute inset-0">
              <CorePanelVisual className="absolute inset-0 opacity-80" />
              <div className="absolute inset-0 opacity-45 mix-blend-screen bg-[url('data:image/svg+xml,%3Csvg width=%22560%22 height=%22560%22 viewBox=%220 0 560 560%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Crect width=%22560%22 height=%22560%22 fill=%22transparent%22/%3E%3Cg stroke=%22rgba(170,220,255,0.16)%22 stroke-width=%221%22%3E%3Cpath d=%22M140 0 L280 80.8 L280 242.4 L140 323.2 L0 242.4 L0 80.8 Z%22/%3E%3Cpath d=%22M420 0 L560 80.8 L560 242.4 L420 323.2 L280 242.4 L280 80.8 Z%22/%3E%3Cpath d=%22M280 242.4 L420 323.2 L420 484.8 L280 565.6 L140 484.8 L140 323.2 Z%22/%3E%3C/g%3E%3C/svg%3E')] bg-[length:560px_560px]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(120,200,230,0.28),transparent_45%),radial-gradient(circle_at_82%_32%,rgba(90,170,220,0.22),transparent_52%)]" />
            </div>
            <div className="relative z-10 flex min-h-[260px] items-end justify-end px-6 pb-8 pt-10 sm:min-h-[320px]">
              <div className="absolute left-6 top-6 z-10 flex items-center gap-3 text-[10px] uppercase tracking-[0.4em] text-white/60">
                <span className="h-px w-8 bg-white/35" />
                <span>{t('controlBadge')}</span>
                <span className="h-px w-8 bg-white/35" />
              </div>
              <div className="absolute bottom-0 left-6 right-6 z-0 h-24 -skew-x-12 bg-[linear-gradient(90deg,rgba(80,160,210,0.1)_1px,transparent_1px),linear-gradient(0deg,rgba(80,160,210,0.1)_1px,transparent_1px)] bg-[size:28px_28px] opacity-35" />
              <div className="relative z-10 w-full max-w-[360px]">
                <div className="absolute -left-10 -top-10 h-40 w-full rounded-2xl border border-white/10 bg-[#0c1b2c]/65 shadow-[0_14px_28px_rgba(2,8,16,0.45)]" />
                <div className="absolute -left-5 -top-5 h-40 w-full rounded-2xl border border-white/15 bg-[#0b1b2c]/80 shadow-[0_16px_32px_rgba(3,9,18,0.55)]" />
                <div className="relative h-40 w-full rounded-2xl border border-white/20 bg-gradient-to-br from-[#10263b]/95 via-[#0c1d2e]/94 to-[#0a1522]/95 p-4 shadow-[0_20px_40px_rgba(4,12,22,0.65)]">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/55">
                    <span>{t('controlCardLabel')}</span>
                    <span className="text-white/75">{t('controlCardTitle')}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-2 w-4/5 rounded bg-white/25" />
                    <div className="h-2 w-3/4 rounded bg-white/20" />
                    <div className="h-2 w-2/3 rounded bg-white/15" />
                  </div>
                  <div className="mt-4 grid grid-cols-6 gap-2">
                    <div className="col-span-2 h-6 rounded border border-white/15 bg-white/5" />
                    <div className="col-span-4 h-6 rounded border border-white/15 bg-white/5" />
                  </div>
                  <div className="relative mt-3 h-10 overflow-hidden rounded border border-white/15 bg-[#07121d]/80">
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(90,180,220,0.1)_0%,rgba(110,200,240,0.35)_45%,rgba(90,180,220,0.1)_100%)]" />
                    <div className="absolute inset-0 opacity-60 bg-[linear-gradient(90deg,transparent_0%,transparent_12%,rgba(255,255,255,0.18)_14%,transparent_16%,transparent_38%,rgba(255,255,255,0.18)_40%,transparent_42%,transparent_64%,rgba(255,255,255,0.18)_66%,transparent_68%,transparent_100%)]" />
                  </div>
                </div>
                <div className="absolute -right-6 bottom-2 hidden h-24 w-24 rounded-2xl border border-white/20 bg-[#0b1728]/85 p-3 text-white/60 shadow-[0_18px_36px_rgba(3,10,18,0.6)] sm:block">
                  <svg viewBox="0 0 120 120" className="h-full w-full" fill="none" aria-hidden="true">
                    <path d="M18 84 L54 54 L94 70" stroke="rgba(120,200,240,0.55)" strokeWidth="2" />
                    <path d="M28 30 L54 54 L86 34" stroke="rgba(120,200,240,0.35)" strokeWidth="1.6" />
                    <circle cx="18" cy="84" r="5" fill="rgba(160,220,250,0.85)" />
                    <circle cx="54" cy="54" r="6" fill="rgba(200,240,255,0.95)" />
                    <circle cx="94" cy="70" r="5" fill="rgba(140,210,245,0.8)" />
                    <circle cx="28" cy="30" r="4" fill="rgba(160,220,250,0.7)" />
                    <circle cx="86" cy="34" r="4" fill="rgba(160,220,250,0.7)" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-[28px] border border-white/12 bg-[#0b1626]/90 p-6 shadow-[0_28px_60px_rgba(4,10,20,0.6)]">
            <div className="space-y-6">
              <div className="text-xs uppercase tracking-[0.3em] text-white/60">
                {t('cardsLabel')}
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/12 bg-[#0a1422]/80 p-4">
                  <div className="text-sm font-semibold text-white">{t('controlPlaneLabel')}</div>
                  <p className="mt-2 text-sm text-white/80">{t('controlPlaneDescription')}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.24em] text-white/45">
                    {t('controlPlaneNote')}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/12 bg-[#0a1422]/80 p-4">
                  <div className="text-sm font-semibold text-white">{t('dataPlaneLabel')}</div>
                  <p className="mt-2 text-sm text-white/80">{t('dataPlaneDescription')}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.24em] text-white/45">
                    {t('dataPlaneNote')}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-[#0a1422]/80 p-4 text-sm text-white/75">
                <div className="text-sm font-semibold text-white">{t('deploymentLabel')}</div>
                <p className="mt-2">{t('deploymentDescription')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
