# Landing copy export

Source: generated from landing copy objects in closed/messanger.

## Site metadata
- Name: Animus
- Description: Corporate digital laboratory for machine learning with explicit domain entities, governed Run execution, and Control Plane / Data Plane separation.
- Repo URL: https://github.com/grewanderer/animus-golang
- Readme URL: https://github.com/grewanderer/animus-golang/blob/main/README.md

## Locale: en
### Meta
- Title: Animus
- Description: Corporate digital laboratory for machine learning with explicit domain entities, governed Run execution, and Control Plane / Data Plane separation.
### Hero
- Kicker: Digital laboratory
- Title: Animus
- Headline: Governed execution and explicit context.
- Description lines:
  - Animus Datalab is a corporate digital laboratory for machine learning that organizes the ML lifecycle as a governed, reproducible system within a single operational contour with common rules of execution, security, and audit.
  - The Control Plane never executes user code; execution occurs in the Data Plane under policy, isolation, and audit.
- CTA docs: Read the documentation
- CTA talk: Request technical discussion
- CTA email: Email
- Trust anchors: On-prem, Private cloud, Air-gapped, RBAC + AuditEvent
- Status label: Execution unit
- Status value: Run
- Status note: Run is the minimal unit of execution and reproducibility, defined by DatasetVersion, CodeRef (commit SHA), EnvironmentLock, parameters, and execution policy.
- Panel title: Control Plane / Data Plane
  - Control Plane: Governs metadata, policy enforcement, orchestration, and audit for Project-scoped entities. (Never executes user code.)
  - Data Plane: Executes user code in isolated container environments with explicit resource limits, network policies, and controlled data and Artifact access. (Containerized execution; Kubernetes baseline.)
- Snapshot title: Operational snapshot
  - Run states: queued, running, succeeded, failed, canceled, unknown.
  - ModelVersion states: draft, validated, approved, deprecated.
  - AuditEvent: append-only and exportable.
- Deployment title: Deployment models
- Deployment note: Single-cluster and multi-cluster deployments are supported across on-prem, private cloud, and air-gapped environments.
- Visual brand: ANIMUS
- Visual control: Control
- Visual run: Run
### Navigation
- Definition: #why
- Reproducibility: #reproducibility
- Execution: #process
- Architecture: #architecture
- Security: #security
- Operations: #outcomes
- Docs: /docs
  - Overview: /docs/overview
  - System Definition: /docs/system-definition
  - Architecture: /docs/architecture
  - Execution Model: /docs/execution-model
  - Security: /docs/security
  - Operations: /docs/operations
- Repository: https://github.com/grewanderer/animus-golang
- Contact: #contact
### Hero metrics
- Execution unit: Run — Defined by DatasetVersion, CodeRef, EnvironmentLock
- Deployment models: Single / multi-cluster — On-prem, private cloud, air-gapped
- Audit: Append-only — Exportable AuditEvent
### Partner logos
- Control Plane, Data Plane, Run, AuditEvent
### System Definition
- Eyebrow: System Definition
- Title: Architectural invariants
- Subtitle: The documentation defines these properties as mandatory and non-negotiable.
- Items:
  - The Control Plane never executes user code.
  - A production-run is defined by DatasetVersion, CodeRef (commit SHA), and EnvironmentLock.
  - All significant actions produce AuditEvent records.
  - Data, code, environments, and results are explicit, versioned entities.
  - Hidden state that affects execution is disallowed; results must be explainable from explicit entities.
### System boundaries
- Eyebrow: System boundaries
- Title: What Animus is / is not
- Subtitle: Animus Datalab is a corporate digital laboratory for machine learning that organizes the full ML development lifecycle (data, experiments, training, evaluation, and preparation for industrial use) within a single operational contour governed by common rules of execution, security, and audit.
- What is title: What Animus is
- What is description: Explicit domain entities and policy-governed execution.
- What is items:
  - A Control Plane that governs metadata, policy enforcement, orchestration, and audit for Project-scoped entities.
  - A Data Plane that executes user code in isolated environments with explicit resource limits.
  - Run is the unit of execution and reproducibility; PipelineRun is a DAG of Runs.
  - Developer Environment provides managed IDE sessions; interactive work is not a Run and is not a production-run.
