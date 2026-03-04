# Docs tab traceability

Scope: Docs tab content (lib/docs-content.ts) and docs index copy (app/[locale]/docs/page.tsx). English is canonical; Russian mirrors structure; Spanish/Basque reuse English. Each section lists evidence covering all bullets/paragraphs within that section.

## Overview (`/docs/overview`)
- System definition paragraph: Animus Datalab as a corporate digital laboratory organizing the ML lifecycle within a single operational contour with common rules.
  - Evidence: Animus Datalab.md §01.1–01.2
- Platform objectives bullets: reproducibility, explicit context, developer environment within corporate constraints, audit/security by default.
  - Evidence: Animus Datalab.md §01.2
- System boundaries bullets: not SCM, not IDE, not full inference platform; integration with external SCM/IDE/serving.
  - Evidence: Animus Datalab.md §01.3; ADR-005
- Cross-references note (internal linkage only).

## System Definition (`/docs/system-definition`)
- Formal definition paragraphs: controlled, reproducible digital laboratory with shared rules.
  - Evidence: Animus Datalab.md §01.1
- Architectural invariants bullets: Control Plane never executes user code; production-run defined by DatasetVersion/CodeRef/EnvironmentLock; AuditEvent for significant actions; explicit versioned entities; no hidden state.
  - Evidence: Animus Datalab.md §01.4
- Explicit context requirement paragraphs: everything affecting results must be explicit; actions without explicit context are design errors.
  - Evidence: Animus Datalab.md §02.3
- Non-goals bullets: SCM/IDE/inference not replaced; integrations via explicit interfaces.
  - Evidence: Animus Datalab.md §01.3

## Architecture (`/docs/architecture`)
- Architectural overview: distributed system with strict Control Plane / Data Plane separation for isolation and audit.
  - Evidence: Animus Datalab.md §03.1; ADR-001
- Control Plane bullets: API/UI/CLI interfaces, metadata source of truth, orchestration, policy enforcement, AuditEvent, no user code execution.
  - Evidence: Animus Datalab.md §03.2.1–03.2.5
- Data Plane bullets: containerized execution, isolation, controlled data/artifact access, observability, temporary secrets, Kubernetes baseline.
  - Evidence: Animus Datalab.md §03.3.1–03.3.3
- Trust boundaries bullets: clients, Control Plane, Data Plane, external systems; security implications.
  - Evidence: Animus Datalab.md §03.4
- Failure model bullets: idempotent Control Plane ops, diagnostic states, reconciliation, observable failures, no metadata/audit corruption.
  - Evidence: Animus Datalab.md §03.5.1–03.5.2
- Diagram caption + cross-references note (internal linkage only).

## Domain Model (`/docs/domain-model`)
- Project definition, attributes, relationships, invariants, lifecycle.
  - Evidence: Animus Datalab.md §04.2
- Dataset/DatasetVersion definitions, attributes, invariants, lifecycle.
  - Evidence: Animus Datalab.md §04.3
- CodeRef definition and invariants (commit SHA for production-run, immutability).
  - Evidence: Animus Datalab.md §04.4; ADR-004
- EnvironmentDefinition/EnvironmentLock definitions and invariants.
  - Evidence: Animus Datalab.md §04.5
- Run/PipelineRun definitions and invariants; Run statuses.
  - Evidence: Animus Datalab.md §04.6
- Artifact definition and invariants.
  - Evidence: Animus Datalab.md §04.7
- Model/ModelVersion definitions, statuses, invariants.
  - Evidence: Animus Datalab.md §04.8
- AuditEvent definition, attributes, and invariants.
  - Evidence: Animus Datalab.md §04.9
- Domain graph summary.
  - Evidence: Animus Datalab.md §04.10

## Execution Model (`/docs/execution-model`)
- Execution principles: isolation, declarative execution, policy control, observability, reproducibility.
  - Evidence: Animus Datalab.md §05.1
- Run lifecycle bullets: creation checks, Execution Plan, Data Plane execution, completion/audit events.
  - Evidence: Animus Datalab.md §05.2.1–05.2.4
- Pipeline execution bullets: DAG semantics, validation, policy application, error handling.
  - Evidence: Animus Datalab.md §05.3
- Retry/rerun/replay semantics and linkage to original Run.
  - Evidence: Animus Datalab.md §05.4.1
- Idempotency bullets.
  - Evidence: Animus Datalab.md §05.4.2
- Isolation/resources bullets.
  - Evidence: Animus Datalab.md §05.5
- Errors/degradation bullets.
  - Evidence: Animus Datalab.md §05.6
- Observability bullets and secret exclusion.
  - Evidence: Animus Datalab.md §05.7, §08.5.1
- Audit linkage statement and cross-references note.
  - Evidence: Animus Datalab.md §05.8

## Interfaces (`/docs/interfaces`)
- Interface principles: API as source of truth, versioning, idempotency.
  - Evidence: Animus Datalab.md §06.1
