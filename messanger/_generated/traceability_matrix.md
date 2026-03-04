# Landing traceability matrix

Scope: landing page copy (app/[locale]/page.tsx, sections/landing/hero.tsx, lib/marketing-data.ts, config/site.ts). Non-English locales are translations of the English canonical claims; mapping applies across locales.

## Site metadata
- Corporate digital laboratory for machine learning with explicit domain entities, governed Run execution, and Control Plane / Data Plane separation.
  - Source: config/site.ts, app/[locale]/page.tsx meta
  - Evidence: Animus Datalab.md §01.1, §02.2, §03.1, §04.1

## Hero
- Animus Datalab is a corporate digital laboratory for machine learning that organizes the ML lifecycle as a governed, reproducible system within a single operational contour with common rules of execution, security, and audit.
  - Source: sections/landing/hero.tsx descriptionLines[0]
  - Evidence: Animus Datalab.md §01.1–01.2
- The Control Plane never executes user code; execution occurs in the Data Plane under policy, isolation, and audit.
  - Source: sections/landing/hero.tsx descriptionLines[1]
  - Evidence: Animus Datalab.md §01.4, §03.2.3–03.3.3; ADR-001
- Trust anchors: On-prem, private cloud, air-gapped, RBAC + AuditEvent.
  - Source: sections/landing/hero.tsx trustAnchors
  - Evidence: Animus Datalab.md §09.2.1, §08.4, §03.2.5; ADR-006
- Run is the minimal unit of execution and reproducibility, defined by DatasetVersion, CodeRef (commit SHA), EnvironmentLock, parameters, and execution policy.
  - Source: sections/landing/hero.tsx statusNote
  - Evidence: Animus Datalab.md §02.2, §04.4, §04.5
- Control Plane governs metadata, policy enforcement, orchestration, and audit for Project-scoped entities; it never executes user code.
  - Source: sections/landing/hero.tsx panelItems[Control Plane]
  - Evidence: Animus Datalab.md §03.2.2–03.2.5, §01.4; ADR-001
- Data Plane executes user code in isolated container environments with explicit resource limits, network policies, and controlled data/artifact access; Kubernetes baseline.
  - Source: sections/landing/hero.tsx panelItems[Data Plane]
  - Evidence: Animus Datalab.md §03.3.1–03.3.2, §05.5.2, §08.6.2
- Run states: queued, running, succeeded, failed, canceled, unknown.
  - Source: sections/landing/hero.tsx snapshotItems
  - Evidence: Animus Datalab.md §04.6.3
- ModelVersion states: draft, validated, approved, deprecated.
  - Source: sections/landing/hero.tsx snapshotItems
  - Evidence: Animus Datalab.md §04.8.4
- AuditEvent is append-only and exportable.
  - Source: sections/landing/hero.tsx snapshotItems
  - Evidence: Animus Datalab.md §03.2.5, §04.9.3; ADR-006
- Single-cluster and multi-cluster deployments are supported across on-prem, private cloud, and air-gapped environments.
  - Source: sections/landing/hero.tsx deploymentNote
  - Evidence: Animus Datalab.md §09.2.1

## System definition (Architectural invariants)
- The Control Plane never executes user code.
- A production-run is defined by DatasetVersion, CodeRef (commit SHA), and EnvironmentLock.
- All significant actions produce AuditEvent records.
- Data, code, environments, and results are explicit, versioned entities.
- Hidden state that affects execution is disallowed; results must be explainable from explicit entities.
  - Source: app/[locale]/page.tsx whatYouGetItems
  - Evidence: Animus Datalab.md §01.4, §02.3, §02.4.3

## What Animus is / is not
- Animus Datalab organizes the full ML development lifecycle within a single operational contour governed by common rules of execution, security, and audit.
  - Source: app/[locale]/page.tsx whySubtitle
  - Evidence: Animus Datalab.md §01.1–01.2
- Control Plane governs metadata, policy enforcement, orchestration, and audit for Project-scoped entities.
- Data Plane executes user code in isolated environments with explicit resource limits.
- Run is the unit of execution and reproducibility; PipelineRun is a DAG of Runs.
- Developer Environment provides managed IDE sessions; interactive work is not a Run and is not a production-run.
  - Source: app/[locale]/page.tsx whatIsItems
  - Evidence: Animus Datalab.md §03.2–03.3, §04.6.4, §05.3.1, §07.1–07.8; ADR-005
- Not a source control system; CodeRef points to external SCM.
- Not an IDE or code editor as a product; IDE sessions are managed tools within Developer Environment.
- Not a full inference platform.
  - Source: app/[locale]/page.tsx whatNotItems
  - Evidence: Animus Datalab.md §01.3; ADR-005