- What not title: What Animus is not
- What not description: Documented non-goals and boundaries.
- What not items:
  - Not a source control system; CodeRef points to external SCM.
  - Not an IDE or code editor as a product; IDE sessions are managed tools within Developer Environment.
  - Not a full inference platform.
- CTAs:
  - System Definition: /docs/system-definition
  - Architecture: /docs/architecture
### Reproducibility
- Eyebrow: Reproducibility
- Title: Reproducibility contract for Run
- Subtitle: Reproducibility depends on explicit, immutable inputs and a recorded determinism model.
- Items:
  - Run (definition): Minimal unit of execution and reproducibility that yields Artifacts, execution trace, and AuditEvent.
  - DatasetVersion: Runs reference immutable DatasetVersion inputs; data changes require a new DatasetVersion.
  - CodeRef (commit SHA): Production-run requires CodeRef with commit SHA; branches and tags are not permitted.
  - EnvironmentLock: Execution uses immutable EnvironmentLock with image digest and dependency checksums.
  - Parameters + execution policy: Parameters and execution policy are explicit inputs recorded by Control Plane and applied when forming the Execution Plan.
  - Determinism model: Strong and weak reproducibility are distinguished; non-strict cases are explicitly recorded.
### Execution model
- Eyebrow: Execution model
- Title: Declarative execution and pipeline semantics
- Subtitle: Control Plane validates, plans, and audits; Data Plane executes isolated workloads.
- Steps:
  - Declare Run or PipelineRun: Execution is described declaratively; pipeline specifications define DAG steps and dependencies.
  - Authorize and validate references: Control Plane enforces RBAC, validates references, applies policies, and records AuditEvent.
  - Build Execution Plan: The plan captures image digest, resources, network policies, and secret references for Data Plane.
  - Execute in Data Plane: User code runs in isolated containers; Control Plane never executes user code.
  - Observe without secret leakage: Logs, metrics, and traces are collected; secrets must not appear in UI, logs, or Artifacts.
  - Retry, rerun, replay: Retries, reruns, and replays create new Runs linked to the original; replay uses the saved Execution Plan.
### Architecture
- Eyebrow: Architecture
- Title: Control Plane and Data Plane
- Subtitle: The Control Plane never executes user code; it governs policy, metadata, orchestration, and audit. The Data Plane executes untrusted code in isolated environments.
- CTA: Architecture docs
- Snapshot title: Trust boundaries
- Snapshot description: Explicit separation of management and execution.
- Items:
  - Trust boundaries distinguish user clients, Control Plane, Data Plane, and external systems.
  - Control Plane stores metadata and audit as the source of truth and remains consistent during Data Plane failures.
  - Data Plane executes Runs in containerized environments with explicit resource limits and network policies.
  - AuditEvent is append-only and exportable, covering administrative actions and execution status changes.
### Security
- Eyebrow: Security model
- Title: Architectural security model
- Subtitle: Authorization, policy enforcement, and audit are enforced by the platform and are not optional.
- CTA: Security docs
- Items:
  - SSO via OIDC/SAML or local accounts for air-gapped installations; session TTL and audit for logins.
  - Project-centric RBAC with default deny and object-level enforcement; decisions are audited.
  - Secrets are provided temporarily via external secret stores and must not appear in UI, logs, metrics, or Artifacts.
  - Network egress is deny-by-default; external connections are explicitly permitted by policy and audited.
  - AuditEvent is append-only, non-disableable, and exportable to SIEM/monitoring systems.
