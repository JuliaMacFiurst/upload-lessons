# Map Source Validator Workflow

```text
┌───────────────────────────┐
│ 1. Read Story & Sources   │ (content, story_sources JSONB)
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 2. Domain & Authority     │ (Validate host, Tier A/B/C classification)
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 3. Atomic Claim Audit     │ (Cross-check story claims against evidence_summary)
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 4. Generate Report        │ (overall_status: verified | warning | failed)
└───────────────────────────┘
```
