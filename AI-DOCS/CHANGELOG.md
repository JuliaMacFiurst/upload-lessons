# Журнал Изменений AI-Документации (CHANGELOG)

Все существенные изменения в структуре и содержании `AI-DOCS/` фиксируются в данном файле.

---

## [2.3.0] — 2026-08-07

### Внедрено (Database-First Content Queue & Hard Unique Constraint)
- Создана миграция СУБД `supabase/migrations/20260807000100_map_story_database_first_queue.sql`:
  - Вычисляемая колонка `story_status text GENERATED ALWAYS AS (CASE WHEN is_approved = true THEN 'ready' ELSE 'draft' END) STORED` в `map_stories`. [`IMPLEMENTATION`]
  - Аппаратная защита `UNIQUE INDEX/CONSTRAINT` на `(type, target_id, language)` в `map_stories`. [`IMPLEMENTATION`]
  - СУБД VIEW `map_story_generation_queue` с анти-джойном `NOT EXISTS`, полностью устранившая зависимость от клиентской пагинации и лимита 1000 строк. [`IMPLEMENTATION`]
- Обновлен конвейер `Map Content Writer` (`lib/server/mapContentWriter/pilotRunner.ts`), переведенный на работу с `map_story_generation_queue`. [`IMPLEMENTATION`]
- Добавлен интеграционный и регрессионный тест-сюит `tests/map-story-queue.test.ts` (61 тест PASS). [`VERIFICATION`]
- Закреплен инвариант **`Database-First Work Selection`** в `AGENTS.md`, `.agents/AGENTS.md` и `SKILL.md`. [`POLICY`]

---

## [2.2.0] — 2026-08-06

### Выполнено (First Limited Write Batch Execution)
- На основании официального разрешения Владельца Проекта выдан одноразовый **Mutation Grant** (`USER_CONFIRMED_WRITE`, scope: 5 items max). [`POLICY`]
- Реализована серверная заслонка **`INSERT_NEW_AI_DRAFT_ONLY`** в `pages/api/admin/map-story.ts`, гарантирующая отсутствие `.update()`, принудительный черновой статус `is_approved = false` и авто-метаданные `auto_generated = true`, `auto_generation_model = "antigravity-ide"`. [`IMPLEMENTATION`]
- Выполнена первая реальная пакетная запись 5 подготовленных историй (`sea/Bransfield Strait`, `physic/Island Mafia I.`, `weather/Godavari–Krishna mangroves`, `sea/Golfo de Panamá`, `sea/Monterey Bay`). Созданы записи с ID `1393`, `1394`, `1395`, `1396`, `1397`. [`IMPLEMENTATION`]
- Проведена **Read-After-Write Verification** (100% сопоставление полей, посимвольное равенство `target_id`, отсутствие дубликатов, подтверждены черновиковые метаданные). [`VERIFICATION`]
- Одноразовый Mutation Grant переведён в статус **`CONSUMED`**, операционный режим навыка возвращен в статус **`NO_WRITE`**. [`POLICY`]

---

## [2.1.0] — 2026-08-06

### Добавлено (Universal Schema Layer & STOP-SCHEMA-01)
- Добавлен универсальный Слой Схем (`lib/server/ai/schemaLayer.ts`) с реестром канонических таблиц СУБД (`map_stories`, `content_translations`, `books`). [`IMPLEMENTATION`]
- Введено новое стоп-условие **`STOP-SCHEMA-01`** для блокировки кандидатов, не соответствующих обязательным колонкам, типам данных и non-null ограничениям целевой таблицы СУБД. [`POLICY`]
- Добавлены `CandidateBuilder` и `validateCandidateSchema()` для детерминированного построения кандидатов и разделения ролей (Skill генерирует данные, Candidate Builder сериализует, Schema Validator гарантирует точность). [`IMPLEMENTATION`]
- Проведён аудит `Map Content Writer`: кандидат приведён к канонической схеме таблицы `map_stories` (`type`, `target_id`, `language`, `content`), устранив любую зависимость от поведения LLM-промптов. [`IMPLEMENTATION`]

---

## [2.0.0] — 2026-08-06