### Operations
- Eyebrow: Operations
- Title: Operational readiness and acceptance
- Subtitle: Deployment, upgrades, and recovery are defined as operational contracts.
- Scope title: Deployment models
- Scope description: Supported topologies and isolation modes.
- Scope items:
  - Single-cluster deployments (Control Plane + Data Plane).
  - Multi-cluster deployments with one Control Plane and multiple Data Planes.
  - On-prem, private cloud, and air-gapped environments.
- Deliverables title: Lifecycle operations
- Deliverables description: Installation, upgrades, and recovery are explicit procedures.
- Deliverables items:
  - Helm charts and/or Kustomize manifests with versioned container images.
  - Controlled upgrades with rollback and schema migrations.
  - Backup & DR for metadata and audit with defined RPO/RTO.
- Failure title: Failure model
- Failure description: Expected degradation behavior is defined and observable.
- Failure items:
  - Control Plane operations are idempotent where possible.
  - Data Plane failure does not corrupt metadata or audit.
  - Runs enter diagnostic states (unknown/reconciling) during loss of Data Plane.
### Acceptance criteria
- Title: Acceptance criteria
- Note: Production-grade definition
- Body: Animus Datalab is production-grade when a full ML lifecycle is executable within one Project, production-run reproducibility is explicit (or limitations are recorded), audit is end-to-end and exportable, security and access policies enforce permissions, deployments are installable, upgradable, rollback-safe, and no hidden state affects results.
### Contact
- Eyebrow: Contact
- Title: Request a technical review
- Subtitle: Use the form to share deployment context, security requirements, and integration constraints.
- Bullets:
  - Specify the intended deployment model (single-cluster, multi-cluster, air-gapped).
  - List required external systems: database, object storage, IdP, secret store, SIEM.
  - Identify the Run inputs to be governed: DatasetVersion, CodeRef, EnvironmentLock, parameters, execution policy.
- Email label: Or email
- Next title: Next steps
- Next description: Architecture, security, and operations alignment based on the documentation.

## Locale: ru
### Meta
- Title: Animus
- Description: Корпоративная цифровая лаборатория машинного обучения с явными сущностями, управляемым исполнением Run и разделением Control Plane / Data Plane.
### Hero
- Kicker: Цифровая лаборатория
- Title: Animus
- Headline: Управляемое исполнение и явный контекст.
- Description lines:
  - Animus Datalab — корпоративная цифровая лаборатория машинного обучения, организующая полный жизненный цикл ML-разработки как управляемую и воспроизводимую систему в едином операционном контуре с общими правилами исполнения, безопасности и аудита.
  - Control Plane никогда не исполняет пользовательский код; исполнение происходит в Data Plane под политиками, изоляцией и аудитом.
- CTA docs: Читать документацию
- CTA talk: Запросить техническое обсуждение
- CTA email: Email
- Trust anchors: On-prem, Private cloud, Air-gapped, RBAC + AuditEvent
- Status label: Единица исполнения
- Status value: Run
- Status note: Run — минимальная единица исполнения и воспроизводимости, определяемая DatasetVersion, CodeRef (commit SHA), EnvironmentLock, параметрами и политикой исполнения.
- Panel title: Control Plane / Data Plane
  - Control Plane: Управляет метаданными, политиками, оркестрацией и аудитом для Project-сущностей. (Никогда не исполняет пользовательский код.)
  - Data Plane: Исполняет пользовательский код в изолированных контейнерных окружениях с явными лимитами ресурсов, сетевыми политиками и контролируемым доступом к данным и артефактам. (Контейнерное исполнение; базовая среда — Kubernetes.)
- Snapshot title: Операционный срез
  - Статусы Run: queued, running, succeeded, failed, canceled, unknown.
  - Статусы ModelVersion: draft, validated, approved, deprecated.
  - AuditEvent: append-only и экспортируемый.
