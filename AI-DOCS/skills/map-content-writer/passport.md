# Паспорт Навыка: Map Content Writer

> **СТАТУС ДОКУМЕНТА**: `SPECIFICATION` / `POLICY`

---

## 1. Метаданные и Ссылка на Операционный Реестр Статусов

- **Название навыка**: `Map Content Writer`
- **Версия**: `1.0.0` (Semantic Version)
- **Операционный Источник Истины Статуса**: [`validation-record.md`](validation-record.md) [`POLICY`]
- **Lifecycle Status Snapshot**: `PILOT` (см. [`validation-record.md`](validation-record.md))
- **Content Capability Snapshot**: `PILOT_APPROVED`
- **Mutation Capability Snapshot**: `NO_WRITE`
- **Mutation Grant State**: `NO_WRITE`
- **Mutation Grant Scope**: `Not applicable`
- **Approved Write Endpoints**: `Not applicable`
- **Skill Contract**: [`skill-contract.md`](skill-contract.md)
- **Validation Record**: [`validation-record.md`](validation-record.md)
- **Owner Release Decision**: [`owner-decision.md`](owner-decision.md) (Status: `APPROVED`)
- **Pre-Pilot Review (Gate 5)**: `PASS`
- **Post-Pilot Evaluation (Gate 7)**: `PASS`
- **Owner Release Decision (Gate 8)**: `PASS`
- **Владелец**: Продуктовая редакция проекта «Сказки Капибары»
- **Last Validated**: 2026-08-05
- **Next Review**: После завершения массового пилотирования Pilot C

---

## 2. Назначение и Границы Ответственности

### Цель (Goal):
Написание фактологически проверенных, увлекательных и грамотных русскоязычных текстов (`content`) для готового списка объектов карт (`map_targets`), полученных от внешнего оркестратора или пользователя. [`DESIGN`]

### Не-цели (Out of Scope / Non-Goals):
1. Навык **НЕ принимает самостоятельных решений о выборке объектов из СУБД**. [`POLICY`]
2. Навык **НЕ выполняет перевод** текстов на английский или иврит. [`POLICY`]
3. Навык **НЕ подбирает и НЕ привязывает иллюстрации** или видеоклипы. [`POLICY`]
4. Навык **НЕ нарезает текст на слайды** (`map_story_slides`). [`POLICY`]
5. Навык **НЕ записывает данные напрямую в production-базу** и не делает SQL-запросы `INSERT/UPDATE`. [`POLICY`]
6. Навык **НЕ изменяет существующие одобренные истории**. [`POLICY`]
7. Навык **НЕ модифицирует и НЕ "исправляет" `target_id`**. [`POLICY`]
8. Навык **НЕ исправляет осиротевшие записи (orphan stories)**. [`POLICY`]
9. Навык **НЕ выполняет DDL-миграции** базы данных. [`POLICY`]
10. Навык **НЕ публикует контент** в клиентском приложении. [`POLICY`]

---

## 3. Данные и Инструменты

### Входные данные:
- Список целевых объектов от внешнего процесса (Orchestrator).
- `map_type` (один из 9 допустимых типов из allowlist). [`POLICY`]
- Точный `target_id` из `map_targets`. [`POLICY`]
- Поля заголовков: `title_ru`, `title_en` (`title_he` навыком принимается, но не используется). [`POLICY`]

### Выходные данные:
В соответствии с [`skill-contract.md`](skill-contract.md): В статусе `PILOT` навык формирует чистый JSON-массив из 3 ключей со статусом **`Candidate for Review JSON`** исключительно для проверки человеком-редактором. [`POLICY`]

### Необходимые MCP-инструменты:
- **Supabase MCP (`supabase`)**: Режим **READ-ONLY** (`SELECT`) для проверки метаданных объектов. [`POLICY`]
- **Веб-поиск (`search_web` / `read_url_content`)**: Для фактчекинга по иерархии авторитетных источников. [`POLICY`]
- **Context7 MCP**: Запрещен как источник фактов по географии, гидрологии или истории. [`POLICY`]

---

## 4. Ограничения Пакетной Обработки

- **Размер первой тестовой партии**: ровно **5 объектов**. [`POLICY`]
- **Предельный размер партии до отдельного подтверждения**: не более **20 объектов**. [`POLICY`]

---

## 5. План Отката (Rollback Plan)

Поскольку навык в статусе `PILOT` не вносит изменения в базу данных (`Mutation Capability = NO_WRITE`), а результат возвращается исключительно в виде черновика **Candidate for Review JSON** для ручной проверки редактором, откат базы данных **не требуется**. В случае ошибки редактор отклоняет черновик. [`POLICY`]
