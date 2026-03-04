# Claim map report

All claims below are grounded in docs/enterprise. Non-English locales are translations of the English canonical claims.

## Landing page

### Site metadata
- [SUPPORTED] Corporate digital laboratory for machine learning with explicit domain entities, governed Run execution, and Control Plane / Data Plane separation. (Animus Datalab.md §01.1, §02.2, §03.1, §04.1)

### Hero
- [SUPPORTED] Animus Datalab is a corporate digital laboratory for machine learning that organizes the ML lifecycle as a governed, reproducible system within a single operational contour with common rules of execution, security, and audit. (Animus Datalab.md §01.1–01.2)
- [SUPPORTED] The Control Plane never executes user code; execution occurs in the Data Plane under policy, isolation, and audit. (Animus Datalab.md §01.4, §03.2.3–03.3.3; ADR-001)
- [SUPPORTED] On-prem, private cloud, and air-gapped deployment models are supported; RBAC and AuditEvent are core system properties. (Animus Datalab.md §09.2.1, §08.4, §03.2.5; ADR-006)
- [SUPPORTED] Run is the minimal unit of execution and reproducibility defined by DatasetVersion, CodeRef (commit SHA), EnvironmentLock, parameters, and execution policy. (Animus Datalab.md §02.2, §04.4–04.5)
- [SUPPORTED] Control Plane governs metadata, policy enforcement, orchestration, and audit for Project-scoped entities; it never executes user code. (Animus Datalab.md §03.2.2–03.2.5, §01.4; ADR-001)
- [SUPPORTED] Data Plane executes user code in isolated container environments with explicit resource limits, network policies, and controlled data/artifact access; Kubernetes baseline. (Animus Datalab.md §03.3.1–03.3.2, §05.5.2, §08.6.2)
- [SUPPORTED] Run states: queued, running, succeeded, failed, canceled, unknown. (Animus Datalab.md §04.6.3)
- [SUPPORTED] ModelVersion states: draft, validated, approved, deprecated. (Animus Datalab.md §04.8.4)
- [SUPPORTED] AuditEvent is append-only and exportable. (Animus Datalab.md §03.2.5, §04.9.3; ADR-006)
- [SUPPORTED] Single-cluster and multi-cluster deployments are supported across on-prem, private cloud, and air-gapped environments. (Animus Datalab.md §09.2.1)

### System definition (Architectural invariants)
- [SUPPORTED] The Control Plane never executes user code. (Animus Datalab.md §01.4)
- [SUPPORTED] A production-run is defined by DatasetVersion, CodeRef (commit SHA), and EnvironmentLock. (Animus Datalab.md §01.4; ADR-004)
- [SUPPORTED] All significant actions produce AuditEvent records. (Animus Datalab.md §01.4, §03.2.5)
- [SUPPORTED] Data, code, environments, and results are explicit, versioned entities. (Animus Datalab.md §01.4, §04.1)
- [SUPPORTED] Hidden state that affects execution is disallowed; results must be explainable from explicit entities. (Animus Datalab.md §01.4, §02.3)

### What Animus is / is not
- [SUPPORTED] Animus Datalab organizes the full ML development lifecycle within a single operational contour governed by common rules of execution, security, and audit. (Animus Datalab.md §01.1–01.2)
- [SUPPORTED] Control Plane governs metadata, policy enforcement, orchestration, and audit for Project-scoped entities. (Animus Datalab.md §03.2.2–03.2.5)
- [SUPPORTED] Data Plane executes user code in isolated environments with explicit resource limits. (Animus Datalab.md §03.3.1, §05.5.2)
- [SUPPORTED] Run is the unit of execution and reproducibility; PipelineRun is a DAG of Runs. (Animus Datalab.md §02.2, §04.6.4, §05.3.1)
- [SUPPORTED] Developer Environment provides managed IDE sessions; interactive work is not a Run and is not a production-run. (Animus Datalab.md §07.1–07.8; ADR-005)
- [SUPPORTED] Not a source control system; CodeRef points to external SCM. (Animus Datalab.md §01.3, §04.4)
- [SUPPORTED] Not an IDE or code editor as a product; IDE sessions are managed tools within Developer Environment. (Animus Datalab.md §01.3, §07.3; ADR-005)
- [SUPPORTED] Not a full inference platform. (Animus Datalab.md §01.3)