- Deployment title: Модели развёртывания
- Deployment note: Поддерживаются single-cluster и multi-cluster развёртывания в on-prem, private cloud и air-gapped средах.
- Visual brand: ANIMUS
- Visual control: Control
- Visual run: Run
### Navigation
- Определение: #why
- Воспроизводимость: #reproducibility
- Исполнение: #process
- Архитектура: #architecture
- Безопасность: #security
- Эксплуатация: #outcomes
- Документация: /docs
  - Обзор: /docs/overview
  - Определение системы: /docs/system-definition
  - Архитектура: /docs/architecture
  - Модель исполнения: /docs/execution-model
  - Безопасность: /docs/security
  - Эксплуатация: /docs/operations
- Репозиторий: https://github.com/grewanderer/animus-golang
- Контакт: #contact
### Hero metrics
- Единица исполнения: Run — DatasetVersion, CodeRef, EnvironmentLock
- Модели развёртывания: Single / multi-cluster — On-prem, private cloud, air-gapped
- Аудит: Append-only — Exportable AuditEvent
### Partner logos
- Control Plane, Data Plane, Run, AuditEvent
### System Definition
- Eyebrow: Определение системы
- Title: Архитектурные инварианты
- Subtitle: Документация фиксирует эти свойства как обязательные и ненарушаемые.
- Items:
  - Control Plane никогда не исполняет пользовательский код.
  - Production-run определяется DatasetVersion, CodeRef (commit SHA) и EnvironmentLock.
  - Все значимые действия порождают AuditEvent.
  - Данные, код, окружения и результаты представлены как явные версионируемые сущности.
  - Скрытое состояние, влияющее на исполнение, запрещено; результат должен быть объясним через явные сущности.
### System boundaries
- Eyebrow: Границы системы
- Title: Что такое Animus / чем он не является
- Subtitle: Animus Datalab — корпоративная цифровая лаборатория машинного обучения, организующая полный жизненный цикл ML-разработки (данные, эксперименты, обучение, оценка, подготовка к промышленному использованию) в едином операционном контуре с общими правилами исполнения, безопасности и аудита.
- What is title: Что такое Animus
- What is description: Явные доменные сущности и исполнение, управляемое политиками.
- What is items:
  - Control Plane управляет метаданными, политиками, оркестрацией и аудитом Project-сущностей.
  - Data Plane исполняет пользовательский код в изолированных окружениях с явными лимитами ресурсов.
  - Run — единица исполнения и воспроизводимости; PipelineRun — DAG из Run.
  - Developer Environment предоставляет управляемые IDE-сессии; интерактивная работа не является Run и не является production-run.
- What not title: Чем Animus не является
- What not description: Задокументированные нецели и границы.
- What not items:
  - Не система контроля версий; CodeRef указывает на внешний SCM.
  - Не IDE и не редактор кода как продукт; IDE-сессии — управляемый инструмент Developer Environment.
  - Не полноценная inference-платформа.
- CTAs:
  - Определение системы: /docs/system-definition
  - Архитектура: /docs/architecture
### Reproducibility
- Eyebrow: Воспроизводимость
- Title: Контракт воспроизводимости Run
- Subtitle: Воспроизводимость опирается на явные неизменяемые входы и фиксируемую модель детерминизма.
- Items:
  - Run (определение): Минимальная единица исполнения и воспроизводимости; порождает Artifacts, execution trace и AuditEvent.
  - DatasetVersion: Run ссылается на неизменяемые DatasetVersion; изменение данных оформляется новой версией.
  - CodeRef (commit SHA): Production-run требует CodeRef с commit SHA; ветки и теги не допускаются.
  - EnvironmentLock: Исполнение использует неизменяемый EnvironmentLock с image digest и checksums зависимостей.
  - Параметры и политика исполнения: Параметры и политика исполнения — явные входы, фиксируемые Control Plane и применяемые при формировании Execution Plan.
  - Модель детерминизма: Сильная и слабая воспроизводимость различаются; статус фиксируется явно.
