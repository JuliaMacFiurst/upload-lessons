---
name: map-source-validator
description: Independent evidence validation engine for verifying persistent story_sources, HTTP availability, domain authority, and atomic claim grounding in 'Сказки Капибары'.
lifecycle_status: PILOT
mutation_capability: NO_WRITE
content_capability: DRY_RUN_ONLY
supported_commands:
  - "Проверь источники"
  - "Валидируй факты"
  - "Validate story sources"
---

# Map Source Validator (Workspace Skill)

> **ROLE**: Independent Reviewer (NOT Prose Generator)
> **CONTRACT**: Given a map story and its `story_sources` JSON payload, independently re-checks HTTP evidence availability, publisher authority, domain sanity, and atomic claim support.

## Reading Order
1. [`AI-DOCS/skills/map-source-validator/skill-contract.md`](../../../AI-DOCS/skills/map-source-validator/skill-contract.md)
2. [`AI-DOCS/skills/map-source-validator/specification.md`](../../../AI-DOCS/skills/map-source-validator/specification.md)
3. [`AI-DOCS/skills/map-source-validator/workflow.md`](../../../AI-DOCS/skills/map-source-validator/workflow.md)

## Core Capabilities
- Independent HTTP retrieval check.
- Tier A/B/C publisher authority classification.
- Atomic claim-level coverage audit (`VERIFIED` | `WARNING` | `FAILED`).
- Non-mutating diagnostic output.