### Reproducibility contract
- [SUPPORTED] Run is the minimal unit of execution and reproducibility that yields Artifacts, execution trace, and AuditEvent. (Animus Datalab.md §02.2)
- [SUPPORTED] Runs reference immutable DatasetVersion inputs; data changes require a new DatasetVersion. (Animus Datalab.md §04.3.4)
- [SUPPORTED] Production-run requires CodeRef with commit SHA; branches and tags are not permitted. (Animus Datalab.md §04.4.3; ADR-004)
- [SUPPORTED] Execution uses immutable EnvironmentLock with image digest and dependency checksums. (Animus Datalab.md §04.5.2–04.5.4)
- [SUPPORTED] Parameters and execution policy are explicit inputs recorded by Control Plane and applied when forming the Execution Plan. (Animus Datalab.md §02.2, §05.2.2)
- [SUPPORTED] Strong and weak reproducibility are distinguished; non-strict cases are explicitly recorded. (Animus Datalab.md §02.4.2)

### Execution model
- [SUPPORTED] Execution is described declaratively; pipeline specifications define DAG steps and dependencies. (Animus Datalab.md §05.1, §06.3)
- [SUPPORTED] Control Plane enforces RBAC, validates references, applies policies, and records AuditEvent. (Animus Datalab.md §05.2.1, §03.2.4–03.2.5, §08.4)
- [SUPPORTED] Execution Plan captures image digest, resources, network policies, and secret references for Data Plane. (Animus Datalab.md §05.2.2)
- [SUPPORTED] User code runs in isolated containers; Control Plane never executes user code. (Animus Datalab.md §05.2.3, §01.4; ADR-001)
- [SUPPORTED] Logs, metrics, and traces are collected; secrets must not appear in UI, logs, or Artifacts. (Animus Datalab.md §05.7, §08.5.1)
- [SUPPORTED] Retries, reruns, and replays create new Runs linked to the original; replay uses the saved Execution Plan. (Animus Datalab.md §05.4.1)

### Architecture
- [SUPPORTED] Control Plane never executes user code; it governs policy, metadata, orchestration, and audit. Data Plane executes untrusted code in isolated environments. (Animus Datalab.md §03.1–03.3; ADR-001)
- [SUPPORTED] Trust boundaries distinguish user clients, Control Plane, Data Plane, and external systems. (Animus Datalab.md §03.4)
- [SUPPORTED] Control Plane stores metadata and audit as the source of truth and remains consistent during Data Plane failures. (Animus Datalab.md §03.2.2, §03.5.2)
- [SUPPORTED] Data Plane executes Runs in containerized environments with explicit resource limits and network policies. (Animus Datalab.md §03.3.1, §05.5.2, §08.6.2)
- [SUPPORTED] AuditEvent is append-only and exportable, covering administrative actions and execution status changes. (Animus Datalab.md §03.2.5, §04.9.3; ADR-006)

### Security model
- [SUPPORTED] Authorization, policy enforcement, and audit are enforced by the platform and are not optional. (Animus Datalab.md §08.1, §03.2.4; ADR-006)
- [SUPPORTED] SSO via OIDC/SAML or local accounts for air-gapped installations; session TTL and audit for logins. (Animus Datalab.md §08.3.2–08.3.3)
- [SUPPORTED] Project-centric RBAC with default deny and object-level enforcement; decisions are audited. (Animus Datalab.md §08.4; RBAC Matrix §2–4)
- [SUPPORTED] Secrets are provided temporarily via external secret stores and must not appear in UI, logs, metrics, or Artifacts. (Animus Datalab.md §08.5)
- [SUPPORTED] Network egress is deny-by-default; external connections are explicitly permitted by policy and audited. (Animus Datalab.md §08.6.2; Animus Datalab - STM.md §6.2)
- [SUPPORTED] AuditEvent is append-only, non-disableable, and exportable to SIEM/monitoring systems. (Animus Datalab.md §03.2.5, §08.8.2; ADR-006)