### Execution model
- Eyebrow: Модель исполнения
- Title: Декларативное исполнение и семантика пайплайнов
- Subtitle: Control Plane валидирует, планирует и аудитирует; Data Plane исполняет изолированные нагрузки.
- Steps:
  - Декларировать Run или PipelineRun: Исполнение описывается декларативно; pipeline specification задаёт DAG шагов и зависимостей.
  - Авторизовать и проверить ссылки: Control Plane применяет RBAC, проверяет ссылки, политики и фиксирует AuditEvent.
  - Сформировать Execution Plan: План фиксирует image digest, ресурсы, сетевые политики и ссылки на секреты для Data Plane.
  - Исполнить в Data Plane: Пользовательский код выполняется в изолированных контейнерах; Control Plane не исполняет пользовательский код.
  - Наблюдаемость без утечек секретов: Логи, метрики и трейсы собираются; секреты не должны попадать в UI, логи или Artifacts.
  - Retry, rerun, replay: Повторы создают новые Run с явной связью с исходным запуском; replay использует сохранённый Execution Plan.
### Architecture
- Eyebrow: Архитектура
- Title: Control Plane и Data Plane
- Subtitle: Control Plane никогда не исполняет пользовательский код; он управляет политиками, метаданными, оркестрацией и аудитом. Data Plane исполняет недоверенный код в изолированных окружениях.
- CTA: Документация по архитектуре
- Snapshot title: Границы доверия
- Snapshot description: Явное разделение управления и исполнения.
- Items:
  - Границы доверия различают пользовательских клиентов, Control Plane, Data Plane и внешние системы.
  - Control Plane хранит метаданные и аудит как источник истины и сохраняет консистентность при сбоях Data Plane.
  - Data Plane исполняет Run в контейнерных окружениях с явными лимитами ресурсов и сетевыми политиками.
  - AuditEvent является append-only и экспортируемым; аудит покрывает административные действия и статусы исполнения.
### Security
- Eyebrow: Модель безопасности
- Title: Архитектурная модель безопасности
- Subtitle: Авторизация, применение политик и аудит являются обязательными элементами платформы.
- CTA: Документация по безопасности
- Items:
  - SSO через OIDC/SAML или локальные учетные записи для air-gapped; TTL сессий и аудит входов.
  - RBAC на уровне Project с default deny и object-level enforcement; решения фиксируются в аудите.
  - Секреты предоставляются временно через внешние secret store и не должны попадать в UI, логи, метрики или Artifacts.
  - Сетевой egress по умолчанию запрещён; внешние соединения разрешаются политиками и аудитируются.
  - AuditEvent append-only, не отключаем и экспортируем в SIEM/monitoring.
### Operations
- Eyebrow: Эксплуатация
- Title: Эксплуатационная готовность и приёмка
- Subtitle: Развёртывание, обновления и восстановление описаны как операционные контракты.
- Scope title: Модели развёртывания
- Scope description: Поддерживаемые топологии и режимы изоляции.
- Scope items:
  - Single-cluster развёртывания (Control Plane + Data Plane).
  - Multi-cluster развёртывания с одним Control Plane и несколькими Data Plane.
  - On-prem, private cloud и air-gapped среды.
- Deliverables title: Операционные процедуры
- Deliverables description: Установка, обновления и восстановление описаны явно.
- Deliverables items:
  - Helm charts и/или Kustomize-манифесты с версионированными контейнерными образами.
  - Контролируемые обновления с rollback и миграциями схем.
  - Backup & DR для метаданных и аудита с определёнными RPO/RTO.
- Failure title: Модель отказов
- Failure description: Ожидаемое поведение при деградации определено и наблюдаемо.
- Failure items:
  - Операции Control Plane идемпотентны там, где это возможно.
  - Отказ Data Plane не нарушает метаданные и аудит.
  - Run переходят в диагностические статусы (unknown/reconciling) при потере Data Plane.
