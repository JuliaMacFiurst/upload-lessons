# Чек-Лист Структурной Валидации и Инвариантов (Structural Checklist)

> **СТАТУС ДОКУМЕНТА**: `POLICY`

---

## 1. Сквозные Инварианты Структуры

Сквозная проверка структуры выполняется на 9-м этапе (`Definition of Done`) конвейера ответственности. Канонический список из 11 критериев зафиксирован в [`skill-contract.md`](../skill-contract.md#10-canonical-definition-of-done-11-единых-критериев). [`POLICY`]

### Чек-лист проверки:
- [ ] **Exact target verification**: Подтверждено существование объекта в `map_targets` через exact `SELECT`. [`POLICY`]
- [ ] **Exact RU-story absence**: Подтверждено отсутствие записи `map_stories` с `language = 'ru'` через exact `SELECT`. [`POLICY`]
- [ ] **Immutable Target Contract**: Значение `target_id` сохранено посимвольно согласно `Protected Immutable Reference` (проверены 10 запретов: no trim, no case change, no space change, no dash/quote change, no diacritics removal, no Unicode norm, no transliteration, no slugify, no title reconstruction, no ILIKE). [`POLICY`]
- [ ] **Semantic Allowlist**: Поле `map_type` сохранено и входит в число 9 разрешенных типов. [`POLICY`]
- [ ] **Valid JSON**: Выходная структура является валидным JSON-массивом. [`POLICY`]
- [ ] **Exactly 3 Keys**: Каждая история в режиме импорта содержит ровно 3 ключа (`"map_type"`, `"target_id"`, `"content"`). [`POLICY`]
- [ ] **No Side Effects**: База данных и исходный код проекта не подвергались изменениям. [`POLICY`]
