# Шаблон Паспорта AI-Навыка (Skill Passport Template)

> **СТАТУС ДОКУМЕНТА**: `POLICY` / `TEMPLATE`

---

```markdown
# ПАСПОРТ НАВЫКА: [Название Навыка]

## 1. Метаданные и Официальный Статус
- **Версия**: 1.0.0 (Semantic Version)
- **Lifecycle Status**: IDEA / RESEARCH / SPECIFICATION / IMPLEMENTED / VALIDATION / PILOT / LIMITED / PRODUCTION_READY
- **Side States**: ACTIVE / FAILED_VALIDATION / SUSPENDED / DEPRECATED / ARCHIVED
- **Content Capability**: UNTESTED / DRY_RUN_ONLY / PILOT_APPROVED / LIMITED_APPROVED / PRODUCTION_READY
- **Mutation Capability (Mutation Grant)**: NO_WRITE / PREVIEW_ONLY / USER_CONFIRMED_WRITE / SCOPED_AUTOMATION / SUSPENDED
- **Mutation Grant State**: NO_WRITE / REQUESTED / UNDER_REVIEW / GRANTED / SUSPENDED / REVOKED
- **Mutation Grant Scope**: Not applicable (или описание разрешенной таблицы/области)
- **Approved Write Endpoints**: Not applicable (или список разрешенных API эндпоинтов)
- **Skill Contract**: [ссылка на файл контракта]
- **Pre-Pilot Review (Gate 5)**: NOT_STARTED / PASS / FAIL
- **Post-Pilot Evaluation (Gate 7)**: NOT_STARTED / PASS / FAIL
- **Owner Release Decision (Gate 8)**: [ссылка на owner-decision.md]
- **Владелец**: [Имя / Роль]
- **Last Validated**: YYYY-MM-DD (или NOT_VALIDATED)
- **Next Review**: YYYY-MM-DD
- **Validation Record (Обязателен)**: [ссылка на validation-record.md]

---

## 2. Назначение и Границы
- **Цель**: [Четкое определение того, что навык делает]
- **Не-цели (Out of Scope)**: [Что навык зафиксированно НЕ должен делать]

---

## 3. Данные и Источники
- **Входные данные**: [Формат входного запроса или JSON-схема]
- **Выходные данные**: [Draft ➔ Candidate for Review ➔ Approved]
- **Канонические источники**: [Таблицы БД, эндпоинты, файлы]

---

## 4. Разграничение Полномочий и MCP
- **Необходимые MCP**: [Supabase MCP, DevTools MCP, etc.]
- **Автоматически разрешённые действия (Read-Only)**: [Чтение таблиц, SELECT, поиск]
- **Действия, требующие явного подтверждения пользователя**: [Вызов POST API, массовая обработка]
- **Категорически запрещённые действия**: [Прямой SQL-insert, удаление, изменение target_id]

---

## 5. Инварианты Безопасности и Стоп-Триггеры (Suspension Triggers)
1. [Инвариант 1, например: посимвольная неизменяемость target_id]
2. [Триггер приостановки, например: попытка записи вне scope переводит навык в SUSPENDED]

---

## 6. Конвейер Ответственности (Responsibility Pipeline)
1. Metadata Lock
2. Context
3. Research Dossier
4. Story Outline
5. Creator
6. Domain Review
7. Fact Review
8. Audience Review
9. Definition of Done (Quality Gate — PASS / FAIL)

---

## 7. Проверки и Валидация
- **Проверки фактологии**: [Сверка по иерархии источников]
- **Проверки структуры**: [Валидация JSON, наличие обязательных ключей]
- **Критерии качества**: [Метрики читаемости, индивидуальный порог правок]
- **Критерии остановки (Fail-Fast)**: [При каких ошибках навык немедленно останавливается]

---

## 8. Безопасность Внедрения и Откат
- **Размер тестовой партии**: [например, 5 элементов]
- **План отката (Rollback Plan)**: [Как восстановить прошлые данные при ошибке]
- **Метрики успеха**: [например, 100% валидность JSON и отсутствие рассинхронов]
```