### Operations
- [SUPPORTED] Deployment models: single-cluster, multi-cluster, on-prem, private cloud, air-gapped. (Animus Datalab.md §09.2.1)
- [SUPPORTED] Helm charts and/or Kustomize manifests with versioned container images. (Animus Datalab.md §09.2.2)
- [SUPPORTED] Controlled upgrades with rollback and schema migrations. (Animus Datalab.md §09.6.1)
- [SUPPORTED] Backup & DR for metadata and audit with defined RPO/RTO. (Animus Datalab.md §09.5)
- [SUPPORTED] Control Plane operations idempotent where possible; Data Plane failure does not corrupt metadata/audit; Runs enter diagnostic states during loss of Data Plane. (Animus Datalab.md §03.5.1–03.5.2, §05.4.2, §05.6.2)

### Acceptance criteria
- [SUPPORTED] Production-grade definition based on full lifecycle in one Project, explicit reproducibility, end-to-end exportable audit, enforced security/access policies, install/upgrade/rollback readiness, and absence of hidden state. (Animus Datalab.md §10.3–10.9)

### Engagement prompts
- [SUPPORTED] Contact and review prompts are engagement language and do not assert system properties. (No doc mapping required.)

## Docs tab (Docs index + pages)

### Overview (`/docs/overview`)
Evidence: Animus Datalab.md §01.1–01.3
- [SUPPORTED] Animus Datalab is a corporate digital laboratory for machine learning designed to organize the full ML development lifecycle in a governed and reproducible form.
- [SUPPORTED] It unifies data work, experiments, model training and evaluation, and preparation for industrial use within a single operational contour with common rules of execution, security, and audit.
- [SUPPORTED] Ensure reproducibility of ML experiments and results.
- [SUPPORTED] Represent the full development context (data, code, environment, parameters, decisions) as explicit, connected entities.
- [SUPPORTED] Provide a developer working environment without violating corporate requirements.
- [SUPPORTED] Ensure manageability, audit, and security by default without external overlays.
- [SUPPORTED] Not a source control system for code.
- [SUPPORTED] Not an IDE or code editor as a product.
- [SUPPORTED] Not a full inference platform.
- [SUPPORTED] May integrate with external SCM, IDEs, and deployment/serving systems through managed environments and contracts.

### System Definition (`/docs/system-definition`)
Evidence: Animus Datalab.md §01.1, §01.3–01.4, §02.3
- [SUPPORTED] Animus Datalab is a corporate digital laboratory intended to organize the full ML lifecycle in a controlled and reproducible form.
- [SUPPORTED] The laboratory operates as a single operational contour with shared rules for execution, security, and audit.
- [SUPPORTED] The Control Plane never executes user code.
- [SUPPORTED] Any production-run is uniquely defined by DatasetVersion, CodeRef (commit SHA), and EnvironmentLock.
- [SUPPORTED] All significant actions are recorded as AuditEvent.
- [SUPPORTED] Data, code, environments, and results are explicit, versioned entities.
- [SUPPORTED] Hidden state that affects execution results is disallowed.
- [SUPPORTED] Everything that affects an execution result must be represented as an explicit entity or reference.
- [SUPPORTED] Actions that cannot be bound to explicit context are treated as design errors and must be eliminated or formalized.
- [SUPPORTED] Animus does not replace SCM systems, IDEs, or inference platforms.
- [SUPPORTED] External SCM, IDE tooling, and serving systems are integrated through explicit interfaces.

