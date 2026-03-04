import { type Locale } from './i18n';

export type DocsSection = {
  id: string;
  title: string;
  body?: string[];
  bullets?: string[];
  code?: { language: string; value: string };
  note?: { title: string; body: string };
  media?: { type: 'image'; src: string; alt: string };
};

export type DocsPage = {
  slug: string;
  title: string;
  description: string;
  sections: DocsSection[];
  keywords?: string[];
};

export type DocsNavItem = {
  label: string;
  slug: string;
};

export type DocsCard = {
  title: string;
  description: string;
  slug: string;
};

type DocsContent = {
  nav: DocsNavItem[];
  cards: DocsCard[];
  pages: DocsPage[];
};

const docsContentEn: DocsContent = {
  nav: [
    { label: 'Overview', slug: 'overview' },
    { label: 'System Definition', slug: 'system-definition' },
    { label: 'Architecture', slug: 'architecture' },
    { label: 'Domain Model', slug: 'domain-model' },
    { label: 'Execution Model', slug: 'execution-model' },
    { label: 'Interfaces', slug: 'interfaces' },
    { label: 'Security', slug: 'security' },
    { label: 'Operations', slug: 'operations' },
    { label: 'Governance', slug: 'governance' },
    { label: 'Acceptance Criteria', slug: 'acceptance-criteria' },
    { label: 'ADRs', slug: 'adrs' },
    { label: 'Glossary', slug: 'glossary' },
  ],
  cards: [
    {
      title: 'Overview',
      description: 'Scope, purpose, and system boundaries.',
      slug: 'overview',
    },
    {
      title: 'System Definition',
      description: 'Formal definition, invariants, and non-goals.',
      slug: 'system-definition',
    },
    {
      title: 'Architecture',
      description: 'Control Plane, Data Plane, and trust boundaries.',
      slug: 'architecture',
    },
    {
      title: 'Domain Model',
      description: 'Canonical entities, attributes, and invariants.',
      slug: 'domain-model',
    },
    {
      title: 'Execution Model',
      description: 'Declarative execution, Run lifecycle, and DAG semantics.',
      slug: 'execution-model',
    },
    {
      title: 'Interfaces',
      description: 'API, Pipeline specification, events, CLI/SDK, and UI role.',
      slug: 'interfaces',
    },
    {
      title: 'Security',
      description: 'Authentication, RBAC, isolation, secrets, and audit.',
      slug: 'security',
    },
    {
      title: 'Operations',
      description: 'Deployment models, observability, backup/DR, upgrades, runbooks.',
      slug: 'operations',
    },
    {
      title: 'Governance',
      description: 'RBAC model, policy enforcement, audit, and retention controls.',
      slug: 'governance',
    },
    {
      title: 'Acceptance Criteria',
      description: 'Production-grade conditions and verification scenarios.',
      slug: 'acceptance-criteria',
    },
    {
      title: 'ADRs',
      description: 'Architectural decisions and their rationale.',
      slug: 'adrs',
    },
    {
      title: 'Glossary',
      description: 'Canonical terminology and definitions.',
      slug: 'glossary',
    },
  ],
  pages: [
    {
      slug: 'overview',
      title: 'Overview',
      description: 'System scope, purpose, and boundaries.',
      keywords: ['definition', 'scope', 'boundaries'],
      sections: [
        {
          id: 'definition',
          title: 'System definition',
          body: [
            'Animus Datalab is a corporate digital laboratory for machine learning designed to organize the full ML development lifecycle in a governed and reproducible form.',
            'It unifies data work, experiments, model training and evaluation, and preparation for industrial use within a single operational contour with common rules of execution, security, and audit.',
          ],
        },
        {
          id: 'objectives',
          title: 'Platform objectives',
          bullets: [
            'Ensure reproducibility of ML experiments and results.',
            'Represent the full development context (data, code, environment, parameters, decisions) as explicit, connected entities.',
            'Provide a developer working environment without violating corporate requirements.',
            'Ensure manageability, audit, and security by default without external overlays.',
          ],
        },
        {
          id: 'boundaries',
          title: 'System boundaries',
          bullets: [
            'Not a source control system for code.',
            'Not an IDE or code editor as a product.',
            'Not a full inference platform.',
            'May integrate with external SCM (Git), IDEs (VS Code, JetBrains) as managed environments, and external deployment/serving systems.',
          ],
          note: {
            title: 'Cross-references',
            body: 'See System Definition for invariants and explicit context, Domain Model for canonical entities, and Architecture for plane separation.',
          },
        },
      ],
    },
    {
      slug: 'system-definition',
      title: 'System Definition',
      description: 'Formal definition, invariants, and explicit context requirements.',
      keywords: ['invariants', 'definition', 'context'],
      sections: [
        {
          id: 'formal-definition',
          title: 'Formal definition',
          body: [
            'Animus Datalab is a corporate digital laboratory for machine learning intended to organize the full ML development lifecycle in a controlled and reproducible form.',
            'The laboratory operates as a single operational contour with shared rules for execution, security, and audit.',
          ],
        },
        {
          id: 'invariants',
          title: 'Architectural invariants',
          bullets: [
            'The Control Plane never executes user code.',
            'Any production-run is uniquely defined by DatasetVersion, CodeRef (commit SHA), and EnvironmentLock.',
            'All significant actions are recorded as AuditEvent.',
            'Data, code, environments, and results are explicit, versioned entities.',
            'Hidden state that affects execution results is disallowed.',
          ],
        },
        {
          id: 'explicit-context',
          title: 'Explicit context requirement',
          body: [
            'Everything that affects an execution result must be represented in the system as an explicit entity or reference to an entity.',
            'Actions that cannot be bound to explicit context are treated as design errors and must be eliminated or formalized.',
          ],
        },
        {
          id: 'non-goals',
          title: 'Non-goals',
          bullets: [
            'Animus does not replace SCM systems, IDEs, or inference platforms.',
            'External SCM, IDE tooling, and serving systems are integrated through explicit interfaces.',
          ],
        },
      ],
    },
    {
      slug: 'architecture',
      title: 'Architecture',
      description: 'Control Plane, Data Plane, trust boundaries, and failure model.',
      keywords: ['control plane', 'data plane', 'trust boundaries'],
      sections: [
        {
          id: 'overview',
          title: 'Architectural overview',
          body: [
            'Animus is a distributed system with a strict separation between Control Plane and Data Plane responsibilities.',
            'The separation is a core invariant intended to isolate untrusted execution from governance and audit.',
          ],
        },
        {
          id: 'control-plane',
          title: 'Control Plane',
          bullets: [
            'Provides UI, CLI/SDK, and API interfaces; API is the primary interface.',
            'Stores metadata for Project, Dataset/DatasetVersion, Run/PipelineRun, Artifact, Model/ModelVersion, and policies.',
            'Orchestrates execution: validates inputs, builds the Execution Plan, and schedules work.',
            'Applies policies for access, production-run constraints, environments, network controls, retention, and governance.',
            'Generates AuditEvent for administrative actions, state transitions, and data/artifact access.',
            'Never executes user code and does not require direct access to execution data.',
          ],
        },
        {
          id: 'data-plane',
          title: 'Data Plane',
          bullets: [
            'Executes user code in containerized, isolated environments with explicit resource limits.',
            'Provides controlled access to DatasetVersion and Artifact storage interfaces.',
            'Collects logs, metrics, and traces for each Run and PipelineRun.',
            'Receives secrets temporarily and minimally, with access attempts recorded.',
            'Uses Kubernetes as the mandatory baseline execution environment.',
          ],
        },
        {
          id: 'trust-boundaries',
          title: 'Trust boundaries',
          bullets: [
            'User clients (UI/CLI/SDK) are untrusted environments requiring strict authentication and authorization.',
            'Control Plane is a trusted management boundary that does not execute user code.',
            'Data Plane runs untrusted user code and isolates it by design.',
            'External systems (SCM, registry, vault, storage, SIEM) have independent trust boundaries and integrate via contracts.',
          ],
        },
        {
          id: 'failure-model',
          title: 'Principled failure model',
          bullets: [
            'Control Plane operations are idempotent where possible.',
            'Run statuses must transition to consistent diagnostic states during partial outages.',
            'Reconciliation mechanisms restore observable state after temporary component loss.',
            'Failure scenarios must be observable via metrics, logs, and traces.',
            'Data Plane outages must not corrupt metadata, audit, or artifact references.',
          ],
        },
        {
          id: 'diagram',
          title: 'Control Plane and Data Plane separation',
          body: ['The diagram illustrates the separation between management and execution planes.'],
          media: {
            type: 'image',
            src: '/assets/diagram-control-plane.svg',
            alt: 'Control Plane and Data Plane separation diagram',
          },
          note: {
            title: 'Cross-references',
            body: 'See Execution Model for Run lifecycle and pipeline semantics; see Security for trust boundaries and isolation requirements.',
          },
        },
      ],
    },
    {
      slug: 'domain-model',
      title: 'Domain Model',
      description: 'Canonical entities, attributes, and invariants.',
      keywords: ['project', 'dataset', 'run', 'model', 'audit'],
      sections: [
        {
          id: 'project',
          title: 'Project',
          body: [
            'Project is the basic organizational and isolation unit in Animus, representing one ML product or independent ML task.',
          ],
          bullets: [
            'Defines boundaries of access, execution, and team responsibility.',
            'All domain entities belong to exactly one Project; cross-Project access is forbidden.',
            'Lifecycle: active and archived; archived Projects are read-only and disallow new Run creation.',
          ],
        },
        {
          id: 'datasets',
          title: 'Dataset and DatasetVersion',
          body: [
            'Dataset is a logical data entity; DatasetVersion is an immutable version used in Run and serves as the primary data reference for reproducibility.',
          ],
          bullets: [
            'DatasetVersion is immutable; data changes are represented only by creating a new DatasetVersion.',
            'Any Run must reference specific DatasetVersion identifiers.',
            'DatasetVersion deletion is forbidden when referenced by Run, Model, or AuditEvent unless retention policy allows it.',
          ],
        },
        {
          id: 'coderef',
          title: 'CodeRef',
          body: [
            'CodeRef is a reference to user code in an external SCM and fixes the identification point; it does not store code.',
          ],
          bullets: [
            'Production-run requires CodeRef with commit SHA; branches or tags are not permitted.',
            'CodeRef is immutable.',
          ],
        },
        {
          id: 'environment',
          title: 'EnvironmentDefinition and EnvironmentLock',
          body: [
            'EnvironmentDefinition describes a logical execution environment (base image, dependencies, resources).',
            'EnvironmentLock is a fixed, immutable representation used for execution.',
          ],
          bullets: [
            'Production-run must use EnvironmentLock.',
            'EnvironmentLock is immutable and verifiable via digest and checksums.',
          ],
        },
        {
          id: 'run',
          title: 'Run and PipelineRun',
          body: [
            'Run is the unit of execution and reproducibility, linking data, code, environment, parameters, and execution results.',
            'PipelineRun is a composed Run representing a DAG of node Runs.',
          ],
          bullets: [
            'Run statuses: queued, running, succeeded, failed, canceled, unknown.',
            'Run cannot change input DatasetVersion and cannot exist without a Project.',
          ],
        },
        {
          id: 'artifact',
          title: 'Artifact',
          body: ['Artifact is any result of Run execution (logs, metrics, files, models, reports).'],
          bullets: [
            'Artifact is always bound to a Run and cannot exist outside a Project.',
            'Artifact access is controlled by Project permissions.',
          ],
        },
        {
          id: 'model',
          title: 'Model and ModelVersion',
          body: [
            'Model is a logical entity representing a family of model versions; ModelVersion is a concrete Run result recognized as a model.',
          ],
          bullets: [
            'ModelVersion statuses: draft, validated, approved, deprecated.',
            'ModelVersion must reference Run; promotion is recorded in AuditEvent.',
            'Export of approved models may be restricted by policy.',
          ],
        },
        {
          id: 'audit',
          title: 'AuditEvent',
          body: ['AuditEvent is an immutable record of a significant system action.'],
          bullets: [
            'AuditEvent is append-only and cannot be modified or deleted.',
            'AuditEvent is exportable.',
            'AuditEvent includes actor, action, object reference, timestamp, and result.',
          ],
        },
        {
          id: 'graph',
          title: 'Domain graph',
          body: [
            'The system can be reconstructed as a graph rooted at Project, with Dataset/DatasetVersion, Environment/EnvironmentLock, Run/PipelineRun, Artifact, Model/ModelVersion, and AuditEvent as the temporal dimension.',
          ],
        },
      ],
    },
    {
      slug: 'execution-model',
      title: 'Execution Model',
      description: 'Declarative execution, Run lifecycle, and pipeline semantics.',
      keywords: ['run', 'pipeline', 'execution plan', 'observability'],
      sections: [
        {
          id: 'principles',
          title: 'Execution principles',
          bullets: [
            'Isolation by default: each Run executes in an isolated environment.',
            'Declarative execution: users declare what to execute; the platform defines how.',
            'Controlled execution: policies, resource limits, and security constraints are enforced.',
            'Observability: execution status and results are captured for analysis.',
            'Reproducibility: fixed inputs and explicit dependencies; no hidden state.',
          ],
        },
        {
          id: 'lifecycle',
          title: 'Run lifecycle',
          bullets: [
            'Creation: Control Plane checks access, validates references, applies policies, records AuditEvent, sets status queued.',
            'Planning: Control Plane forms the Execution Plan with image digest, resources, network policies, secret references, data/artifact access points, and scheduler version.',
            'Execution: Data Plane executes user code in isolated containers; Control Plane never executes user code.',
            'Completion: Control Plane records final status, links Artifacts, and emits AuditEvent and integration events.',
          ],
        },
        {
          id: 'pipeline',
          title: 'Pipeline execution',
          bullets: [
            'Pipeline is a directed acyclic graph (DAG) of execution steps.',
            'Each node executes as an individual Run; Control Plane validates the DAG and applies policies.',
            'Error handling is policy-driven: success, failure, or partial success with explicit degradation rules.',
          ],
        },
        {
          id: 'retries',
          title: 'Retry, rerun, replay',
          bullets: [
            'retry: automatic repeat after transient failure.',
            'rerun: repeat with the same inputs.',
            'replay: repeat using the saved Execution Plan.',
            'Each repeat is recorded as a new Run linked to the original.',
          ],
        },
        {
          id: 'idempotency',
          title: 'Idempotency',
          bullets: [
            'Control Plane operations are idempotent where possible.',
            'Repeated requests with the same identifiers do not create duplicates.',
          ],
        },
        {
          id: 'isolation',
          title: 'Isolation and resources',
          bullets: [
            'Runs execute in separate containers within a Project context.',
            'CPU, RAM, GPU, and ephemeral storage limits are explicit per Run.',
            'Direct access from Run to Control Plane metadata is disallowed.',
          ],
        },
        {
          id: 'errors',
          title: 'Errors and degradation',
          bullets: [
            'Error classes include user, data, environment, platform, and policy violations.',
            'Degradation preserves metadata consistency and marks Runs as unknown/reconciling when needed.',
          ],
        },
        {
          id: 'observability',
          title: 'Observability',
          bullets: [
            'Logs, metrics, and traces are collected and bound to Run and PipelineRun.',
            'Secrets and sensitive data must not appear in logs, metrics, or artifacts.',
          ],
        },
        {
          id: 'audit',
          title: 'Audit linkage',
          body: [
            'Each significant execution stage produces AuditEvent, including policy application, status transitions, errors, and completion.',
          ],
          note: {
            title: 'Cross-references',
            body: 'See Architecture for plane separation and trust boundaries; see Security for secret and network constraints.',
          },
        },
      ],
    },
    {
      slug: 'interfaces',
      title: 'Interfaces',
      description: 'API, Pipeline specification, events, CLI/SDK, and UI principles.',
      keywords: ['api', 'pipeline specification', 'events', 'cli', 'sdk'],
      sections: [
        {
          id: 'principles',
          title: 'Interface principles',
          bullets: [
            'API is the primary interface and source of truth; UI cannot bypass API contracts.',
            'Interfaces are versioned; breaking changes require version increments.',
            'Critical operations are idempotent and repeatable.',
          ],
        },
        {
          id: 'resource-model',
          title: 'API resource model',
          body: [
            'Each domain entity is an addressable resource with explicit lifecycle semantics.',
            'Operations follow Create, Read, Update, Delete semantics with formal error responses.',
          ],
        },
        {
          id: 'pipeline-spec',
          title: 'Pipeline specification',
          bullets: [
            'Defines declarative execution structure and is the input contract for orchestration.',
            'Includes specification version, steps, dependencies, inputs/outputs, error policies, and resource requirements.',
            'Control Plane validates specification structure and policy compliance before PipelineRun creation.',
          ],
        },
        {
          id: 'events',
          title: 'Events and integrations',
          bullets: [
            'Events reflect state changes and are not a source of truth.',
            'Canonical event types and delivery mechanisms are defined for integration.',
          ],
        },
        {
          id: 'cli-sdk',
          title: 'CLI and SDK',
          bullets: [
            'CLI and SDK are built on the public API.',
            'CLI/SDK requirements align with API contract stability and versioning.',
          ],
        },
        {
          id: 'ui',
          title: 'UI role',
          bullets: [
            'UI is a visual representation of platform state and must not perform actions unavailable via API.',
            'UI must not hide information relevant to audit or diagnostics and must reflect platform constraints.',
          ],
        },
        {
          id: 'security-linkage',
          title: 'Interfaces and security',
          body: [
            'All interfaces are subject to authentication, authorization, and audit requirements.',
          ],
        },
      ],
    },
    {
      slug: 'security',
      title: 'Security',
      description: 'Security model, authentication, RBAC, isolation, secrets, and audit.',
      keywords: ['rbac', 'audit', 'secrets', 'egress', 'sso'],
      sections: [
        {
          id: 'objectives',
          title: 'Security objectives',
          bullets: [
            'Protect data, models, and results from unauthorized access.',
            'Prevent implicit privilege escalation and hidden channels of influence.',
            'Ensure actions are verifiable through audit.',
            'Maintain developer usability without bypasses.',
          ],
        },
        {
          id: 'threat-model',
          title: 'Threat model and assumptions',
          bullets: [
            'Assets include data, models, artifacts, metadata, credentials, and audit history.',
            'Threat actors include legitimate users with errors, abuse, compromised accounts, untrusted user code, and infrastructure compromise.',
            'Control Plane is trusted and never executes user code; Data Plane executes untrusted code and isolates it; network is untrusted.',
          ],
        },
        {
          id: 'authentication',
          title: 'Authentication',
          bullets: [
            'SSO via OIDC and/or SAML is required; local accounts are supported for air-gapped environments.',
            'Service accounts are supported for automation and CI/CD.',
            'Session management includes TTL, forced logout, limited parallel sessions, and audited login/logout events.',
            'MFA is enforced via external IdP.',
          ],
        },
        {
          id: 'authorization',
          title: 'Authorization',
          bullets: [
            'Authorization is based on Project-scoped RBAC with object-level policies.',
            'Default deny applies when no explicit permission is present.',
            'Every operation is checked for permissions and recorded in AuditEvent.',
          ],
        },
        {
          id: 'secrets',
          title: 'Secrets management',
          bullets: [
            'Secrets are never stored in plain form and must not appear in UI, logs, metrics, or artifacts.',
            'Integration with external secret stores is required; secrets are provided temporarily and minimally.',
            'Secret access attempts are audited.',
          ],
        },
        {
          id: 'isolation',
          title: 'Execution isolation and network controls',
          bullets: [
            'Data Plane executes user code in containerized environments with restricted privileges.',
            'Network egress is deny-by-default and explicitly allowed by policy.',
            'Runs must not access Control Plane directly beyond required interfaces.',
          ],
        },
        {
          id: 'data-artifacts',
          title: 'Data and artifact access',
          bullets: [
            'Access to DatasetVersion is checked on every request and scoped by Project.',
            'Artifacts are stored within Project boundaries and governed by role-based access.',
            'Model export can be restricted by policy and requires appropriate approvals.',
          ],
        },
        {
          id: 'audit',
          title: 'Audit and export',
          bullets: [
            'AuditEvent records authentication, authorization changes, data access, Run execution, and model promotion/export.',
            'AuditEvent is append-only and cannot be disabled.',
            'Audit must be exportable to SIEM and monitoring systems with reliable delivery.',
          ],
        },
        {
          id: 'updates',
          title: 'Updates and vulnerabilities',
          bullets: [
            'Updates must be controlled and preserve data integrity.',
            'Rollback and compatibility of schemas and contracts are required.',
            'Supply-chain controls include image verification and SBOM support.',
          ],
          note: {
            title: 'Cross-references',
            body: 'See Governance for RBAC roles and audit policy; see Operations for incident runbooks and recovery procedures.',
          },
        },
      ],
    },
    {
      slug: 'operations',
      title: 'Operations',
      description: 'Deployment, reliability, observability, backups, and runbooks.',
      keywords: ['deployment', 'observability', 'backup', 'upgrade', 'runbooks'],
      sections: [
        {
          id: 'principles',
          title: 'Operational principles',
          bullets: [
            'Predictable behavior under load, failure, and updates.',
            'Observability by default without manual diagnostics.',
            'Automation of critical procedures: install, update, recovery.',
            'Separation of responsibilities between Control Plane and Data Plane operations.',
          ],
        },
        {
          id: 'deployment',
          title: 'Deployment models',
          bullets: [
            'Single-cluster: Control Plane and Data Plane in one Kubernetes cluster.',
            'Multi-cluster: one Control Plane with multiple Data Plane clusters.',
            'On-premise, private cloud, and air-gapped environments are supported.',
          ],
        },
        {
          id: 'artifacts',
          title: 'Installation artifacts and dependencies',
          bullets: [
            'Delivery via Helm charts and/or Kustomize manifests with versioned container images.',
            'Installation does not require manual container edits, source code modification, or external network access for air-gapped deployments.',
            'External dependencies include metadata database, object storage, IdP, and secret store, all documented and replaceable.',
          ],
        },
        {
          id: 'scaling',
          title: 'Scaling and reliability',
          bullets: [
            'Control Plane supports horizontal scaling and external state storage.',
            'Data Plane scales by Run volume, resource requirements, and cluster count.',
            'Project-level quotas, global limits, and scheduling priorities are enforced.',
          ],
        },
        {
          id: 'observability',
          title: 'Observability',
          bullets: [
            'Metrics for Control Plane and Data Plane, Run/PipelineRun, queues, and scheduler.',
            'Structured logs collected centrally without secrets.',
            'Distributed tracing for API requests and orchestration paths.',
          ],
        },
        {
          id: 'backup-dr',
          title: 'Backup and disaster recovery',
          bullets: [
            'Metadata, audit data, and platform configuration are subject to backup.',
            'RPO and RTO targets must be defined per installation.',
            'Recovery procedures are documented, testable, and automatable.',
          ],
        },
        {
          id: 'updates',
          title: 'Updates and migrations',
          bullets: [
            'Updates are staged and support rollback.',
            'Schema migrations are controlled and reversible where possible.',
            'Breaking changes require explicit versioning and migration guides.',
          ],
        },
        {
          id: 'air-gapped',
          title: 'Air-gapped mode',
          bullets: [
            'Air-gapped installations operate without access to public repositories.',
            'Offline image bundles, local registries, and integrity verification are required.',
          ],
        },
        {
          id: 'roles',
          title: 'Operational roles',
          bullets: [
            'Platform Owner: overall installation responsibility.',
            'SRE / Platform Engineer: reliability and operations.',
            'Security Officer: security controls and compliance review.',
            'Project Maintainer: management of individual Projects.',
          ],
        },
        {
          id: 'runbooks',
          title: 'Operational runbooks',
          bullets: [
            'RB-01: Control Plane unavailable.',
            'RB-02: Run stuck in queued.',
            'RB-03: Data Plane unavailable or degraded.',
            'RB-04: Audit export failure.',
            'RB-05: Suspected account compromise.',
            'RB-06: Data or model leakage incident.',
            'RB-07: Control Plane metadata loss.',
          ],
          note: {
            title: 'Cross-references',
            body: 'See Acceptance Criteria for operational readiness checks and required verification scenarios.',
          },
        },
      ],
    },
    {
      slug: 'governance',
      title: 'Governance',
      description: 'RBAC, policy enforcement, audit, and retention controls.',
      keywords: ['rbac', 'audit', 'policy', 'retention'],
      sections: [
        {
          id: 'rbac-principles',
          title: 'RBAC model',
          bullets: [
            'Project-centric roles with default deny.',
            'Object-level enforcement for Dataset, Run, Model, and Audit operations.',
            'All access and state changes are audited by default.',
          ],
        },
        {
          id: 'roles',
          title: 'Roles',
          bullets: [
            'Project-scoped roles: Viewer, Developer, Maintainer, Admin.',
            'System roles: Platform Operator, Security Officer, Service Account.',
          ],
        },
        {
          id: 'service-accounts',
          title: 'Service accounts',
          bullets: [
            'Operate within Project or System scope with minimal privileges.',
            'Do not use interactive sessions and have limited token TTL.',
            'All service account actions are audited.',
          ],
        },
        {
          id: 'policy-enforcement',
          title: 'Policy enforcement',
          bullets: [
            'Control Plane applies policies for access, production-run constraints, environments, network controls, and retention/governance before execution.',
            'Policy decisions are recorded in AuditEvent.',
          ],
        },
        {
          id: 'audit',
          title: 'Audit',
          bullets: [
            'AuditEvent is append-only, non-disableable, and exportable.',
            'AuditEvent includes actor, action, object reference, timestamp, and result.',
            'Audit coverage includes authentication, access changes, data access, Run execution, and model promotion/export.',
          ],
        },
        {
          id: 'retention',
          title: 'Retention and legal hold',
          bullets: [
            'DatasetVersion deletion is restricted by retention policy and legal hold.',
            'Retention policies govern lifecycle transitions (deprecated, expired, deleted).',
          ],
          note: {
            title: 'Cross-references',
            body: 'See Security for threat model assumptions and audit constraints.',
          },
        },
      ],
    },
    {
      slug: 'acceptance-criteria',
      title: 'Acceptance Criteria',
      description: 'Production-grade conditions and verification scenarios.',
      keywords: ['acceptance', 'production-grade', 'criteria'],
      sections: [
        {
          id: 'purpose',
          title: 'Purpose',
          body: [
            'Acceptance criteria define formal conditions under which Animus Datalab is considered production-grade and suitable for regulated environments.',
          ],
        },
        {
          id: 'general',
          title: 'General requirements',
          bullets: [
            'The platform is not considered ready if any mandatory criterion is unmet.',
            'Acceptance is performed on a working installation with audit and security policies enabled.',
          ],
        },
        {
          id: 'e2e',
          title: 'End-to-end scenarios',
          bullets: [
            'Full ML lifecycle in one Project with DatasetVersion, CodeRef commit SHA, and EnvironmentLock.',
            'Reproducible production-run with explicit determinism status.',
            'Project isolation with audited access denials.',
          ],
        },
        {
          id: 'security',
          title: 'Security and access',
          bullets: [
            'SSO or local accounts for air-gapped environments; session TTL and forced logout.',
            'RBAC enforcement with object-level permissions.',
            'Secrets are temporary, never exposed in UI/logs/artifacts, and audited.',
          ],
        },
        {
          id: 'audit',
          title: 'Audit and traceability',
          bullets: [
            'All significant actions generate AuditEvent.',
            'AuditEvent includes actor, action, object, and timestamp.',
            'Audit export is reliable and consistent under retries.',
          ],
        },
        {
          id: 'operations',
          title: 'Operational readiness',
          bullets: [
            'Installation is automated and supports air-gapped mode.',
            'Updates do not lose data and support rollback.',
            'Backup and DR procedures are documented and effective.',
          ],
        },
        {
          id: 'observability',
          title: 'Observability',
          bullets: [
            'Metrics for Control Plane and Data Plane are available.',
            'Logs are structured and centralized.',
            'Tracing covers key execution paths.',
          ],
        },
        {
          id: 'dx',
          title: 'Developer environment',
          bullets: [
            'Dev environments are available and policy constraints are transparent.',
            'No hidden state; any result must be explainable through explicit entities.',
          ],
        },
        {
          id: 'production-grade',
          title: 'Production-grade definition',
          body: [
            'Animus Datalab is production-grade when the full ML lifecycle is executable within one Project, production-run reproducibility is explicit or its limitations are recorded, audit is end-to-end and exportable, security and access policies enforce permissions, deployments are installable and upgradable with rollback, and no hidden state affects results.',
          ],
        },
      ],
    },
    {
      slug: 'adrs',
      title: 'Architectural Decision Records',
      description: 'Accepted architectural decisions and rationale.',
      keywords: ['adr', 'decisions'],
      sections: [
        {
          id: 'decisions',
          title: 'Accepted ADRs',
          bullets: [
            'ADR-001: Separation of Control Plane and Data Plane; Control Plane never executes user code.',
            'ADR-002: Run as the unit of reproducibility.',
            'ADR-003: Immutable DatasetVersion; Runs reference DatasetVersion.',
            'ADR-004: Production-run requires CodeRef commit SHA and EnvironmentLock.',
            'ADR-005: IDE is a tool, not a platform; managed IDE sessions only.',
            'ADR-006: AuditEvent is append-only, non-disableable, and exportable.',
          ],
        },
      ],
    },
    {
      slug: 'glossary',
      title: 'Glossary',
      description: 'Canonical terminology defined in the system documentation.',
      keywords: ['glossary', 'terms'],
      sections: [
        {
          id: 'core-terms',
          title: 'Core terms',
          bullets: [
            'Run: unit of execution and reproducibility in Animus.',
            'Control Plane: management plane of the platform.',
            'Data Plane: execution plane for user code.',
            'Immutable: an object that cannot be modified after creation.',
            'Production-run: a Run whose result may be used outside the laboratory.',
          ],
        },
        {
          id: 'domain-terms',
          title: 'Domain entities',
          bullets: [
            'Project: organizational and isolation unit for access and execution.',
            'Dataset: logical data entity anchoring versions.',
            'DatasetVersion: immutable data version used by Run.',
            'CodeRef: reference to code in an external SCM with commit SHA.',
            'EnvironmentDefinition: logical description of an execution environment.',
            'EnvironmentLock: immutable, verifiable execution environment reference.',
            'PipelineRun: composed Run representing a DAG of Runs.',
            'Artifact: result of Run execution (logs, metrics, files, models, reports).',
            'Model: logical entity representing model versions.',
            'ModelVersion: concrete Run result recognized as a model.',
            'AuditEvent: immutable record of a significant system action.',
          ],
        },
      ],
    },
  ],
};

