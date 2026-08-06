# Каталог Общих Модулей AI-Инфраструктуры (Shared AI Framework Catalog)

> **СТАТУС ДОКУМЕНТА**: `SPECIFICATION` / `DESIGN`  
> **СВЯЗАННЫЙ КОД**: [`lib/server/ai/`](../../lib/server/ai/)

---

## 1. Структура Общих Модулей (`lib/server/ai/`)

Все общие сервисы AI-инфраструктуры расположены в директории `lib/server/ai/`:

```text
lib/server/ai/
├── types.ts                # Единые TypeScript типы (Skills, Registry, Queue, Confidence)
├── stopConditions.ts       # Единый реестр стоп-условий (STOP-META-*, STOP-LANG-01, etc.)
├── languageGuard.ts        # Russian Language Purity Guard (STOP-LANG-01 & Allowlist)
├── confidenceScorer.ts     # Production Confidence Score Engine (0–100%)
├── router.ts               # Domain-Agnostic AI Command Router
├── queue/
│   └── queueEngine.ts      # Universal Queue Engine (Jobs, Batches, Checkpoints, Resume)
└── pipeline/
    └── index.ts            # Universal AI Pipeline Framework (Research, Writer, Quality, DoD)
```

---

## 2. Использование Модулей Навыками

Все существующие и будущие навыками импортируют модули качества и безопасности из единой точки:

```typescript
import {
  validateRussianLanguagePurity,
  calculateConfidenceScore,
  STOP_CONDITIONS_REGISTRY,
  QueueEngine,
  AIRouter
} from "@/lib/server/ai";
```
