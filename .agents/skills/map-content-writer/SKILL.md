---
name: map-content-writer
description: Executable Workspace Skill for drafting canonical Russian map stories for interactive map targets in 'Сказки Капибары'.
---

# Workspace Skill: Map Content Writer

- **Skill Name**: `Map Content Writer`
- **Skill Version**: `1.0.0`
- **Contract Version**: `1.0.0`

> 🚨 **ОПЕРАЦИОННЫЙ СТАТУС**: Текущие `Lifecycle Status` и `capabilities` при каждом запуске читаются только из [`../../../AI-DOCS/skills/map-content-writer/validation-record.md`](../../../AI-DOCS/skills/map-content-writer/validation-record.md). Файл `SKILL.md` **не является источником текущего статуса**. [`POLICY`]

Настоящий файл является исполняемой реализацией нормативного **Skill Contract v1.0.0** ([`../../../AI-DOCS/skills/map-content-writer/skill-contract.md`](../../../AI-DOCS/skills/map-content-writer/skill-contract.md)). [`POLICY`]

---

## 1. Замок Безопасности Статуса (Lifecycle Policy Enforcement)

> 🚨 **ПОЛИТИКА БЕЗОПАСНОСТИ**:
> Candidate Generation запрещён POLICY при Lifecycle Status ниже PILOT. Это инструкция исполнения навыка, а не гарантия sandbox, MCP или API-level enforcement. [`POLICY`]

Если `validation-record.md` указывает статус ниже `PILOT` (например, `IMPLEMENTED` или `VALIDATION`), навык **ОБЯЗАН ОТКАЗАТЬСЯ** от вывода кандидатов для импорта и сформировать только диагностический `Contract Test Report`. [`POLICY`]

---

## 2. Маршрутизация Документов и Относительные Пути

Перед исполнением задачи навык обращается к каноническим нормативным документам по относительным путям от текущей директории `.agents/skills/map-content-writer/`: [`POLICY`]

### Нормативные документы ядра:
- **Операционный реестр статусов**: [`../../../AI-DOCS/skills/map-content-writer/validation-record.md`](../../../AI-DOCS/skills/map-content-writer/validation-record.md)
- **Контракт навыка**: [`../../../AI-DOCS/skills/map-content-writer/skill-contract.md`](../../../AI-DOCS/skills/map-content-writer/skill-contract.md)
- **Паспорт метаданных**: [`../../../AI-DOCS/skills/map-content-writer/passport.md`](../../../AI-DOCS/skills/map-content-writer/passport.md)
- **Спецификация**: [`../../../AI-DOCS/skills/map-content-writer/specification.md`](../../../AI-DOCS/skills/map-content-writer/specification.md)
- **Канонический конвейер**: [`../../../AI-DOCS/skills/map-content-writer/workflow.md`](../../../AI-DOCS/skills/map-content-writer/workflow.md)
- **Наблюдения production**: [`../../../AI-DOCS/skills/map-content-writer/production-observations.md`](../../../AI-DOCS/skills/map-content-writer/production-observations.md)

### Чек-листы качества:
- **Фактологический чек-лист**: [`../../../AI-DOCS/skills/map-content-writer/quality/factual-checklist.md`](../../../AI-DOCS/skills/map-content-writer/quality/factual-checklist.md)
- **Редакторский чек-лист**: [`../../../AI-DOCS/skills/map-content-writer/quality/editorial-checklist.md`](../../../AI-DOCS/skills/map-content-writer/quality/editorial-checklist.md)
- **Структурный чек-лист**: [`../../../AI-DOCS/skills/map-content-writer/quality/structural-checklist.md`](../../../AI-DOCS/skills/map-content-writer/quality/structural-checklist.md)
- **Реестр стоп-условий**: [`../../../AI-DOCS/skills/map-content-writer/quality/stop-conditions.md`](../../../AI-DOCS/skills/map-content-writer/quality/stop-conditions.md)