## Reproducibility contract for Run
- Run is the minimal unit of execution and reproducibility that yields Artifacts, execution trace, and AuditEvent.
- Runs reference immutable DatasetVersion inputs; data changes require a new DatasetVersion.
- Production-run requires CodeRef with commit SHA; branches and tags are not permitted.
- Execution uses immutable EnvironmentLock with image digest and dependency checksums.
- Parameters and execution policy are explicit inputs recorded by Control Plane and applied when forming the Execution Plan.
- Strong and weak reproducibility are distinguished; non-strict cases are explicitly recorded.
  - Source: app/[locale]/page.tsx capabilities
  - Evidence: Animus Datalab.md §02.2–02.4, §04.3–04.5, §05.2.2; ADR-004

## Execution model
- Execution is described declaratively; pipeline specifications define DAG steps and dependencies.
- Control Plane enforces RBAC, validates references, applies policies, and records AuditEvent.
- Execution Plan captures image digest, resources, network policies, and secret references for Data Plane.
- User code runs in isolated containers; Control Plane never executes user code.
- Logs, metrics, and traces are collected; secrets must not appear in UI, logs, or Artifacts.
- Retries, reruns, and replays create new Runs linked to the original; replay uses the saved Execution Plan.
  - Source: app/[locale]/page.tsx processSteps
  - Evidence: Animus Datalab.md §05.1–05.7, §05.4; §08.5.1; ADR-001

## Architecture
- Control Plane never executes user code; it governs policy, metadata, orchestration, and audit. Data Plane executes untrusted code in isolated environments.
  - Source: app/[locale]/page.tsx architectureSubtitle
  - Evidence: Animus Datalab.md §03.1–03.3; ADR-001
- Trust boundaries distinguish user clients, Control Plane, Data Plane, and external systems.
- Control Plane stores metadata and audit as the source of truth and remains consistent during Data Plane failures.
- Data Plane executes Runs in containerized environments with explicit resource limits and network policies.
- AuditEvent is append-only and exportable, covering administrative actions and execution status changes.
  - Source: app/[locale]/page.tsx architectureItems
  - Evidence: Animus Datalab.md §03.2–03.5, §04.9.3; ADR-006

## Security model
- Authorization, policy enforcement, and audit are enforced by the platform and are not optional.
  - Source: app/[locale]/page.tsx securitySubtitle
  - Evidence: Animus Datalab.md §08.1, §03.2.4; ADR-006
- SSO via OIDC/SAML or local accounts for air-gapped installations; session TTL and audit for logins.
- Project-centric RBAC with default deny and object-level enforcement; decisions are audited.
- Secrets are provided temporarily via external secret stores and must not appear in UI, logs, metrics, or Artifacts.
- Network egress is deny-by-default; external connections are explicitly permitted by policy and audited.
- AuditEvent is append-only, non-disableable, and exportable to SIEM/monitoring systems.
  - Source: app/[locale]/page.tsx securityItems
  - Evidence: Animus Datalab.md §08.3–08.8, §08.6.2; RBAC Matrix; Animus Datalab - STM.md §6.2; ADR-006

## Operations
- Deployment models: single-cluster, multi-cluster, on-prem, private cloud, air-gapped.
- Installation artifacts: Helm charts and/or Kustomize manifests with versioned container images.
- Controlled upgrades with rollback and schema migrations.
- Backup & DR for metadata and audit with defined RPO/RTO.
  - Source: app/[locale]/page.tsx outcomesScopeItems, outcomesDeliverables
  - Evidence: Animus Datalab.md §09.2.1–09.2.2, §09.5, §09.6
- Failure model: Control Plane operations are idempotent where possible; Data Plane failure does not corrupt metadata or audit; Runs enter diagnostic states (unknown/reconciling) during loss of Data Plane.
  - Source: app/[locale]/page.tsx outcomesNotItems
  - Evidence: Animus Datalab.md §03.5.1–03.5.2, §05.4.2, §05.6.2

## Acceptance criteria
- Production-grade definition (full ML lifecycle within one Project; explicit reproducibility or recorded limits; end-to-end, exportable audit; security and access policies enforced; install/upgrade/rollback; no hidden state).
  - Source: app/[locale]/page.tsx maturityBody
  - Evidence: Animus Datalab.md §10.3–10.9, §10.8.2

## Engagement section
- Contact and review prompts are engagement language (not system claims) and require no doc traceability.
  - Source: app/[locale]/page.tsx contact section
