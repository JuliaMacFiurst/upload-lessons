# Спецификация Выходных Форматов (Output Formats)

> **СТАТУС ДОКУМЕНТА**: `SPECIFICATION` / `POLICY`

---

## 1. Два Независимых Режима Вывода

Навык `Map Content Writer` использует два разных режима вывода в зависимости от своего текущего `Lifecycle Status` в [`validation-record.md`](../validation-record.md): [`POLICY`]

---

### A. Contract Test Report (Режим `IMPLEMENTED` и `VALIDATION`)

- **Назначение**: Диагностический отчёт для инспекции и прохождения статических/адверсариальных тестов (Gates 3–5). [`POLICY`]
- **Статус вывода**: **НЕ является `Candidate for Review`** и НЕ предназначен для импорта в СУБД. [`POLICY`]
- **Формат**: Текстовый диагностический отчет вида:

```text
[DRY-RUN CONTRACT TEST RESULT]
Skill: Map Content Writer v1.0.0
Status: IMPLEMENTED
Target ID Locked: "Moma" (Protected Immutable Reference Verified)
Map Type: "river" (Semantic Focus Verified)
Research Dossier: 4 confirmed facts, 0 uncertainties
Pipeline Result: PASS (All 11 DoD criteria satisfied)
Candidate Output Simulation: Clean 3-key JSON ready.
Candidate Generation for Real Import: BLOCKED (Lifecycle status is IMPLEMENTED, requires PILOT).
```

---

### B. Candidate for Review JSON (Режим `PILOT` и выше)

- **Назначение**: Продуктовый результат генерации кандидатов для ручной проверки человеком-редактором. [`POLICY`]
- **Статус вывода**: **`Candidate for Review`**. [`POLICY`]
- **Формат**: СТРОГО чистый JSON-массив из ровно 3 ключей без Markdown-оберток, комментариев или текста:

```json
[
  {
    "map_type": "river",
    "target_id": "Moma",
    "content": "Река Мома течет через горные хребты Якутии..."
  }
]
```

- **Ровно 3 ключа**: `"map_type"`, `"target_id"`, `"content"`. [`POLICY`]
- **Правило Эмодзи**: Допускается максимум 1 тематический эмодзи только в первом предложении. Эмодзи во 2-м и последующих предложениях запрещены. [`POLICY`]
- **Без Markdown**: Поле `"content"` не содержит ссылок, сносок или разметки. [`POLICY`]

---

## 2. 🛑 Запрещенные Состояния Вывода

При генерации кандидатов в режиме `PILOT`+ **КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО**: [`POLICY`]

1. Добавлять пояснительный текст до или после JSON. [`POLICY`]
2. Возвращать дополнительные ключи в объекте JSON. [`POLICY`]
3. Вставлять ссылки на источники или библиографию внутрь поля `"content"`. [`POLICY`]
4. Выводить заголовок отчета `[DRY-RUN CONTRACT TEST RESULT]` в продуктивном JSON-режиме. [`POLICY`]
5. Считать данный результат автоматически импортированным в СУБД. [`POLICY`]