### Architecture (`/docs/architecture`)
Evidence: Animus Datalab.md §03.1–03.5; ADR-001
- [SUPPORTED] Animus is a distributed system with a strict separation between Control Plane and Data Plane responsibilities.
- [SUPPORTED] The separation isolates untrusted execution from governance and audit.
- [SUPPORTED] Control Plane provides UI, CLI/SDK, and API; API is the primary interface.
- [SUPPORTED] Control Plane stores metadata for Project, Dataset/DatasetVersion, Run/PipelineRun, Artifact, Model/ModelVersion, and policies.
- [SUPPORTED] Control Plane orchestrates execution: validates inputs, builds the Execution Plan, and schedules work.
- [SUPPORTED] Control Plane applies policies for access, production-run constraints, environments, network controls, retention, and governance.
- [SUPPORTED] Control Plane generates AuditEvent for administrative actions, state transitions, and data/artifact access.
- [SUPPORTED] Control Plane never executes user code and does not require direct access to execution data.
- [SUPPORTED] Data Plane executes user code in containerized, isolated environments with explicit resource limits.
- [SUPPORTED] Data Plane provides controlled access to DatasetVersion and Artifact storage interfaces.
- [SUPPORTED] Data Plane collects logs, metrics, and traces for each Run and PipelineRun.
- [SUPPORTED] Data Plane receives secrets temporarily and minimally, with access attempts recorded.
- [SUPPORTED] Kubernetes is the mandatory baseline execution environment.
- [SUPPORTED] User clients are untrusted; Control Plane is trusted and does not execute user code; Data Plane runs untrusted code; external systems integrate via contracts.
- [SUPPORTED] Control Plane operations are idempotent where possible.
- [SUPPORTED] Run statuses must transition to consistent diagnostic states during partial outages.
- [SUPPORTED] Reconciliation mechanisms restore observable state after temporary component loss.
- [SUPPORTED] Failure scenarios must be observable via metrics, logs, and traces.
- [SUPPORTED] Data Plane outages must not corrupt metadata, audit, or artifact references.

### Domain Model (`/docs/domain-model`)
Evidence: Animus Datalab.md §04.1–04.9
- [SUPPORTED] Project is the basic organizational and isolation unit representing one ML product or task.
- [SUPPORTED] Project defines access, execution, and team responsibility boundaries.
- [SUPPORTED] All domain entities belong to exactly one Project; cross-Project access is forbidden.
- [SUPPORTED] Project lifecycle: active and archived (archived is read-only and disallows new Runs).
- [SUPPORTED] Dataset is a logical data entity; DatasetVersion is immutable and used in Run as the primary data reference.
- [SUPPORTED] DatasetVersion is immutable; data changes are represented only by creating a new DatasetVersion.
- [SUPPORTED] Any Run must reference specific DatasetVersion identifiers.
- [SUPPORTED] DatasetVersion deletion is forbidden when referenced by Run, Model, or AuditEvent unless retention policy allows it.
- [SUPPORTED] CodeRef is a reference to user code in an external SCM and fixes the identification point; it does not store code.
- [SUPPORTED] Production-run requires CodeRef with commit SHA; branches or tags are not permitted.
- [SUPPORTED] CodeRef is immutable.
- [SUPPORTED] EnvironmentDefinition describes a logical execution environment (base image, dependencies, resources).
- [SUPPORTED] EnvironmentLock is a fixed, immutable representation used for execution.
- [SUPPORTED] Production-run must use EnvironmentLock.
- [SUPPORTED] EnvironmentLock is immutable and verifiable via digest and checksums.
- [SUPPORTED] Run is the unit of execution and reproducibility, linking data, code, environment, parameters, and execution results.
- [SUPPORTED] PipelineRun is a composed Run representing a DAG of node Runs.
- [SUPPORTED] Run statuses: queued, running, succeeded, failed, canceled, unknown.
- [SUPPORTED] Run cannot change input DatasetVersion and cannot exist without a Project.
- [SUPPORTED] Artifact is any result of Run execution; Artifacts are bound to Run and Project with controlled access.
- [SUPPORTED] Model is a logical entity representing model versions; ModelVersion is a concrete Run result recognized as a model.
- [SUPPORTED] ModelVersion statuses: draft, validated, approved, deprecated.
- [SUPPORTED] ModelVersion must reference Run; promotion is recorded in AuditEvent; export may be restricted by policy.
- [SUPPORTED] AuditEvent is an immutable record of a significant system action; append-only, exportable, with actor/action/object/timestamp/result.
- [SUPPORTED] The system can be reconstructed as a graph rooted at Project with Dataset/DatasetVersion, Environment/EnvironmentLock, Run/PipelineRun, Artifact, Model/ModelVersion, and AuditEvent as temporal dimension.