### Acceptance criteria
- Title: Критерии приёмки
- Note: Определение production-grade
- Body: Animus Datalab считается production-grade, когда полный ML-цикл выполняется в рамках одного Project, воспроизводимость production-run формализована (или ограничения фиксируются), аудит сквозной и экспортируемый, безопасность и доступы работают end-to-end, развёртывание/обновления/rollback предсказуемы, а скрытое состояние отсутствует.
### Contact
- Eyebrow: Контакт
- Title: Запросить технический обзор
- Subtitle: Используйте форму, чтобы передать контекст развёртывания, требования безопасности и ограничения интеграций.
- Bullets:
  - Укажите модель развёртывания (single-cluster, multi-cluster, air-gapped).
  - Перечислите внешние системы: база данных, объектное хранилище, IdP, secret store, SIEM.
  - Определите входы Run для управления: DatasetVersion, CodeRef, EnvironmentLock, параметры, execution policy.
- Email label: Или email
- Next title: Следующие шаги
- Next description: Согласование архитектуры, безопасности и эксплуатации на основе документации.

## Locale: es
### Meta
- Title: Animus
- Description: Laboratorio digital corporativo de ML con entidades explícitas, ejecución gobernada de Run y separación Control Plane / Data Plane.
### Hero
- Kicker: Laboratorio digital
- Title: Animus
- Headline: Ejecución gobernada y contexto explícito.
- Description lines:
  - Animus Datalab es un laboratorio digital corporativo de ML que organiza el ciclo de vida completo del ML como un sistema gobernado y reproducible dentro de un único contorno operativo con reglas comunes de ejecución, seguridad y auditoría.
  - El Control Plane nunca ejecuta código de usuario; la ejecución ocurre en el Data Plane bajo políticas, aislamiento y auditoría.
- CTA docs: Leer la documentación
- CTA talk: Solicitar discusión técnica
- CTA email: Email
- Trust anchors: On-prem, Private cloud, Air-gapped, RBAC + AuditEvent
- Status label: Unidad de ejecución
- Status value: Run
- Status note: Run es la unidad mínima de ejecución y reproducibilidad, definida por DatasetVersion, CodeRef (commit SHA), EnvironmentLock, parámetros y política de ejecución.
- Panel title: Control Plane / Data Plane
  - Control Plane: Gobierna metadatos, aplicación de políticas, orquestación y auditoría para entidades con ámbito de Project. (Nunca ejecuta código de usuario.)
  - Data Plane: Ejecuta código de usuario en entornos de contenedores aislados con límites explícitos de recursos, políticas de red y acceso controlado a datos y Artifacts. (Ejecución en contenedores; línea base: Kubernetes.)
- Snapshot title: Resumen operativo
  - Estados de Run: queued, running, succeeded, failed, canceled, unknown.
  - Estados de ModelVersion: draft, validated, approved, deprecated.
  - AuditEvent: append-only y exportable.
- Deployment title: Modelos de despliegue
- Deployment note: Se admiten despliegues single-cluster y multi-cluster en entornos on-prem, nube privada y air-gapped.
- Visual brand: ANIMUS
- Visual control: Control
- Visual run: Run
### Navigation
- Definición: #why
- Reproducibilidad: #reproducibility
- Ejecución: #process
- Arquitectura: #architecture
- Seguridad: #security
- Operaciones: #outcomes
- Documentación: /docs
  - Resumen: /docs/overview
  - Definición del sistema: /docs/system-definition
  - Arquitectura: /docs/architecture
  - Modelo de ejecución: /docs/execution-model
  - Seguridad: /docs/security
  - Operaciones: /docs/operations
- Repositorio: https://github.com/grewanderer/animus-golang
- Contacto: #contact
### Hero metrics
- Unidad de ejecución: Run — DatasetVersion, CodeRef, EnvironmentLock
- Modelos de despliegue: Single / multi-cluster — On-prem, nube privada, air-gapped
- Auditoría: Append-only — Exportable AuditEvent
### Partner logos
- Control Plane, Data Plane, Run, AuditEvent
### System Definition
- Eyebrow: Definición del sistema
- Title: Invariantes arquitectónicos
- Subtitle: La documentación define estas propiedades como obligatorias y no negociables.
- Items:
  - El Control Plane nunca ejecuta código de usuario.
  - Un production-run se define por DatasetVersion, CodeRef (commit SHA) y EnvironmentLock.
  - Todas las acciones significativas generan AuditEvent.
  - Datos, código, entornos y resultados son entidades explícitas y versionadas.
  - El estado oculto que afecta la ejecución está prohibido; los resultados deben ser explicables a partir de entidades explícitas.
