# LapLapLa AI Operating System: Central Agent Router & Navigation Index

> **DOCUMENT STATUS**: `POLICY` / `SYSTEM_ROUTER`  
> **MANDATORY CONTEXT FOR ALL AGENTS**: Every new Antigravity session MUST read this file FIRST. This is the single entrypoint and Operating System router for all AI interactions in the LapLapLa repository. [`POLICY`]

---

## 1. AI Operating System Identity & Execution Model

The LapLapLa AI Operating System provides a unified, decoupled infrastructure for all AI content factories and Workspace Skills across the codebase.

```text
                           [User Command Prompt]
                        ("Заполни сегодня 50 карт")
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │     AI OS ROUTER        │
                        │  (.agents/registry.json)│
                        └────────────┬────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 │ 1. Intent Recognition & Skill Lookup │
                 │ 2. Check Lifecycle Status & Mutation  │
                 │ 3. Dispatch to Workspace Skill Entry │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │     WORKSPACE SKILL     │
                        │  (.agents/skills/*)     │
                        └────────────┬────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 │ Shared AI Pipeline & Framework        │
                 │ (lib/server/ai/pipeline/)             │
                 │ ├─ Queue Engine (Jobs/Batches/Checkpoints)
                 │ ├─ Language Guard (STOP-LANG-01)      │
                 │ ├─ Stop Conditions Framework          │
                 │ ├─ Confidence Scoring Engine          │
                 │ └─ Pre-Write Safety Layer             │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │   CANDIDATE FOR REVIEW  │
                        │   + CONFIDENCE SCORE    │
                        └─────────────────────────┘
```

---

## 2. Universal Skill Registry & Capabilities

All Workspace Skills are registered in [`.agents/registry.json`](registry.json). The Router resolves skills strictly via `registry.json` without searching the filesystem. [`POLICY`]

### Registered Skills Summary Table

| Skill ID | Display Name | Lifecycle Status | Entry File | Mutation Capability | Content Capability | Supported Commands |
|---|---|:---:|---|:---:|:---:|---|
| `map-content-writer` | Map Content Writer | **`PILOT`** | [`.agents/skills/map-content-writer/SKILL.md`](skills/map-content-writer/SKILL.md) | `NO_WRITE` | `PILOT_APPROVED` | *"Заполни 50 карт"*, *"Продолжи реки"*, *"Fill maps"* |
| `multi-language-translator` | Multi-Language Translator | `SPECIFICATION` | `.agents/skills/multi-language-translator/SKILL.md` | `NO_WRITE` | `DRY_RUN_ONLY` | *"Переведи всё новое"*, *"Translate stories"* |
| `book-database-builder` | Book Database Builder | `RESEARCH` | `.agents/skills/book-database-builder/SKILL.md` | `NO_WRITE` | `DRY_RUN_ONLY` | *"Добавь 20 книг"*, *"Add books"* |
| `map-slide-curator` | Map Slide Image Curator | `SPECIFICATION` | `.agents/skills/map-slide-curator/SKILL.md` | `NO_WRITE` | `DRY_RUN_ONLY` | *"Подбери картинки"*, *"Curate slide images"* |
| `voice-generator` | Voice Generation Pipeline | `SPECIFICATION` | `.agents/skills/voice-generator/SKILL.md` | `NO_WRITE` | `DRY_RUN_ONLY` | *"Создай озвучку"*, *"Generate voice audio"* |

---

## 3. Universal Lifecycle States & Progression Rules

Every skill progresses through standardized lifecycle states. The Operational Source of Truth for each skill's status is its `validation-record.md`. [`POLICY`]

```text
RESEARCH ➔ SPECIFICATION ➔ IMPLEMENTED ➔ VALIDATION ➔ PILOT ➔ LIMITED ➔ PRODUCTION_READY
```

1. **`RESEARCH`**: Initial domain exploration and fact sourcing. Output: `DRY_RUN_ONLY`. Mutation: `NO_WRITE`.
2. **`SPECIFICATION`**: Skill Contract and workflow drafted. Output: `DRY_RUN_ONLY`. Mutation: `NO_WRITE`.
3. **`IMPLEMENTED`**: Code and SKILL.md implemented. Output: `Contract Test Report` only. Mutation: `NO_WRITE`.
4. **`VALIDATION`**: Running Validation Gates 0–5. Output: `Contract Test Report`. Mutation: `NO_WRITE`.
5. **`PILOT`**: Passed Gates 0–8 + Owner Release Decision (`owner-decision.md`). Output: `Candidate for Review JSON` allowed. Mutation: `NO_WRITE`.
6. **`LIMITED`**: Staged Admin API write enabled under strict owner supervision. Mutation: `ADMIN_API_ONLY`.
7. **`PRODUCTION_READY`**: Automated batch content factory active under full confidence scoring. Mutation: `ADMIN_API_ONLY`.

---

## 4. Universal Task Command Dispatcher

When a user provides a short command prompt, the AI OS Router matches the prompt against registered commands in [`.agents/registry.json`](registry.json) and routes to the designated skill: [`POLICY`]

| User Prompt | Matched Intent | Dispatched Skill | Reading Order | Action Executed |
|---|---|---|---|---|
| *"Заполни сегодня 50 карт"* | Batch Map Story Drafting | `map-content-writer` | `SKILL.md` ➔ `skill-contract.md` ➔ `validation-record.md` | Executes 10-stage pipeline for 50 unwritten targets. Outputs `Candidate for Review JSON`. |
| *"Продолжи реки"* | Filtered Story Drafting (`map_type = 'river'`) | `map-content-writer` | `SKILL.md` ➔ `river.md` | Executes 10-stage pipeline for unwritten `river` targets. Outputs `Candidate for Review JSON`. |
| *"Переведи всё новое"* | Content Localization | `multi-language-translator` | `translator/SKILL.md` | Checks specification. Outputs dry-run report. |
| *"Добавь 20 книг"* | Book Metadata Builder | `book-database-builder` | `book-builder/SKILL.md` | Checks research dossier. Outputs dry-run report. |
| *"Подбери картинки"* | Slide Image Curation | `map-slide-curator` | `slide-curator/SKILL.md` | Checks specification. Outputs dry-run report. |
| *"Создай озвучку"* | Voice Audio Generation | `voice-generator` | `voice-gen/SKILL.md` | Checks specification. Outputs dry-run report. |
| *"Покажи проблемы последней партии"* | Batch Quality Audit | `map-content-writer` | `validation-record.md` | Executes read-only audit of latest batch and STOP logs. |

---

## 5. Strict Security Invariants & Guardrails

1. 🛡️ **Read-Only Database Policy (`NO_WRITE`)**: Direct SQL `INSERT`, `UPDATE`, `DELETE`, or DDL statements in Supabase are strictly FORBIDDEN across all skills. [`POLICY`]
2. 🛡️ **No Paid External LLM APIs**: All skill executions MUST run natively inside the Antigravity IDE session using the built-in subscription model. No API keys from `.env.local` or external API calls (Gemini, OpenAI, OpenRouter, Anthropic) are permitted. [`POLICY`]
3. 🛡️ **Immutable Target Contract**: `target_id` values MUST be preserved character-for-character without trim, lowercase, slugify, or transliteration. [`POLICY`]
4. 🛡️ **Discrepancy Rule**: If code, database, or documentation conflict, the agent MUST immediately stop (`STOP-DOCS-01`) and inform the user. [`POLICY`]
