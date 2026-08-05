# Навык: Map Content Writer

> **СТАТУС НАВЫКА**: `PILOT` (см. [`validation-record.md`](validation-record.md))  
> **CONTENT CAPABILITY**: `PILOT_APPROVED`  
> **MUTATION CAPABILITY**: `NO_WRITE`  
> **MUTATION GRANT STATE**: `NO_WRITE`  
> **ВЕРСИЯ**: `1.0.0`

---

## 1. Назначение Директории

Настоящая директория содержит пакет проектной документации, нормативный **Skill Contract v1.0.0** ([`skill-contract.md`](skill-contract.md)), официальное решение Владельца Проекта ([`owner-decision.md`](owner-decision.md)) и операционный источник истины статуса — журнал валидации ([`validation-record.md`](validation-record.md)) для специализированного AI-навыка **`Map Content Writer`**. Исполняемый файл навыка расположен в системной директории Workspace Skills: `.agents/skills/map-content-writer/SKILL.md`. [`DESIGN`]

---

## 2. Юридический и Технический Статус

> 🚨 **ОФИЦИАЛЬНЫЙ СТАТУС**: Данный навык переведен в статус **`PILOT`**.
> - Операционный источник истины текущего статуса: [`validation-record.md`](validation-record.md).
> - Нормативное решение о допуске: [`owner-decision.md`](owner-decision.md) (Status: `APPROVED`).
> - Нормативный **Skill Contract v1.0.0** зафиксирован.
> - **Шлюзы проверок Gates 0–8 успешно пройдены (`PASS`)**.
> - **Генерация продуктовых кандидатов (`Candidate for Review JSON`) РАЗРЕШЕНА** для ручной проверки человеком-редактором.
> - **Прямая запись в СУБД Supabase и авто-импорт СТРОГО ЗАПРЕЩЕНЫ** (`Mutation Capability = NO_WRITE`).
> - Код приложения и база данных **НЕ МОДИФИЦИРУЮТСЯ**. [`POLICY`]

---

## 3. Структура Документов Навыка

Все файлы спецификации расположены относительно текущей директории:

- 📋 **Паспорт навыка**: [`passport.md`](passport.md) — метаданные v1.0.0, цели и границы.
- 📜 **Контракт навыка**: [`skill-contract.md`](skill-contract.md) — нормативный Skill Contract v1.0.0.
- ⚖️ **Решение Владельца**: [`owner-decision.md`](owner-decision.md) — нормативное решение о выпуске в статус `PILOT`.
- 📊 **Журнал валидации (Source of Truth)**: [`validation-record.md`](validation-record.md) — операционный реестр ворот Gates 0–8.
- ⚙️ **Техническая спецификация**: [`specification.md`](specification.md) — `Semantic Focus`, `Protected Immutable Reference` и DoD.
- 📈 **Снимок наблюдений production**: [`production-observations.md`](production-observations.md) — эмпирические заметки над СУБД.
- 🔄 **Конвейер Ответственности**: [`workflow.md`](workflow.md) — 10-этапный канонический конвейер ответственности.
- 🗺️ **Спецификации типов карт (`map-types/`)**:
  - [`country.md`](map-types/country.md) | [`flag.md`](map-types/flag.md) | [`culture.md`](map-types/culture.md)
  - [`food.md`](map-types/food.md) | [`river.md`](map-types/river.md) | [`sea.md`](map-types/sea.md)
  - [`animal.md`](map-types/animal.md) | [`weather.md`](map-types/weather.md) | [`physic.md`](map-types/physic.md)
- 🛡️ **Чек-листы качества (`quality/`)**:
  - [`factual-checklist.md`](quality/factual-checklist.md) — проверка фактов и иерархия источников.
  - [`editorial-checklist.md`](quality/editorial-checklist.md) — стиль, тон, тематический hook и открытый CTA.
  - [`structural-checklist.md`](quality/structural-checklist.md) — валидация JSON и инварианты.
  - [`stop-conditions.md`](quality/stop-conditions.md) — реестр стоп-условий со стабильными ID.
- 📄 **Форматы ввода и вывода (`formats/`)**:
  - [`input.md`](formats/input.md) — ввод от Orchestrator (без курсоров).
  - [`output.md`](formats/output.md) — спецификация формата `Candidate for Review JSON`.
- 🧪 **Тестирование и пилотирование (`tests/`)**:
  - [`acceptance-tests.md`](tests/acceptance-tests.md) — приёмочные тесты для реальных и синтетических фикстур.
  - [`adversarial-cases.md`](tests/adversarial-cases.md) — защита от типичных ошибок модели и пользователя.
  - [`pilot-plan.md`](tests/pilot-plan.md) — 3-этапный план безопасного пилотного выката.

---

## 4. Права в Статусе PILOT

1. Сформированные объекты `Candidate for Review JSON` передаются человеку-редактору для вычитывания. [`POLICY`]
2. Сохранение `Mutation Capability = NO_WRITE` гарантирует защиту базы данных Supabase от несанкционированной автоматической записи. [`POLICY`]