const docsContentRu: DocsContent = {
  nav: [
    { label: 'Обзор', slug: 'overview' },
    { label: 'Определение системы', slug: 'system-definition' },
    { label: 'Архитектура', slug: 'architecture' },
    { label: 'Доменная модель', slug: 'domain-model' },
    { label: 'Модель исполнения', slug: 'execution-model' },
    { label: 'Интерфейсы', slug: 'interfaces' },
    { label: 'Безопасность', slug: 'security' },
    { label: 'Эксплуатация', slug: 'operations' },
    { label: 'Управление (Governance)', slug: 'governance' },
    { label: 'Критерии готовности', slug: 'acceptance-criteria' },
    { label: 'ADR', slug: 'adrs' },
    { label: 'Глоссарий', slug: 'glossary' },
  ],
  cards: [
    {
      title: 'Обзор',
      description: 'Назначение, цели и границы системы.',
      slug: 'overview',
    },
    {
      title: 'Определение системы',
      description: 'Формальное определение, инварианты и нецели.',
      slug: 'system-definition',
    },
    {
      title: 'Архитектура',
      description: 'Control Plane, Data Plane и границы доверия.',
      slug: 'architecture',
    },
    {
      title: 'Доменная модель',
      description: 'Сущности, атрибуты и инварианты.',
      slug: 'domain-model',
    },
    {
      title: 'Модель исполнения',
      description: 'Декларативное исполнение, Run lifecycle, DAG.',
      slug: 'execution-model',
    },
    {
      title: 'Интерфейсы',
      description: 'API, Pipeline specification, события, CLI/SDK, UI.',
      slug: 'interfaces',
    },
    {
      title: 'Безопасность',
      description: 'Аутентификация, RBAC, изоляция, секреты, аудит.',
      slug: 'security',
    },
    {
      title: 'Эксплуатация',
      description: 'Развёртывание, наблюдаемость, backup/DR, обновления, runbooks.',
      slug: 'operations',
    },
    {
      title: 'Управление (Governance)',
      description: 'RBAC, политики, аудит и ретеншн.',
      slug: 'governance',
    },
    {
      title: 'Критерии готовности',
      description: 'Условия production-grade и сценарии приёмки.',
      slug: 'acceptance-criteria',
    },
    {
      title: 'ADR',
      description: 'Архитектурные решения и обоснования.',
      slug: 'adrs',
    },
    {
      title: 'Глоссарий',
      description: 'Канонические термины и определения.',
      slug: 'glossary',
    },
  ],
  pages: [
    {
      slug: 'overview',
      title: 'Обзор',
      description: 'Назначение, цели и границы системы.',
      keywords: ['определение', 'цели', 'границы'],
      sections: [
        {
          id: 'definition',
          title: 'Определение системы',
          body: [
            'Animus Datalab — корпоративная цифровая лаборатория машинного обучения, предназначенная для организации полного жизненного цикла ML-разработки в управляемом и воспроизводимом виде.',
            'Лаборатория объединяет работу с данными, эксперименты, обучение и оценку моделей, подготовку к промышленному использованию в едином операционном контуре с общими правилами исполнения, безопасности и аудита.',
          ],
        },
        {
          id: 'objectives',
          title: 'Цели платформы',
          bullets: [
            'Обеспечить воспроизводимость ML-экспериментов и результатов.',
            'Свести контекст разработки модели (данные, код, окружение, параметры, решения) в явный и связанный вид.',
            'Предоставить рабочую среду без нарушения корпоративных требований.',
            'Обеспечить управляемость, аудит и безопасность по умолчанию.',
          ],
        },
        {
          id: 'boundaries',
          title: 'Границы системы',
          bullets: [
            'Animus не является системой контроля версий кода.',
            'Animus не является IDE или редактором кода как продуктом.',
            'Animus не является полноценной inference-платформой.',
            'Animus может интегрироваться с внешними SCM, IDE и системами деплоя/serving через управляемые окружения и контрактные интерфейсы.',
          ],
          note: {
            title: 'Связанные разделы',
            body: 'См. «Определение системы» (инварианты и явный контекст), «Доменная модель» (сущности) и «Архитектура» (разделение плоскостей).',
          },
        },
      ],
    },
    {
      slug: 'system-definition',
      title: 'Определение системы',
      description: 'Формальное определение, инварианты и явный контекст.',
      keywords: ['инварианты', 'контекст', 'определение'],
      sections: [
        {
          id: 'formal-definition',
          title: 'Формальное определение',
          body: [
            'Animus Datalab — корпоративная цифровая лаборатория машинного обучения, предназначенная для организации полного жизненного цикла ML-разработки в управляемом и воспроизводимом виде.',
            'Единый операционный контур обеспечивается общими правилами исполнения, безопасности и аудита.',
          ],
        },
        {
          id: 'invariants',
          title: 'Архитектурные инварианты',
          bullets: [
            'Control Plane не исполняет пользовательский код.',
            'Любой production-run однозначно определяется DatasetVersion, CodeRef (commit SHA) и EnvironmentLock.',
            'Все значимые действия фиксируются в AuditEvent.',
            'Данные, код, окружения и результаты представлены как явные, версионируемые сущности.',
            'В системе отсутствует скрытое состояние, влияющее на результат исполнения.',
          ],
        },
        {
          id: 'explicit-context',
          title: 'Требование явного контекста',
          body: [
            'Всё, что влияет на результат исполнения, должно быть представлено в системе как явная сущность или ссылка на сущность.',
            'Действия без явного контекста рассматриваются как ошибка проектирования и должны быть исключены или формализованы.',
          ],
        },
        {
          id: 'non-goals',
          title: 'Нецели',
          bullets: [
            'Animus не заменяет SCM, IDE или inference-платформы.',
            'Интеграции с внешними системами выполняются через контрактные интерфейсы.',
          ],
        },
      ],
    },
    {
      slug: 'architecture',
      title: 'Архитектура',
      description: 'Control Plane, Data Plane, границы доверия и модель отказов.',
      keywords: ['control plane', 'data plane', 'trust boundaries'],
      sections: [
        {
          id: 'overview',
          title: 'Архитектурный обзор',
          body: [
            'Animus построен как распределённая система с чётким разделением ответственности между Control Plane и Data Plane.',
            'Разделение является фундаментальным инвариантом и исключает выполнение недоверенного кода в управляющем контуре.',
          ],
        },
        {
          id: 'control-plane',
          title: 'Control Plane',
          bullets: [
            'Предоставляет UI, CLI/SDK и API; API является первичным интерфейсом.',
            'Хранит метаданные доменных сущностей и является источником истины.',
            'Оркестрирует исполнение: валидирует входы, формирует Execution Plan и планирует Run.',
            'Применяет политики доступа, production-run, окружений, сетевых ограничений и ретеншна.',
            'Формирует AuditEvent для административных действий и смен статусов.',
            'Не исполняет пользовательский код и не требует доступа к данным исполнения.',
          ],
        },
        {
          id: 'data-plane',
          title: 'Data Plane',
          bullets: [
            'Исполняет пользовательский код в контейнеризованных изолированных окружениях с явными лимитами ресурсов.',
            'Обеспечивает контролируемый доступ к DatasetVersion и Artifact.',
            'Собирает логи, метрики и трассы Run и PipelineRun.',
            'Секреты предоставляются временно и минимально, доступ фиксируется.',
            'Kubernetes является обязательной базовой средой исполнения.',
          ],
        },
        {
          id: 'trust-boundaries',
          title: 'Границы доверия',
          bullets: [
            'Пользовательские клиенты (UI/CLI/SDK) — недоверенная среда, требующая строгой аутентификации и авторизации.',
            'Control Plane — доверенный контур управления без исполнения пользовательского кода.',
            'Data Plane — частично доверенный контур, исполняющий недоверенный код и изолирующий его.',
            'Внешние системы (SCM, registry, vault, storage, SIEM) имеют собственные контуры доверия.',
          ],
        },
        {
          id: 'failure-model',
          title: 'Модель отказов',
          bullets: [
            'Операции Control Plane идемпотентны там, где это возможно.',
            'Run переходят в диагностируемые статусы (unknown/reconciling) при потере связности.',
            'Система восстанавливает наблюдаемое состояние после временной недоступности компонентов.',
            'Сценарии отказов наблюдаемы через метрики, логи и трассы.',
            'Отказ Data Plane не должен разрушать консистентность метаданных и аудита.',
          ],
        },
        {
          id: 'diagram',
          title: 'Разделение Control Plane и Data Plane',
          body: ['Диаграмма иллюстрирует разделение управляющего и исполняющего контуров.'],
          media: {
            type: 'image',
            src: '/assets/diagram-control-plane.svg',
            alt: 'Диаграмма разделения Control Plane и Data Plane',
          },
          note: {
            title: 'Связанные разделы',
            body: 'См. «Модель исполнения» для жизненного цикла Run и семантики пайплайнов; см. «Безопасность» для требований к границам доверия и изоляции.',
          },
        },
      ],
    },
    {
      slug: 'domain-model',
      title: 'Доменная модель',
      description: 'Сущности, атрибуты и инварианты.',
      keywords: ['project', 'dataset', 'run', 'model', 'audit'],
      sections: [
        {
          id: 'project',
          title: 'Project',
          body: [
            'Project — базовая организационная и изоляционная единица Animus, представляющая один ML-продукт или независимую задачу.',
          ],
          bullets: [
            'Задаёт границы доступа, исполнения и ответственности команд.',
            'Все доменные сущности принадлежат ровно одному Project; межпроектные зависимости запрещены.',
            'Жизненный цикл: active и archived (read-only, новые Run запрещены).',
          ],
        },
        {
          id: 'datasets',
          title: 'Dataset и DatasetVersion',
          body: [
            'Dataset — логическая сущность данных; DatasetVersion — конкретная неизменяемая версия, используемая в Run и являющаяся primary data reference.',
          ],
          bullets: [
            'DatasetVersion является immutable; изменения данных оформляются созданием новой версии.',
            'Любое использование данных в Run ссылается на конкретную DatasetVersion.',
            'Удаление DatasetVersion запрещено при использовании в Run, Model или AuditEvent, если не разрешено retention policy.',
          ],
        },
        {
          id: 'coderef',
          title: 'CodeRef',
          body: [
            'CodeRef — ссылка на версию пользовательского кода во внешней SCM, фиксирующая точку идентификации.',
          ],
          bullets: [
            'Production-run требует CodeRef с commit SHA; ветки и теги запрещены.',
            'CodeRef является immutable.',
          ],
        },
        {
          id: 'environment',
          title: 'EnvironmentDefinition и EnvironmentLock',
          body: [
            'EnvironmentDefinition описывает логическое окружение исполнения; EnvironmentLock — неизменяемое фиксированное представление окружения.',
          ],
          bullets: [
            'Production-run использует EnvironmentLock.',
            'EnvironmentLock является immutable и проверяемым по digest/checksum.',
          ],
        },
        {
          id: 'run',
          title: 'Run и PipelineRun',
          body: [
            'Run — единица исполнения и воспроизводимости, связывающая данные, код, окружение, параметры и результат.',
            'PipelineRun — составной Run, представляющий DAG шагов (node-runs).',
          ],
          bullets: [
            'Статусы Run: queued, running, succeeded, failed, canceled, unknown.',
            'Run не может менять входные DatasetVersion и не может существовать без Project.',
          ],
        },
        {
          id: 'artifact',
          title: 'Artifact',
          body: ['Artifact — любой результат исполнения Run: логи, метрики, файлы, модели, отчёты.'],
          bullets: [
            'Artifact всегда привязан к Run и не существует вне Project.',
            'Доступ к Artifact контролируется правами Project.',
          ],
        },
        {
          id: 'model',
          title: 'Model и ModelVersion',
          body: [
            'Model — логическая сущность семейства версий; ModelVersion — конкретный результат Run, признанный моделью.',
          ],
          bullets: [
            'Статусы ModelVersion: draft, validated, approved, deprecated.',
            'ModelVersion должна ссылаться на Run; promotion фиксируется в AuditEvent.',
            'Экспорт approved модели может быть ограничен политиками.',
          ],
        },
        {
          id: 'audit',
          title: 'AuditEvent',
          body: ['AuditEvent — неизменяемая запись о значимом действии в системе.'],
          bullets: [
            'AuditEvent append-only и не может быть изменён или удалён.',
            'AuditEvent экспортируем.',
            'AuditEvent содержит actor, action, object_ref, timestamp и result.',
          ],
        },
        {
          id: 'graph',
          title: 'Связность доменной модели',
          body: [
            'Система восстанавливается как граф, корнем которого является Project, а AuditEvent образует временное измерение этого графа.',
          ],
        },
      ],
    },
    {
      slug: 'execution-model',
      title: 'Модель исполнения',
      description: 'Декларативное исполнение, жизненный цикл Run, DAG семантика.',
      keywords: ['run', 'pipeline', 'execution plan'],
      sections: [
        {
          id: 'principles',
          title: 'Принципы исполнения',
          bullets: [
            'Изоляция по умолчанию: каждый Run исполняется в изолированной среде.',
            'Декларативность: пользователь описывает что выполнять, платформа определяет как.',
            'Контролируемость: политики, лимиты ресурсов и безопасность применяются до исполнения.',
            'Наблюдаемость: ход исполнения и результаты фиксируются.',
            'Воспроизводимость: фиксированные входы, явные зависимости, отсутствие скрытого состояния.',
          ],
        },
        {
          id: 'lifecycle',
          title: 'Жизненный цикл Run',
          bullets: [
            'Создание: проверка прав, валидация ссылок, применение политик, AuditEvent, статус queued.',
            'Планирование: формирование Execution Plan с image digest, ресурсами, сетевыми политиками, ссылками на секреты, точками доступа к данным и версией планировщика.',
            'Исполнение: Data Plane исполняет пользовательский код в контейнерах; Control Plane не исполняет код.',
            'Завершение: фиксация финального статуса, привязка артефактов и AuditEvent.',
          ],
        },
        {
          id: 'pipeline',
          title: 'Pipeline execution',
          bullets: [
            'Pipeline — направленный ациклический граф (DAG).',
            'Каждый узел исполняется как Run; Control Plane валидирует DAG и применяет политики.',
            'Политики обработки ошибок задаются явно и определяют успешность или деградацию.',
          ],
        },
        {
          id: 'retries',
          title: 'Повторы, rerun и replay',
          bullets: [
            'retry — автоматический повтор при временной ошибке.',
            'rerun — повтор с теми же входами.',
            'replay — повтор по сохранённому Execution Plan.',
            'Каждый повтор фиксируется как новый Run, связанный с исходным.',
          ],
        },
        {
          id: 'idempotency',
          title: 'Идемпотентность',
          bullets: [
            'Операции Control Plane идемпотентны там, где это возможно.',
            'Повторные запросы с одинаковыми параметрами не создают дубликатов.',
          ],
        },
        {
          id: 'isolation',
          title: 'Изоляция и ресурсы',
          bullets: [
            'Run исполняется в отдельном контейнере и в контексте Project.',
            'Лимиты CPU/RAM/GPU и временного хранилища задаются явно.',
            'Прямой доступ Run к метаданным Control Plane запрещён.',
          ],
        },
        {
          id: 'errors',
          title: 'Ошибки и деградация',
          bullets: [
            'Классы ошибок: user, data, environment, platform, policy violations.',
            'При деградации Run переводятся в диагностируемые статусы, метаданные сохраняются.',
          ],
        },
        {
          id: 'observability',
          title: 'Наблюдаемость',
          bullets: [
            'Логи, метрики и трассы собираются и привязываются к Run и PipelineRun.',
            'Секреты и чувствительные данные не должны попадать в логи, метрики и артефакты.',
          ],
        },
        {
          id: 'audit',
          title: 'Связь с аудитом',
          body: ['Каждый значимый этап исполнения порождает AuditEvent.'],
          note: {
            title: 'Связанные разделы',
            body: 'См. «Архитектура» для разделения плоскостей и границ доверия; см. «Безопасность» для ограничений по секретам и сети.',
          },
        },
      ],
    },
    {
      slug: 'interfaces',
      title: 'Интерфейсы',
      description: 'API, Pipeline specification, события, CLI/SDK и роль UI.',
      keywords: ['api', 'pipeline spec', 'events', 'cli', 'sdk'],
      sections: [
        {
          id: 'principles',
          title: 'Принципы интерфейсов',
          bullets: [
            'API является источником истины; UI не должен вводить обходные механизмы.',
            'Интерфейсы версионируются; breaking changes требуют смены версии.',
            'Критические операции должны быть идемпотентными и повторяемыми.',
          ],
        },
        {
          id: 'resource-model',
          title: 'Ресурсная модель API',
          body: [
            'Каждая доменная сущность представлена как адресуемый ресурс с явным жизненным циклом.',
            'Операции Create/Read/Update/Delete сопровождаются формальными ошибками и диагностикой.',
          ],
        },
        {
          id: 'pipeline-spec',
          title: 'Pipeline specification',
          bullets: [
            'Описывает декларативную структуру исполнения и не содержит исполняемого кода.',
            'Включает версию спецификации, шаги, зависимости, входы/выходы, политики ошибок и требования к ресурсам.',
            'Control Plane валидирует DAG и политики перед созданием PipelineRun.',
          ],
        },
        {
          id: 'events',
          title: 'События и интеграции',
          bullets: [
            'События отражают изменения состояния и не являются источником истины.',
            'Канонические события и механизмы доставки определены для интеграций.',
          ],
        },
        {
          id: 'cli-sdk',
          title: 'CLI и SDK',
          bullets: [
            'CLI и SDK строятся поверх публичного API.',
            'Требования CLI/SDK согласованы с политикой версионирования.',
          ],
        },
        {
          id: 'ui',
          title: 'Роль UI',
          bullets: [
            'UI является контролируемым интерфейсом для аудита и управления.',
            'UI не может обходить политики и ограничения API.',
          ],
        },
        {
          id: 'security-linkage',
          title: 'Интерфейсы и безопасность',
          body: ['Все интерфейсы подчиняются аутентификации, авторизации и аудиту.'],
        },
      ],
    },
    {
      slug: 'security',
      title: 'Безопасность',
      description: 'Модель безопасности, аутентификация, RBAC, изоляция, секреты и аудит.',
      keywords: ['rbac', 'audit', 'secrets', 'egress'],
      sections: [
        {
          id: 'objectives',
          title: 'Цели модели безопасности',
          bullets: [
            'Защита данных, моделей и результатов от несанкционированного доступа.',
            'Исключение неявного расширения привилегий и скрытых каналов влияния.',
            'Проверяемость действий пользователей и системы.',
            'Сохранение удобства работы без обходов.',
          ],
        },
        {
          id: 'threat-model',
          title: 'Модель угроз и допущения',
          bullets: [
            'Активы: данные, модели, артефакты, метаданные, учётные данные и аудит.',
            'Источники угроз: ошибки пользователей, злоупотребления, компрометация аккаунтов, уязвимости пользовательского кода, компрометация инфраструктуры.',
            'Control Plane считается доверенным контуром и не исполняет код; Data Plane исполняет недоверенный код и изолирует его; сеть считается недоверенной.',
          ],
        },
        {
          id: 'authentication',
          title: 'Аутентификация',
          bullets: [
            'SSO через OIDC и/или SAML; локальные учётные записи для air-gapped окружений.',
            'Service accounts для автоматизации и CI/CD.',
            'Управление сессиями: TTL, принудительный выход, ограничение параллельных сессий и аудит входов/выходов.',
            'MFA реализуется через внешний IdP.',
          ],
        },
        {
          id: 'authorization',
          title: 'Авторизация',
          bullets: [
            'RBAC на уровне Project с уточнением прав на уровне объектов.',
            'Отсутствие явного разрешения трактуется как запрет.',
            'Каждая операция проходит проверку прав и фиксируется в аудите.',
          ],
        },
        {
          id: 'secrets',
          title: 'Управление секретами',
          bullets: [
            'Секреты не хранятся в открытом виде и не попадают в UI, логи, метрики и артефакты.',
            'Интеграция с внешними secret store обязательна; секреты предоставляются временно и минимально.',
            'Попытки доступа к секретам аудитируются.',
          ],
        },
        {
          id: 'isolation',
          title: 'Изоляция и сетевые ограничения',
          bullets: [
            'Исполнение в контейнеризованных окружениях с ограниченными правами.',
            'Сетевой egress запрещён по умолчанию и разрешается политиками.',
            'Run не должен иметь прямого доступа к Control Plane.',
          ],
        },
        {
          id: 'data-artifacts',
          title: 'Безопасность данных и артефактов',
          bullets: [
            'Доступ к DatasetVersion проверяется при каждом обращении и определяется Project и политиками.',
            'Артефакты хранятся в рамках Project и контролируются ролями.',
            'Экспорт моделей может быть ограничен или запрещён политиками.',
          ],
        },
        {
          id: 'audit',
          title: 'Аудит и экспорт',
          bullets: [
            'AuditEvent фиксирует аутентификацию, изменение прав, доступ к данным, Run и promotion моделей.',
            'AuditEvent append-only и не может быть отключён.',
            'Аудит экспортируем в SIEM и системы мониторинга с надёжной доставкой.',
          ],
        },
        {
          id: 'updates',
          title: 'Обновления и уязвимости',
          bullets: [
            'Обновления контролируемы и сохраняют целостность данных.',
            'Поддерживаются rollback и совместимость схем/контрактов.',
            'Поддерживается проверка образов и SBOM.',
          ],
          note: {
            title: 'Связанные разделы',
            body: 'См. «Управление (Governance)» для ролей RBAC и политики аудита; см. «Эксплуатация» для runbook и процедур восстановления.',
          },
        },
      ],
    },
    {
      slug: 'operations',
      title: 'Эксплуатация',
      description: 'Развёртывание, надёжность, наблюдаемость, backup/DR, обновления, runbooks.',
      keywords: ['deployment', 'observability', 'backup', 'upgrade', 'runbooks'],
      sections: [
        {
          id: 'principles',
          title: 'Принципы эксплуатации',
          bullets: [
            'Предсказуемость поведения при нагрузках, отказах и обновлениях.',
            'Наблюдаемость по умолчанию без ручной диагностики.',
            'Минимизация ручных операций для установки, обновления и восстановления.',
            'Разделение ответственности между Control Plane и Data Plane.',
          ],
        },
        {
          id: 'deployment',
          title: 'Модели развёртывания',
          bullets: [
            'Single-cluster: весь контур в одном Kubernetes-кластере.',
            'Multi-cluster: один Control Plane и несколько Data Plane.',
            'On-prem, private cloud и air-gapped окружения поддерживаются.',
          ],
        },
        {
          id: 'artifacts',
          title: 'Установочные артефакты и зависимости',
          bullets: [
            'Поставка через Helm charts и/или Kustomize с версионированными контейнерными образами.',
            'Установка не требует ручного редактирования контейнеров или исходного кода.',
            'Внешние зависимости: БД метаданных, объектное хранилище, IdP, secret store; они документированы и заменяемы.',
          ],
        },
        {
          id: 'scaling',
          title: 'Масштабирование и надёжность',
          bullets: [
            'Control Plane поддерживает горизонтальное масштабирование и внешнее хранилище состояния.',
            'Data Plane масштабируется по числу Run, ресурсам и количеству кластеров.',
            'Квоты и лимиты задаются на уровне Project и глобально.',
          ],
        },
        {
          id: 'observability',
          title: 'Наблюдаемость',
          bullets: [
            'Метрики для Control Plane и Data Plane, Run/PipelineRun и очередей планировщика.',
            'Логи структурированы и централизованно собираются, без секретов.',
            'Трассировка охватывает API, оркестрацию и взаимодействие плоскостей.',
          ],
        },
        {
          id: 'backup-dr',
          title: 'Backup и DR',
          bullets: [
            'Резервное копирование метаданных, аудита и конфигураций платформы обязательно.',
            'Для каждой инсталляции определяются RPO и RTO.',
            'Процедуры восстановления документированы, проверяемы и автоматизируемы.',
          ],
        },
        {
          id: 'updates',
          title: 'Обновления и миграции',
          bullets: [
            'Обновления выполняются поэтапно и поддерживают rollback.',
            'Миграции схем контролируемы и обратимы, где возможно.',
            'Breaking changes требуют смены версии и migration guide.',
          ],
        },
        {
          id: 'air-gapped',
          title: 'Air-gapped режим',
          bullets: [
            'Работа без доступа к публичным репозиториям и внешним зависимостям.',
            'Офлайн-пакеты образов, локальные registry и проверка целостности обязательны.',
          ],
        },
        {
          id: 'roles',
          title: 'Эксплуатационные роли',
          bullets: [
            'Platform Owner — владелец инсталляции.',
            'SRE / Platform Engineer — надёжность и эксплуатация.',
            'Security Officer — контроль безопасности и соответствия.',
            'Project Maintainer — управление проектом.',
          ],
        },
        {
          id: 'runbooks',
          title: 'Runbooks',
          bullets: [
            'RB-01: Control Plane недоступен.',
            'RB-02: Run не запускается / застрял в queued.',
            'RB-03: Data Plane недоступен или деградирован.',
            'RB-04: Audit export не работает.',
            'RB-05: Подозрение на компрометацию учётной записи.',
            'RB-06: Утечка данных / моделей.',
            'RB-07: Потеря метаданных Control Plane.',
          ],
          note: {
            title: 'Связанные разделы',
            body: 'См. «Критерии готовности» для проверок эксплуатационной готовности и сценариев приёмки.',
          },
        },
      ],
    },
    {
      slug: 'governance',
      title: 'Управление (Governance)',
      description: 'RBAC, применение политик, аудит и ретеншн.',
      keywords: ['rbac', 'audit', 'policy', 'retention'],
      sections: [
        {
          id: 'rbac-principles',
          title: 'RBAC принципы',
          bullets: [
            'Project-centric модель ролей с default deny.',
            'Object-level enforcement для Dataset, Run, Model и Audit.',
            'Все изменения состояния и доступы аудитируются.',
          ],
        },
        {
          id: 'roles',
          title: 'Роли',
          bullets: [
            'Project-scoped роли: Viewer, Developer, Maintainer, Admin.',
            'Системные роли: Platform Operator, Security Officer, Service Account.',
          ],
        },
        {
          id: 'service-accounts',
          title: 'Service Accounts',
          bullets: [
            'Действуют в рамках Project или System с минимальными правами.',
            'Не используют интерактивные сессии и имеют ограниченный TTL токенов.',
            'Все действия Service Accounts аудитируются.',
          ],
        },
        {
          id: 'policy-enforcement',
          title: 'Применение политик',
          bullets: [
            'Control Plane применяет политики доступа, production-run, окружений, сетевых ограничений и ретеншна до исполнения.',
            'Результаты применения политик фиксируются в AuditEvent.',
          ],
        },
        {
          id: 'audit',
          title: 'Аудит',
          bullets: [
            'AuditEvent append-only, не отключаем и экспортируем.',
            'AuditEvent содержит actor, action, object_ref, timestamp и result.',
            'Аудит охватывает аутентификацию, изменения прав, доступы, Run и promotion моделей.',
          ],
        },
        {
          id: 'retention',
          title: 'Retention и legal hold',
          bullets: [
            'DatasetVersion не может быть удалена при использовании в Run/Model/AuditEvent без разрешения retention policy.',
            'Политики ретеншна определяют lifecycle переходы (deprecated, expired, deleted).',
          ],
          note: {
            title: 'Связанные разделы',
            body: 'См. «Безопасность» для допущений модели угроз и ограничений аудита.',
          },
        },
      ],
    },
    {
      slug: 'acceptance-criteria',
      title: 'Критерии готовности',
      description: 'Условия production-grade и сценарии приёмки.',
      keywords: ['acceptance', 'production-grade'],
      sections: [
        {
          id: 'purpose',
          title: 'Назначение',
          body: [
            'Критерии готовности определяют формальные условия, при которых Animus Datalab считается production-grade и пригодной для регулируемых сред.',
          ],
        },
        {
          id: 'general',
          title: 'Общие требования',
          bullets: [
            'Платформа не считается готовой, если не выполнен хотя бы один обязательный критерий.',
            'Приёмка выполняется на рабочей инсталляции с включёнными аудитом и политиками безопасности.',
          ],
        },
        {
          id: 'e2e',
          title: 'Сквозные сценарии',
          bullets: [
            'Полный ML-цикл в одном Project с DatasetVersion, CodeRef commit SHA и EnvironmentLock.',
            'Воспроизводимость production-run с явным уровнем детерминизма.',
            'Изоляция проектов с запрещённым доступом и аудированием попыток.',
          ],
        },
        {
          id: 'security',
          title: 'Безопасность и доступ',
          bullets: [
            'SSO или локальные учётные записи в air-gapped, TTL сессий и принудительный выход.',
            'RBAC и object-level enforcement работают корректно.',
            'Секреты временные, не раскрываются в UI/логах/артефактах, обращения фиксируются.',
          ],
        },
        {
          id: 'audit',
          title: 'Аудит и трассируемость',
          bullets: [
            'Все значимые действия порождают AuditEvent.',
            'AuditEvent содержит actor, action, object, timestamp.',
            'Экспорт аудита надёжен и повторяем.',
          ],
        },
        {
          id: 'operations',
          title: 'Эксплуатационная готовность',
          bullets: [
            'Установка автоматизируема и поддерживает air-gapped.',
            'Обновления без потери данных, с rollback и контролируемыми миграциями.',
            'Backup и DR процедурно и фактически выполняемы.',
          ],
        },
        {
          id: 'observability',
          title: 'Наблюдаемость',
          bullets: [
            'Метрики Control Plane и Data Plane доступны.',
            'Логи структурированы и централизованы.',
            'Трассировка охватывает ключевые пути исполнения.',
          ],
        },
        {
          id: 'dx',
          title: 'Developer environment',
          bullets: [
            'Dev-окружения доступны, ограничения и политики прозрачны.',
            'Отсутствует скрытое состояние; любой результат объясним через сущности.',
          ],
        },
        {
          id: 'production-grade',
          title: 'Определение production-grade',
          body: [
            'Animus Datalab считается production-grade, если полный ML-цикл выполняется в рамках одного Project, воспроизводимость production-run формализована или ограничения зафиксированы, аудит сквозной и экспортируемый, безопасность и доступы работают end-to-end, развертывание/обновления/rollback предсказуемы, и скрытое состояние отсутствует.',
          ],
        },
      ],
    },
    {
      slug: 'adrs',
      title: 'ADR',
      description: 'Архитектурные решения и обоснования.',
      keywords: ['adr', 'decisions'],
      sections: [
        {
          id: 'decisions',
          title: 'Принятые ADR',
          bullets: [
            'ADR-001: Разделение Control Plane и Data Plane; Control Plane не исполняет пользовательский код.',
            'ADR-002: Run как единица воспроизводимости.',
            'ADR-003: Immutable DatasetVersion; Run ссылается на DatasetVersion.',
            'ADR-004: Production-run только по commit SHA и EnvironmentLock.',
            'ADR-005: IDE как инструмент, не как платформа.',
            'ADR-006: AuditEvent append-only, не отключаем и экспортируем.',
          ],
        },
      ],
    },
    {
      slug: 'glossary',
      title: 'Глоссарий',
      description: 'Канонические термины и определения.',
      keywords: ['глоссарий', 'термины'],
      sections: [
        {
          id: 'core-terms',
          title: 'Ключевые термины',
          bullets: [
            'Run — единица исполнения и воспроизводимости в Animus.',
            'Control Plane — управляющая плоскость платформы.',
            'Data Plane — плоскость исполнения пользовательского кода.',
            'Immutable — объект, не допускающий изменения после создания.',
            'Production-run — запуск, результат которого может быть использован вне лаборатории.',
          ],
        },
        {
          id: 'domain-terms',
          title: 'Доменные сущности',
          bullets: [
            'Project — организационная и изоляционная единица доступа и исполнения.',
            'Dataset — логическая сущность данных, объединяющая версии.',
            'DatasetVersion — неизменяемая версия данных, используемая в Run.',
            'CodeRef — ссылка на код во внешней SCM с commit SHA.',
            'EnvironmentDefinition — логическое описание окружения исполнения.',
            'EnvironmentLock — неизменяемое и проверяемое окружение исполнения.',
            'PipelineRun — составной Run как DAG шагов.',
            'Artifact — результат исполнения Run (логи, метрики, файлы, модели, отчёты).',
            'Model — логическая сущность семейства версий моделей.',
            'ModelVersion — конкретный результат Run, признанный моделью.',
            'AuditEvent — неизменяемая запись о значимом действии.',
          ],
        },
      ],
    },
  ],
};

const docsContent: Partial<Record<Locale, DocsContent>> & { en: DocsContent } = {
  en: docsContentEn,
  ru: docsContentRu,
  es: docsContentEn,
  'zh-CN': docsContentEn,
  ja: docsContentEn,
};

export function getDocsNav(locale: Locale = 'en'): DocsNavItem[] {
  return docsContent[locale]?.nav ?? docsContent.en.nav;
}

export function getDocsCards(locale: Locale = 'en'): DocsCard[] {
  return docsContent[locale]?.cards ?? docsContent.en.cards;
}

export function getDocsPages(locale: Locale = 'en'): DocsPage[] {
  return docsContent[locale]?.pages ?? docsContent.en.pages;
}

export function getDocBySlug(locale: Locale, slug: string): DocsPage | undefined {
  return getDocsPages(locale).find((page) => page.slug === slug);
}

export const docsSlugs = docsContent.en.pages.map((page) => page.slug);