### Маршрутизация Спецификаций Типов Карт (`map-types`):

| Значение `map_type` | Относительный путь спецификации | При неизвестном типе |
|---|---|---|
| `country` | [`../../../AI-DOCS/skills/map-content-writer/map-types/country.md`](../../../AI-DOCS/skills/map-content-writer/map-types/country.md) | — |
| `flag` | [`../../../AI-DOCS/skills/map-content-writer/map-types/flag.md`](../../../AI-DOCS/skills/map-content-writer/map-types/flag.md) | — |
| `culture` | [`../../../AI-DOCS/skills/map-content-writer/map-types/culture.md`](../../../AI-DOCS/skills/map-content-writer/map-types/culture.md) | — |
| `food` | [`../../../AI-DOCS/skills/map-content-writer/map-types/food.md`](../../../AI-DOCS/skills/map-content-writer/map-types/food.md) | — |
| `river` | [`../../../AI-DOCS/skills/map-content-writer/map-types/river.md`](../../../AI-DOCS/skills/map-content-writer/map-types/river.md) | — |
| `sea` | [`../../../AI-DOCS/skills/map-content-writer/map-types/sea.md`](../../../AI-DOCS/skills/map-content-writer/map-types/sea.md) | — |
| `animal` | [`../../../AI-DOCS/skills/map-content-writer/map-types/animal.md`](../../../AI-DOCS/skills/map-content-writer/map-types/animal.md) | — |
| `weather` | [`../../../AI-DOCS/skills/map-content-writer/map-types/weather.md`](../../../AI-DOCS/skills/map-content-writer/map-types/weather.md) | — |
| `physic` | [`../../../AI-DOCS/skills/map-content-writer/map-types/physic.md`](../../../AI-DOCS/skills/map-content-writer/map-types/physic.md) | — |
| *Любое иное* | **НЕДОПУСТИМО** | **Срабатывание `STOP-TYPE-01` (STOP)** |

---

## 3. Исполнение Канонического Конвейера (10 Стадий)

```text
[Input Boundary]
  ➔ 1. Metadata Lock
  ➔ 2. Production Context
  ➔ 3. Research Dossier
  ➔ 4. Story Outline
  ➔ 5. Writer
  ➔ 6. Map-Type Review (Domain Review)
  ➔ 7. Fact Check (Fact Review)
  ➔ 8. Kids Editor (Audience Review)
  ➔ 9. Definition of Done
  ➔ 10. Candidate Assembly
[Output Boundary]
```

### Правила Исполнения Стадий:

