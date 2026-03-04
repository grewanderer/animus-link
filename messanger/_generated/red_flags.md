# Risk & compliance red flags (wording review)

The items below could be misread as guarantees if taken out of the documentation context. Each entry includes a safer, documentation-grounded alternative phrasing.

- Statement: “Animus Datalab is production-grade when …”
  - Risk: Could be read as a blanket guarantee rather than a definition and acceptance condition.
  - Safer alternative: “Production-grade is defined as meeting the following acceptance criteria; implementations are accepted only after verification.”

- Statement: “Single-cluster and multi-cluster deployments are supported across on-prem, private cloud, and air-gapped environments.”
  - Risk: Interpreted as a delivery guarantee regardless of deployment context.
  - Safer alternative: “The specification defines supported deployment models: single-cluster, multi-cluster, on-prem, private cloud, and air-gapped.”

- Statement: “AuditEvent is append-only, non-disableable, and exportable.”
  - Risk: Could be interpreted as a legal guarantee without verification.
  - Safer alternative: “AuditEvent is defined as append-only and non-disableable; exportability is a required property verified during acceptance.”

- Statement: “Installation does not require manual container edits, source code modification, or external network access for air-gapped deployments.”
  - Risk: May be read as an operational promise for all deployments.
  - Safer alternative: “Installation artifacts are specified to avoid manual container edits and external network access in air-gapped mode; compliance is validated during acceptance.”

- Statement: “Backup & DR for metadata and audit with defined RPO/RTO.”
  - Risk: Could be interpreted as a guarantee of specific recovery outcomes.
  - Safer alternative: “RPO/RTO targets must be defined per installation, and recovery procedures must be documented and testable.”

Notes:
- The current landing and Docs tab copy already frames these properties as specification-driven requirements; no wording changes are mandatory beyond the alternatives above.