### Создано (LapLapLa AI Operating System v2.0.0)
- Создан единый Реестр Навыков [`.agents/registry.json`](file:///Users/julia_mac/AI-Workspace/dev/upload-lessons/.agents/registry.json) для декларативной регистрации всех навыков репозитория (`map-content-writer`, `multi-language-translator`, `book-database-builder`, `map-slide-curator`, `voice-generator`). [`POLICY`]
- Создан единый Роутер AI Operating System в [`.agents/AGENTS.md`](file:///Users/julia_mac/AI-Workspace/dev/upload-lessons/.agents/AGENTS.md) и [`AGENTS.md`](file:///Users/julia_mac/AI-Workspace/dev/upload-lessons/AGENTS.md) для автономной маршрутизации коротких команд пользователя в новых сессиях Antigravity IDE. [`POLICY`]
- Создан Каталог Общих AI Модулей в [`lib/server/ai/`](file:///Users/julia_mac/AI-Workspace/dev/upload-lessons/lib/server/ai/): `languageGuard.ts`, `stopConditions.ts`, `confidenceScorer.ts`, `router.ts`, `queueEngine.ts`, `pipeline/index.ts`. [`IMPLEMENTATION`]
- Спроектирован универсальный Queue Engine в `lib/server/ai/queue/queueEngine.ts` с поддержкой Jobs, Batches, Checkpoints, Resume, Retry и локального сохранения состояния в `.agents/jobs/`. [`DESIGN`]
- Добавлена детерминированная модель оценки уверенности Production Confidence Score Engine ($CS = S_{\text{fact}} \times S_{\text{lang}} \times S_{\text{dod}} \times S_{\text{retry}}$). [`DESIGN`]
- Создана архитектурная спецификация [`AI-DOCS/architecture/ai-operating-system.md`](file:///Users/julia_mac/AI-Workspace/dev/upload-lessons/AI-DOCS/architecture/ai-operating-system.md) и [`AI-DOCS/architecture/shared-modules.md`](file:///Users/julia_mac/AI-Workspace/dev/upload-lessons/AI-DOCS/architecture/shared-modules.md). [`DESIGN`]

---

## [1.6.0] — 2026-08-06

### Добавлено (Russian Language Purity Guard — STOP-LANG-01)
- Добавлено нормативное стоп-условие **`STOP-LANG-01`** для защиты русского контента от неавторизованных латинских слов и недопереводов (например: «rockie пороги», «beautiful остров», «flows»). [`POLICY`]
- Зафиксировано правило однократного автоматического исправления (Self-Correction Retry) до Quality Gate. Если после ретрая неавторизованный Latin-токен сохраняется ➔ `STOP-LANG-01`, Candidate JSON не создается, а запись в СУБД блокируется. [`POLICY`]
- Добавлена политика явных исключений (Allowlist Policy) для стандартных аббревиатур (`GPS`, `UNESCO`) и научных латинских названий. [`POLICY`]
- В техническом валидаторе [`lib/server/mapContentWriter/outputValidator.ts`](file:///Users/julia_mac/AI-Workspace/dev/upload-lessons/lib/server/mapContentWriter/outputValidator.ts) реализована пословная токенизация и латинский валидатор `validateRussianLanguagePurity()` с двухуровневой защитой (Candidate validation + Pre-write validation). [`IMPLEMENTATION`]
- Добавлены приёмочные тесты `TEST-ACC-11` (PASS) и состязательные тесты `TEST-ADV-07` (FAIL / Retry). [`POLICY`]

---

## [1.5.0] — 2026-08-05

### Изменено (Official Skill Release: Map Content Writer v1.0.0 Promoted to PILOT)
- Создан нормативный административный артефакт Владельца Проекта `AI-DOCS/skills/map-content-writer/owner-decision.md` (Status: `APPROVED`). [`POLICY`]
- Статус навыка **Map Content Writer v1.0.0** повышен из `IMPLEMENTED` в **`PILOT`**. [`POLICY`]
- Допуски: `Content Capability = PILOT_APPROVED`, `Mutation Capability = NO_WRITE` (сохраняется), `Mutation Grant State = NO_WRITE`. [`POLICY`]
- Шлюзам ворот контроля Gates 0–8 в `validation-record.md` присвоен статус `PASS` на основании независимых аудитов и результатов IDE-native пилотов Pilot A (5 рек) и Pilot B (15 объектов). [`POLICY`]
- Разрешено формирование чистого JSON-массива **`Candidate for Review JSON`** исключительно для ручной проверки человеком-редактором. [`POLICY`]
- Прямая запись в СУБД Supabase и автоматический импорт остаются **строго запрещенными** (`NO_WRITE`). [`POLICY`]

---

## [1.4.1] — 2026-08-05

### Изменено (Refactoring Stages 2–6 Execution: Map Content Writer v1.0.0)
- Операционным Источником Истины статуса утверждён `AI-DOCS/skills/map-content-writer/validation-record.md`. [`POLICY`]
- Зафиксирован 10-этапный канонический конвейер ответственности и 11 критериев DoD. [`POLICY`]
- Разделены 2 схемы вывода: `Contract Test Report` и `Candidate for Review JSON`. [`POLICY`]

---

## [1.4.0] — 2026-08-05

### Реализовано (First Workspace Skill Implementation: Map Content Writer v1.0.0)
- Создан нормативный **Skill Contract v1.0.0** (`AI-DOCS/skills/map-content-writer/skill-contract.md`). [`POLICY`]
- Создан исполняемый файл Workspace Skill (`.agents/skills/map-content-writer/SKILL.md`). [`POLICY`]
- Создан журнал валидации `validation-record.md`. [`POLICY`]