1. **`Boundary Input`**: Принять готовый массив объектов от Orchestrator (`{ map_type, target_id, title_ru, title_en, title_he }`). Не выбирать объекты самостоятельно и не использовать курсоры. Поле `title_he` принимается, но не используется. [`POLICY`]
2. **`1. Metadata Lock`**: Захватить `target_id` в `Protected Immutable Reference`. Соблюдать 10 запретов (no trim, no case change, no space change, no dash/quote change, no diacritics removal, no Unicode norm, no transliteration, no slugify, no title reconstruction, no ILIKE). Выполнить exact `SELECT` проверки `map_targets` и отсутствия `language = 'ru'` в `map_stories`. При несовпадении ➔ `STOP-META-01` / `STOP-META-02` / `STOP-META-03`. [`POLICY`]
3. **`2. Production Context`**: Считать правила из `production-observations.md`. [`POLICY`]
4. **`3. Research Dossier`**: Собрать 4 блока досье: `confirmed_facts[]`, `rejected_facts[]`, `uncertainties[]`, `source_summary[]`. Не уверен ➔ `STOP-RESEARCH-01` / `STOP-RESEARCH-02`. [`POLICY`]
5. **`4. Story Outline`**: Сначала выбрать главную идею текста, затем подобрать 3–5 фактов из `confirmed_facts[]`, работающих на идею. Спроектировать тематический Hook и открытый CTA. [`POLICY`]
6. **`5. Writer`**: Написать авторский текст на русском языке. Объем **80–140 слов** (целевой 90–130). Допускается максимум **1 эмодзи только в 1-м предложении** (не обязательно). Эмодзи во 2-м+ предложениях запрещены. Без Markdown и ссылок. [`POLICY`]
7. **`6. Map-Type Review`**: Проверить `Semantic Focus` по таблице маршрутизации из 9 типов. **Запрещено менять `map_type` ➔ `STOP-TYPE-02`**. [`POLICY`]
8. **`7. Fact Check`**: Проверить каждое атомарное фактическое утверждение текста по `confirmed_facts[]`. Связующие, стилистические и вопросительные конструкции не требуют отдельного источника, если сами не содержат проверяемого факта. Неподтверждено ➔ `STOP-FACT-01`. [`POLICY`]
9. **`8. Kids Editor`**: Проверить доступность 6–10 лет без сюсюканья, тематичный Hook и открытый мыслительный CTA. Нарушение ➔ `STOP-KIDS-01`. [`POLICY`]
10. **`9. Definition of Done`**: Проверить все 11 критериев Канонического DoD из `skill-contract.md`. **Quality Gate НЕ переписывает текст! Несовпадение ➔ `STOP-DOD-01` (FAIL)**. [`POLICY`]
11. **`10. Candidate Assembly`**: Сформировать результат в зависимости от статуса в `validation-record.md`: `Contract Test Report` (в `IMPLEMENTED`/`VALIDATION`) или чистый JSON из 3 ключей (в `PILOT`+). Внутреннее досье в JSON не передается. [`POLICY`]

---

## 4. Динамический Шаблон `Contract Test Report`

В статусе ниже `PILOT` навык формирует следующий динамический диагностический отчет: [`POLICY`]

```text
[DRY-RUN CONTRACT TEST RESULT]
Skill: Map Content Writer v1.0.0
Operational Status Source: AI-DOCS/skills/map-content-writer/validation-record.md
Target ID Locked: "<target_id>" (Protected Immutable Reference Verified)
Map Type: "<map_type>" (Semantic Focus Verified)
Research Dossier: <N> confirmed facts, <N> uncertainties, <N> sources
Pipeline Result: PASS | FAIL | NOT_EVALUATED
Triggered Stop Conditions: [<STOP-ID-LIST>]
Defects: [<DEFECT-LIST>]
Candidate Simulation Status: VALID | INVALID | NOT_GENERATED
Candidate Generation for Real Import: BLOCKED | ALLOWED_BY_STATUS
```

---

## 5. Запрещенные Действия и Ограничения

- 🛡️ **Языковая чистота русского текста (`STOP-LANG-01`)**: Запрещены английские слова, недопереводы и смешанные конструкции в русском поле `content`. До Quality Gate допускается однократное авто-исправление. При повторном обнаружении латинского токена ➔ присваивается `STOP-LANG-01`, Candidate JSON не создается, а запись в СУБД блокируется. Исключения — только по явным правилам allowlist. [`POLICY`]
- 🛡️ **Запрет мутирующих вызовов**: Любые операции `INSERT/UPDATE/DELETE`, DDL-миграции или вызовы мутирующих Admin API (`/api/admin/*`) запрещены на уровне ПОЛИТИКИ. [`POLICY`]
- 🛡️ **Запрет воображаемых фикстур**: Запрещено использовать несуществующие в `map_targets` `target_id`. [`POLICY`]
- 🛡️ **Запрет дрейфа правил**: При обнаружении любого расхождения между `AI-DOCS`, кодом и СУБД навык обязан немедленно остановиться (`STOP-DOCS-01`). [`POLICY`]
- 🛡️ **Чистота вывода**: Запрещено включать chain-of-thought, внутренние рассуждения или разметку в ответ. [`POLICY`]