### Execution Model (`/docs/execution-model`)
Evidence: Animus Datalab.md §05.1–05.8
- [SUPPORTED] Isolation by default; declarative execution; controlled execution; observability; reproducibility.
- [SUPPORTED] Run creation requires access checks, reference validation, policy application, AuditEvent, queued status.
- [SUPPORTED] Execution Plan includes image digest, resources, network policies, secret references, data/artifact access, scheduler version.
- [SUPPORTED] Data Plane executes in isolated containers; Control Plane never executes user code.
- [SUPPORTED] Completion records final status, links Artifacts, emits AuditEvent and integration events.
- [SUPPORTED] Pipeline is a DAG; each node is a Run; validation and policies apply.
- [SUPPORTED] Error handling is policy-driven with explicit degradation rules.
- [SUPPORTED] retry/rerun/replay semantics with new Runs linked to originals.
- [SUPPORTED] Control Plane operations are idempotent where possible.
- [SUPPORTED] Runs execute in separate containers; resource limits are explicit; direct Control Plane metadata access is disallowed.
- [SUPPORTED] Error classes include user/data/environment/platform/policy; degradation preserves metadata and marks diagnostic states.
- [SUPPORTED] Logs, metrics, traces are collected and bound to Run/PipelineRun; secrets must not appear in logs, metrics, or artifacts.
- [SUPPORTED] Each significant execution stage produces AuditEvent.

### Interfaces (`/docs/interfaces`)
Evidence: Animus Datalab.md §06.1–06.7; Versioning & Compatibility Policy
- [SUPPORTED] API is the primary interface and source of truth; UI cannot bypass API contracts.
- [SUPPORTED] Interfaces are versioned; breaking changes require version increments.
- [SUPPORTED] Critical operations are idempotent and repeatable.
- [SUPPORTED] Domain entities are addressable resources with explicit lifecycle semantics.
- [SUPPORTED] Operations follow Create/Read/Update/Delete semantics with formal error responses.
- [SUPPORTED] Pipeline specification defines declarative execution structure; includes version, steps, dependencies, inputs/outputs, error policies, resources; validated before PipelineRun creation.
- [SUPPORTED] Events reflect state changes and are not a source of truth; canonical event types and delivery mechanisms are defined.
- [SUPPORTED] CLI and SDK are built on the public API; align with API contract stability and versioning.
- [SUPPORTED] UI is a visual representation of platform state and must not perform actions unavailable via API; it must not hide audit/diagnostic information.
- [SUPPORTED] All interfaces are subject to authentication, authorization, and audit requirements.

### Security (`/docs/security`)
Evidence: Animus Datalab.md §08; Animus Datalab - STM.md; ADR-006; RBAC Matrix
- [SUPPORTED] Security objectives: protect data/models/results, prevent implicit privilege escalation, ensure verifiable actions, maintain usability without bypasses.
- [SUPPORTED] Threat model assets, actors, and assumptions: Control Plane trusted, Data Plane untrusted, network untrusted.
- [SUPPORTED] SSO via OIDC/SAML; local accounts for air-gapped; service accounts; session TTL, forced logout, limited sessions; audited auth events; MFA via IdP.
- [SUPPORTED] Authorization based on Project-scoped RBAC with object-level policies and default deny; audited decisions.
- [SUPPORTED] Secrets are never stored in plain form and must not appear in UI/logs/metrics/artifacts; provided temporarily via external secret stores with audited access.
- [SUPPORTED] Data Plane executes in containerized environments with restricted privileges; network egress deny-by-default; explicit allow via policy; no direct Control Plane access.
- [SUPPORTED] Access to DatasetVersion and Artifacts is checked per request; model export can be restricted by policy.
- [SUPPORTED] AuditEvent records auth, access changes, data access, Run execution, model promotion/export; append-only, non-disableable, exportable to SIEM/monitoring.
- [SUPPORTED] Updates must be controlled and preserve data integrity; rollback and contract compatibility required; supply-chain controls include image verification and SBOM.

