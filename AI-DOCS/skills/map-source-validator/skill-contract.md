# Map Source Validator Skill Contract

## Responsibility Separation
The Map Source Validator is strictly separated from Map Content Writer:
- **Map Content Writer**: Sours evidence, drafts stories, builds `story_sources`.
- **Map Source Validator**: Reads story & `story_sources`, re-checks HTTP evidence, verifies atomic claims, outputs validation report.

## Validation Status Model
- `verified`: 100% of atomic factual claims supported by valid `SOURCE_EVIDENCE_FOUND` with clean domain sanity.
- `warning`: Story remains reviewable, but a source is missing summary text or requires cautious review.
- `failed`: An important factual claim lacks evidence or contradicts retrieved source text.

## Database Write Policy
- Current mode: `DRY_RUN_ONLY` (read-only audit).
- Future authorized write: Updates `source_validation_status` and `source_validated_at` ONLY upon explicit admin approval. NEVER modifies `content` or prose.
