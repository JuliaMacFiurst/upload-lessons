# Журнал Изменений AI-Документации (CHANGELOG)

Все существенные изменения в структуре и содержании `AI-DOCS/` фиксируются в данном файле.

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