### Operations (`/docs/operations`)
Evidence: Animus Datalab.md §09; Operational Runbooks; Versioning & Compatibility Policy
- [SUPPORTED] Operational principles: predictability, observability by default, automation of critical procedures, separation of Control Plane/Data Plane responsibilities.
- [SUPPORTED] Deployment models: single-cluster, multi-cluster, on-prem, private cloud, air-gapped.
- [SUPPORTED] Installation artifacts: Helm charts/Kustomize, versioned images; no manual container edits or external network access for air-gapped.
- [SUPPORTED] External dependencies include metadata DB, object storage, IdP, secret store; documented/configurable/replaceable.
- [SUPPORTED] Control Plane scales horizontally; Data Plane scales by Run volume/resources/clusters; quotas and limits enforced.
- [SUPPORTED] Observability: metrics, structured logs without secrets, distributed tracing.
- [SUPPORTED] Backup/DR: metadata, audit, and configuration; defined RPO/RTO; documented and testable recovery.
- [SUPPORTED] Updates staged with rollback; schema migrations controlled and reversible; breaking changes require explicit versioning and migration guides.
- [SUPPORTED] Air-gapped mode requires offline image bundles, local registries, integrity verification.
- [SUPPORTED] Operational roles: Platform Owner, SRE/Platform Engineer, Security Officer, Project Maintainer.
- [SUPPORTED] Runbooks RB-01 through RB-07 defined for key operational incidents.

### Governance (`/docs/governance`)
Evidence: RBAC Matrix; Animus Datalab.md §03.2.4, §04.3.4–04.3.5, §04.9; ADR-006
- [SUPPORTED] Project-centric roles with default deny; object-level enforcement; audit by default.
- [SUPPORTED] Roles: Viewer, Developer, Maintainer, Admin; system roles include Platform Operator, Security Officer, Service Account.
- [SUPPORTED] Service accounts are minimally privileged, non-interactive, and audited.
- [SUPPORTED] Control Plane applies policies before execution; policy decisions recorded in AuditEvent.
- [SUPPORTED] AuditEvent append-only, non-disableable, exportable with actor/action/object/timestamp/result.
- [SUPPORTED] Retention/legal hold restrict DatasetVersion deletion; policies govern lifecycle transitions.

### Acceptance Criteria (`/docs/acceptance-criteria`)
Evidence: Animus Datalab.md §10
- [SUPPORTED] Acceptance defines formal production-grade conditions; not ready if any mandatory criterion unmet.
- [SUPPORTED] End-to-end scenarios: full ML lifecycle in one Project; reproducible production-run with determinism status; project isolation with audited denials.
- [SUPPORTED] Security/access criteria: SSO/local accounts, session TTL, RBAC enforcement, secrets handling.
- [SUPPORTED] Audit/traceability criteria: complete AuditEvent with actor/action/object/timestamp; reliable export.
- [SUPPORTED] Operational readiness criteria: automated install; updates without data loss and rollback; backup/DR procedures documented.
- [SUPPORTED] Observability criteria: metrics, structured logs, tracing.
- [SUPPORTED] Developer environment criteria: dev environments available; policy constraints transparent; no hidden state.
- [SUPPORTED] Production-grade definition paragraph.

### ADRs (`/docs/adrs`)
Evidence: Animus ADR.md
- [SUPPORTED] ADR-001 through ADR-006 summaries and consequences.

### Glossary (`/docs/glossary`)
Evidence: Animus Datalab.md §00.4, §02.2, §04.2–04.9
- [SUPPORTED] Definitions for Run, Control Plane, Data Plane, Immutable, Production-run, Project, Dataset, DatasetVersion, CodeRef, EnvironmentDefinition, EnvironmentLock, PipelineRun, Artifact, Model, ModelVersion, AuditEvent.

No unsupported or ambiguous claims remain.