### System boundaries
- Eyebrow: Límites del sistema
- Title: Qué es Animus / qué no es
- Subtitle: Animus Datalab es un laboratorio digital corporativo de ML que organiza el ciclo de vida completo del ML (datos, experimentos, entrenamiento, evaluación y preparación para uso industrial) dentro de un único contorno operativo con reglas comunes de ejecución, seguridad y auditoría.
- What is title: Qué es Animus
- What is description: Entidades de dominio explícitas y ejecución gobernada por políticas.
- What is items:
  - Un Control Plane que gobierna metadatos, aplicación de políticas, orquestación y auditoría para entidades con ámbito de Project.
  - Un Data Plane que ejecuta código de usuario en entornos aislados con límites explícitos de recursos.
  - Run es la unidad de ejecución y reproducibilidad; PipelineRun es un DAG de Runs.
  - Developer Environment proporciona sesiones IDE gestionadas; el trabajo interactivo no es un Run ni un production-run.
- What not title: Qué no es Animus
- What not description: No objetivos y límites documentados.
- What not items:
  - No es un sistema de control de versiones; CodeRef apunta a un SCM externo.
  - No es un IDE ni un editor de código como producto; las sesiones IDE son herramientas gestionadas dentro de Developer Environment.
  - No es una plataforma completa de inferencia.
- CTAs:
  - Definición del sistema: /docs/system-definition
  - Arquitectura: /docs/architecture
### Reproducibility
- Eyebrow: Reproducibilidad
- Title: Contrato de reproducibilidad para Run
- Subtitle: La reproducibilidad depende de entradas explícitas e inmutables y de un modelo de determinismo registrado.
- Items:
  - Run (definición): Unidad mínima de ejecución y reproducibilidad que produce Artifacts, execution trace y AuditEvent.
  - DatasetVersion: Los Runs referencian DatasetVersion inmutables; los cambios de datos requieren una nueva DatasetVersion.
  - CodeRef (commit SHA): Production-run requiere CodeRef con commit SHA; las ramas y etiquetas no están permitidas.
  - EnvironmentLock: La ejecución utiliza EnvironmentLock inmutable con image digest y checksums de dependencias.
  - Parámetros + política de ejecución: Los parámetros y la política de ejecución son entradas explícitas registradas por el Control Plane y aplicadas al formar el Execution Plan.
  - Modelo de determinismo: Se distinguen reproducibilidad fuerte y débil; los casos no estrictos se registran explícitamente.
### Execution model
- Eyebrow: Modelo de ejecución
- Title: Ejecución declarativa y semántica de pipelines
- Subtitle: El Control Plane valida, planifica y audita; el Data Plane ejecuta cargas aisladas.
- Steps:
  - Declarar Run o PipelineRun: La ejecución se describe de forma declarativa; las especificaciones de pipeline definen pasos y dependencias DAG.
  - Autorizar y validar referencias: El Control Plane aplica RBAC, valida referencias, aplica políticas y registra AuditEvent.
  - Construir Execution Plan: El plan captura image digest, recursos, políticas de red y referencias de secretos para el Data Plane.
  - Ejecutar en Data Plane: El código de usuario se ejecuta en contenedores aislados; el Control Plane nunca ejecuta código de usuario.
  - Observabilidad sin filtración de secretos: Se recopilan logs, métricas y trazas; los secretos no deben aparecer en UI, logs o Artifacts.
  - Retry, rerun, replay: Los reintentos, reruns y replays crean nuevos Runs vinculados al original; replay usa el Execution Plan guardado.