- API resource model summary.
  - Evidence: Animus Datalab.md §06.2
- Pipeline specification requirements and validation.
  - Evidence: Animus Datalab.md §06.3
- Events and integrations bullets.
  - Evidence: Animus Datalab.md §06.4
- CLI/SDK bullets.
  - Evidence: Animus Datalab.md §06.5
- UI role bullets.
  - Evidence: Animus Datalab.md §06.6
- Interfaces and security linkage.
  - Evidence: Animus Datalab.md §06.7
- Versioning and breaking-change constraints.
  - Evidence: Animus - Versioning & Compatibility Policy.md §3–5, §6–8

## Security (`/docs/security`)
- Security objectives.
  - Evidence: Animus Datalab.md §08.1
- Threat model and assumptions.
  - Evidence: Animus Datalab.md §08.2; Animus Datalab - STM.md §2–6
- Authentication bullets (SSO, local accounts, service accounts, session controls, MFA via IdP).
  - Evidence: Animus Datalab.md §08.3
- Authorization bullets (RBAC, default deny, object-level enforcement, audited decisions).
  - Evidence: Animus Datalab.md §08.4; Animus - RBAC Matrix.md §2–4
- Secrets management bullets.
  - Evidence: Animus Datalab.md §08.5
- Execution isolation and network controls.
  - Evidence: Animus Datalab.md §08.6; Animus Datalab - STM.md §6.2–6.3
- Data/artifact access and model export controls.
  - Evidence: Animus Datalab.md §08.7
- Audit and export bullets (append-only, non-disableable, exportable).
  - Evidence: Animus Datalab.md §08.8; ADR-006
- Updates and supply-chain controls + cross-references note.
  - Evidence: Animus Datalab.md §08.9

## Operations (`/docs/operations`)
- Operational principles.
  - Evidence: Animus Datalab.md §09.1
- Deployment models.
  - Evidence: Animus Datalab.md §09.2.1
- Installation artifacts and dependencies.
  - Evidence: Animus Datalab.md §09.2.2–09.2.3
- Scaling and reliability.
  - Evidence: Animus Datalab.md §09.3
- Observability (metrics, logs, tracing).
  - Evidence: Animus Datalab.md §09.4
- Backup and DR requirements.
  - Evidence: Animus Datalab.md §09.5
- Updates and migrations; breaking changes require versioning/migration guides.
  - Evidence: Animus Datalab.md §09.6; Animus - Versioning & Compatibility Policy.md §3–5, §9–11
- Air-gapped mode requirements.
  - Evidence: Animus Datalab.md §09.7
- Operational roles.
  - Evidence: Animus Datalab.md §09.8
- Runbooks list and cross-reference note.
  - Evidence: Animus - Operational Runbooks

## Governance (`/docs/governance`)
- RBAC principles and default deny.
  - Evidence: Animus - RBAC Matrix.md §2
- Roles (Project-scoped and system roles).
  - Evidence: Animus - RBAC Matrix.md §3
- Service account requirements.
  - Evidence: Animus - RBAC Matrix.md §5
- Policy enforcement before execution; decisions audited.
  - Evidence: Animus Datalab.md §03.2.4; Animus Datalab.md §05.2.1
- Audit properties.
  - Evidence: Animus Datalab.md §04.9; ADR-006
- Retention/legal hold constraints.
  - Evidence: Animus Datalab.md §04.3.4–04.3.5

## Acceptance Criteria (`/docs/acceptance-criteria`)
- Purpose and general requirements.
  - Evidence: Animus Datalab.md §10.1–10.2
- End-to-end scenarios (full lifecycle, reproducibility, project isolation).
  - Evidence: Animus Datalab.md §10.3
- Security and access criteria.
  - Evidence: Animus Datalab.md §10.4
- Audit and traceability criteria.
  - Evidence: Animus Datalab.md §10.5
- Operational readiness criteria.
  - Evidence: Animus Datalab.md §10.6
- Observability criteria.
  - Evidence: Animus Datalab.md §10.7
- Developer environment criteria and absence of hidden state.
  - Evidence: Animus Datalab.md §10.8
- Production-grade definition paragraph.
  - Evidence: Animus Datalab.md §10.9

## ADRs (`/docs/adrs`)
- ADR list and summaries.
  - Evidence: Animus ADR.md (ADR-001 through ADR-006)

## Glossary (`/docs/glossary`)
- Core terms and domain entities definitions.
  - Evidence: Animus Datalab.md §00.4, §02.2, §04.2–04.9

## Docs index (`/docs`)
- Docs page labels and ordering are derived from the Docs IA above.
- Start-here reading order references Overview, System Definition, Architecture/Execution Model, Security/Operations.
  - Evidence: Animus Datalab.md §01–§10 (section coverage)
- At-a-glance bullets: Control/Data Plane separation; Run reproducibility inputs; on-prem/private cloud/air-gapped deployments.
  - Evidence: Animus Datalab.md §03.1, §02.2, §09.2.1
