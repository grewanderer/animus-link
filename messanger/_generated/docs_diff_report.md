# Docs tab diff report

## Information architecture changes
- Replaced non-canonical sections (“Getting Started”, “Concepts”) with enterprise IA derived from docs/enterprise: System Definition, Domain Model, Interfaces, Governance, Acceptance Criteria, ADRs, Glossary.
- Standardized nav order to reflect the canonical lifecycle: Overview → System Definition → Architecture → Domain Model → Execution Model → Interfaces → Security → Operations → Governance → Acceptance Criteria → ADRs → Glossary.

## Content normalization
- Rewrote all Docs tab copy into scientific, formal technical language aligned with the enterprise documentation.
- Removed marketing tone and unverified claims; retained only statements grounded in docs/enterprise.
- Added explicit cross-reference notes between related sections without introducing new system claims.

## Index page updates
- Docs index metadata updated to reflect architecture, execution model, security, operations, and acceptance criteria.
- “Start here” list updated to canonical reading order aligned with the new IA.
- At-a-glance bullets updated to explicit Control Plane / Data Plane separation, Run reproducibility inputs, and deployment models.

## Locale handling
- English is the canonical source.
- Russian mirrors English structure with localized text.
- Spanish and Basque currently reuse English content and navigation structure.

## Traceability
- Every Docs tab paragraph/bullet now maps to docs/enterprise sources (see `docs/_generated/docs_traceability.md`).