### Architecture
- Eyebrow: Arquitectura
- Title: Control Plane y Data Plane
- Subtitle: El Control Plane nunca ejecuta código de usuario; gobierna políticas, metadatos, orquestación y auditoría. El Data Plane ejecuta código no confiable en entornos aislados.
- CTA: Documentación de arquitectura
- Snapshot title: Límites de confianza
- Snapshot description: Separación explícita de gestión y ejecución.
- Items:
  - Los límites de confianza distinguen clientes de usuario, Control Plane, Data Plane y sistemas externos.
  - El Control Plane almacena metadatos y auditoría como fuente de verdad y mantiene consistencia durante fallos del Data Plane.
  - El Data Plane ejecuta Runs en entornos de contenedores con límites explícitos de recursos y políticas de red.
  - AuditEvent es append-only y exportable, cubriendo acciones administrativas y cambios de estado de ejecución.
### Security
- Eyebrow: Modelo de seguridad
- Title: Modelo de seguridad arquitectónico
- Subtitle: La autorización, la aplicación de políticas y la auditoría son obligatorias.
- CTA: Documentación de seguridad
- Items:
  - SSO via OIDC/SAML o cuentas locales para air-gapped; TTL de sesión y auditoría de inicios de sesión.
  - RBAC centrado en Project con default deny y enforcement a nivel de objeto; decisiones auditadas.
  - Los secretos se entregan temporalmente vía secret stores externos y no deben aparecer en UI, logs, métricas o Artifacts.
  - El egress de red es deny-by-default; conexiones externas permitidas explícitamente por política y auditadas.
  - AuditEvent es append-only, no desactivable y exportable a sistemas SIEM/monitorización.
### Operations
- Eyebrow: Operaciones
- Title: Preparación operativa y aceptación
- Subtitle: El despliegue, las actualizaciones y la recuperación se definen como contratos operativos.
- Scope title: Modelos de despliegue
- Scope description: Topologías y modos de aislamiento compatibles.
- Scope items:
  - Despliegues single-cluster (Control Plane + Data Plane).
  - Despliegues multi-cluster con un Control Plane y múltiples Data Plane.
  - Entornos on-prem, nube privada y air-gapped.
- Deliverables title: Operaciones del ciclo de vida
- Deliverables description: Instalación, actualizaciones y recuperación como procedimientos explícitos.
- Deliverables items:
  - Helm charts y/o manifiestos Kustomize con imágenes de contenedor versionadas.
  - Actualizaciones controladas con rollback y migraciones de esquema.
  - Backup & DR para metadatos y auditoría con RPO/RTO definidos.
- Failure title: Modelo de fallos
- Failure description: El comportamiento esperado en degradación está definido y es observable.
- Failure items:
  - Las operaciones del Control Plane son idempotentes cuando es posible.
  - El fallo del Data Plane no corrompe metadatos ni auditoría.
  - Los Runs entran en estados diagnósticos (unknown/reconciling) durante la pérdida del Data Plane.
### Acceptance criteria
- Title: Criterios de aceptación
- Note: Definición production-grade
- Body: Animus Datalab es production-grade cuando un ciclo completo de ML es ejecutable en un Project, la reproducibilidad de production-run es explícita (o se registran sus límites), la auditoría es end-to-end y exportable, la seguridad y los accesos se aplican de extremo a extremo, el despliegue/actualización/rollback es predecible y no existe estado oculto que afecte resultados.
### Contact
- Eyebrow: Contacto
- Title: Solicitar revisión técnica
- Subtitle: Utiliza el formulario para compartir contexto de despliegue, requisitos de seguridad y restricciones de integración.
- Bullets:
  - Especifica el modelo de despliegue previsto (single-cluster, multi-cluster, air-gapped).
  - Enumera sistemas externos requeridos: base de datos, almacenamiento de objetos, IdP, secret store, SIEM.
  - Identifica las entradas de Run a gobernar: DatasetVersion, CodeRef, EnvironmentLock, parámetros, execution policy.
- Email label: O email
- Next title: Siguientes pasos
- Next description: Alineación de arquitectura, seguridad y operaciones basada en la documentación.
