# Контракт Навыка: Map Content Writer (Skill Contract)

> **СТАТУС ДОКУМЕНТА**: `POLICY` / `CONTRACT`  
> **ВЕРСИЯ КОНТРАКТА**: `1.0.0`

---

## 1. Identity

- **Name**: `Map Content Writer`
- **Contract Version**: `1.0.0`
- **Canonical Operational Status Registry**: [`validation-record.md`](validation-record.md) [`POLICY`]
- **Lifecycle Status Snapshot**: `IMPLEMENTED` (см. [`validation-record.md`](validation-record.md))
- **Content Capability Snapshot**: `DRY_RUN_ONLY`
- **Mutation Capability Snapshot**: `NO_WRITE`
- **Mutation Grant State**: `NO_WRITE`

---

## 2. Purpose

Написание фактологически проверенных, увлекательных и естественных русскоязычных текстов-кандидатов (`content`) для существующих объектов интерактивных карт (`map_targets`), переданных внешним процессом и не имеющих точной истории на русском языке (`language = 'ru'`). [`POLICY`]

---

## 3. Input Contract

Навык получает **исключительно готовый массив объектов** от внешнего Orchestrator или человека. [`POLICY`]

- Навык **НЕ выбирает следующим объектом**, не использует `cursor` или `starting_after_id`, не формирует партии и не выполняет самостоятельный поиск незаполненных `map_targets`. [`POLICY`]

Каждый объект входного массива содержит:
- `map_type`: один из 9 разрешенных семантических типов СУБД. [`POLICY`]
- `target_id`: точный технический идентификатор из таблицы `map_targets`. [`POLICY`]
- `title_ru`: официальное русское название объекта. [`POLICY`]
- `title_en`: английское название для поиска и фактчекинга. [`POLICY`]
- `title_he`: (опционально) ивритский заголовок (навыком принимается, но не используется). [`POLICY`]
- Данные для exact read-only проверки отсутствия готовой истории `map_stories`. [`POLICY`]

---

## 4. Output Contract (Два Режима Вывода)

Режим вывода строго зависит от `Lifecycle Status` навыка в [`validation-record.md`](validation-record.md): [`POLICY`]

### A. Contract Test Report (Режим `IMPLEMENTED` и `VALIDATION`)
- Диагностический текстовый отчет инспекции. [`POLICY`]
- Не предназначен для продуктового импорта. [`POLICY`]
- Содержит отметку `[DRY-RUN CONTRACT TEST RESULT]`, статусы выполнения ворот и результаты симуляции. [`POLICY`]
- **Не является `Candidate for Review`**. [`POLICY`]

### B. Candidate for Review JSON (Режим `PILOT` и выше)
- Строго чистый JSON-массив без Markdown-оберток, заголовков, комментариев или пояснений: [`POLICY`]

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
- **Без Markdown и ссылок**: Поле `"content"` не содержит ссылок, разметки или сносок. [`POLICY`]
- **Максимум 1 эмодзи**: Допускается максимум 1 тематический эмодзи только в первом предложении (не обязательно). Эмодзи в остальных предложениях запрещены. [`POLICY`]
- **Официальный статус вывода**: `Candidate for Review`. [`POLICY`]

---

## 5. Immutable Target Contract (10 Запретов target_id)

После получения `target_id` из входного объекта значение фиксируется в **Protected Immutable Reference**. **КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО**: [`POLICY`]

1. `trim()` (удаление начальных/конечных пробелов). [`POLICY`]
2. Изменение регистра символов (Case change / Lowercase / Uppercase). [`POLICY`]
3. Изменение любых внутренних пробелов. [`POLICY`]
4. Замена дефисов, тире, дефисов-минусов и пунктуации Unicode. [`POLICY`]
5. Замена апострофов, кавычек или спецсимволов. [`POLICY`]
6. Удаление диакритических знаков. [`POLICY`]
7. Нормализация Unicode (Unicode Normalization NFC/NFD). [`POLICY`]
8. Транслитерация (Transliteration). [`POLICY`]
9. Преобразование в slug (Slugify). [`POLICY`]
10. Реконструкция или сборка заново из полей `title_ru` / `title_en` / `title_he`. [`POLICY`]

*Сравнение с базой данных `map_targets` выполняется строго посимвольным exact равенством `=`. Использование `ILIKE`, `LIKE`, prefix, substring или fuzzy-matching запрещено.* [`POLICY`]

---

## 6. Semantic Allowlist (9 типов карт)

Разрешено ровно 9 значений `map_type`:
1. `country` (Страна и её географический образ)
2. `flag` (Государство через призму флага)
3. `culture` (Традиции и культура)
4. `food` (Национальная кухня и ингредиенты)
5. `river` (Гидрография рек)
6. `sea` (Водные объекты и моря)
7. `animal` (Природный биом и живой мир)
8. `weather` (Климатические зоны)
9. `physic` (Физико-географический рельеф)

[`POLICY`]

---

## 7. Allowed & Forbidden Tools

### Allowed Tools:
- Чтение проектной документации в `AI-DOCS/` по относительным путям. [`POLICY`]
- Supabase MCP строго в режиме **READ-ONLY (`SELECT`)**. [`POLICY`]
- Веб-поиск (`search_web`) и чтение URL (`read_url_content`) для фактчекинга. [`POLICY`]
- Context7 MCP исключительно для технической документации. [`POLICY`]

### Forbidden Tools and Actions:
- **Запрещенные SQL-операции**: `INSERT`, `UPDATE`, `DELETE`, `UPSERT`, `DDL`-миграции. [`POLICY`]
- **Запрещенные вызовы**: вызов мутирующих Admin API (`/api/admin/*`). [`POLICY`]
- **Запрет чтения секретов**: чтение файлов `.env`, `.env.local` или ключей. [`POLICY`]
- **Вне рамок навыка**: выборка следующих объектов из СУБД, перевод на EN/HE, подбор картинок, создание слайдов, публикация. [`POLICY`]

---

## 8. Canonical Responsibility Pipeline (10 Канонических Стадий)

Навык выполняет 10 нормативных стадий ответственности между техническими границами ввода и вывода: [`POLICY`]

```text
[Input Boundary]
  ➔ 1. Metadata Lock
  ➔ 2. Production Context
  ➔ 3. Research
  ➔ 4. Story Outline
  ➔ 5. Writer
  ➔ 6. Map-Type Review (Domain Review)
  ➔ 7. Fact Check (Fact Review)
  ➔ 8. Kids Editor (Audience Review)
  ➔ 9. Definition of Done
  ➔ 10. Candidate Assembly
[Output Boundary]
```

| Стадия | Предметная роль для Карт | Вход | Выход | Ограничения / Права |
|---|---|---|---|---|
| **Boundary** | Input Boundary | Входной JSON | `RawInput` | Прием готового массива объектов от Orchestrator |
| **1** | `Metadata Lock` | `RawInput` | `LockedMetadata` | Захват `target_id` в Protected Immutable Reference |
| **2** | `Production Context` | `LockedMetadata` | `ContextualizedMetadata` | Считывание уроков из `production-observations.md` |
| **3** | `Research` | `ContextualizedMetadata` | `VerifiedFactsDossier` | Сбор досье фактов (`confirmed_facts[]`, `rejected_facts[]`, `uncertainties[]`, `source_summary[]`) |
| **4** | `Story Outline` | `VerifiedFactsDossier` | `StoryOutline` | Выбор главной идеи ➔ Подбор 3-5 фактов на идею |
| **5** | `Writer` | `StoryOutline` + `VerifiedFactsDossier` | `DraftContent` | Авторский текст 80–140 слов (целевой 90–130) |
| **6** | `Map-Type Review` | `DraftContent` + `map_type` | `TypeApprovedContent` | Проверка `Semantic Focus` (**Запрет авто-мутации `map_type` ➔ STOP**) |
| **7** | `Fact Check` | `TypeApprovedContent` + `VerifiedFactsDossier` | `FactCheckedContent` | Пословная сверка атомарных утверждений с досье |
| **8** | `Kids Editor` | `FactCheckedContent` | `KidsPolishedContent` | Проверка тона 6–10 лет, тематичного Hook и открытого CTA |
| **9** | `Definition of Done` | `KidsPolishedContent` + `Protected Reference` | `ValidatedStoryObject` | **Quality Gate (Бинарный PASS / FAIL, без переписывания контента!)** |
| **10** | `Candidate Assembly` | Набор `ValidatedStoryObject` | Выходной массив | Формирование `Contract Test Report` или `Candidate JSON` |
| **Boundary** | Output Boundary | Выходной массив | Выходной ответ | Передача результата пользователю / рецензенту |

---

## 9. Reusable Stop Conditions Registry (Стабильные ID)

Навык **ОБЯЗАН НЕМЕДЛЕННО ОСТАНОВИТЬСЯ (FAIL-FAST)** при срабатывании любого из следующих стоп-условий: [`POLICY`]

| ID Стоп-Условия | Триггер срабатывания | Стадия Pipeline | Ожидаемое поведение | Связанный Тест |
|---|---|---|---|---|
| **`STOP-META-01`** | `target_id` или `map_type` отсутствует во входном объекте | 1. Metadata Lock | Отбраковка объекта (STOP) | `TEST-ADV-01` |
| **`STOP-META-02`** | Объект с точной парой `(map_type, target_id)` отсутствует в `map_targets` | 1. Metadata Lock | Отбраковка объекта (STOP) | `TEST-ACC-01` |
| **`STOP-META-03`** | История карт `map_stories` с `(type, target_id, language='ru')` уже существует | 1. Metadata Lock | Отбраковка объекта (STOP) | `TEST-ACC-02` |
| **`STOP-TYPE-01`** | `map_type` не входит в allowlist из 9 значений | 1. Metadata Lock | Отбраковка объекта (STOP) | `TEST-ADV-02` |
| **`STOP-RESEARCH-01`**| Ключевые факты не удается подтвердить по 2 независимым источникам | 3. Research | Отбраковка объекта (STOP) | `TEST-ACC-05` |
| **`STOP-RESEARCH-02`**| Географическая или природная сущность объекта неоднозначна | 3. Research | Отбраковка объекта (STOP) | `TEST-ADV-04` |
| **`STOP-TYPE-02`** | Текст не соответствует `Semantic Focus` данного `map_type` | 6. Map-Type Review | Отбраковка объекта без смены типа (STOP) | `TEST-ADV-03` |
| **`STOP-FACT-01`** | Автор включил факт, отсутствующий в `confirmed_facts[]`, или гиперболу | 7. Fact Check | Отбраковка объекта (STOP) | `TEST-ACC-06` |
| **`STOP-KIDS-01`** | Hook является абстрактным или CTA является закрытым вопросом | 8. Kids Editor | Отбраковка объекта (STOP) | `TEST-ACC-07` |
| **`STOP-DOD-01`** | Нарушен хотя бы один из 11 критериев Канонического DoD | 9. Definition of Done | Отбраковка объекта (FAIL) | `TEST-ACC-10` |
| **`STOP-DOCS-01`** | Обнаружено несоответствие между `AI-DOCS`, кодом и СУБД | На любой стадии | Полная остановка вызова | `TEST-ADV-05` |
| **`STOP-SAFETY-01`**| Пользователь/команда просит выполнить мутирующую запись в СУБД | На любой стадии | Отказ и отбраковка | `TEST-ADV-06` |

---

## 10. Canonical Definition of Done (11 Единых Критериев)

Навык признает результат валидным **ТОЛЬКО при одновременном выполнении 11 критериев**: [`POLICY`]

1. [ ] Объект подтвержденно существует в `map_targets` (`exact SELECT`).
2. [ ] Точная RU-история `map_stories` (`language = 'ru'`) в базе отсутствует (`exact SELECT`).
3. [ ] Поле `target_id` сохранено посимвольно согласно `Protected Immutable Reference`.
4. [ ] Поле `map_type` сохранено и входит в allowlist 9 семантических типов.
5. [ ] Выходной JSON полностью валиден.
6. [ ] Выходной объект в режиме импорта содержит ровно три ключа (`map_type`, `target_id`, `content`).
7. [ ] Текст строго соответствует `Semantic Focus` своего типа карты.
8. [ ] Каждое атомарное фактическое утверждение подтверждено по досье `confirmed_facts[]`.
9. [ ] Hook уникален и относится именно к предмету данного объекта.
10. [ ] CTA является открытым мыслительным вопросом (*«Как ты думаешь...»*, *«Почему...»*).
11. [ ] Объем текста находится в диапазоне 80–140 слов (обычно 90–130), содержит не более 1 эмодзи в 1-м предложении, а production-СУБД не изменялась.

---

## 11. Contract Change Rules

- **MAJOR**: Несовместимые изменения схем входа/выхода, изъятие типов карт или изменение прав. [`POLICY`]
- **MINOR**: Обратимо совместимые расширения входа/выхода, новые типы проверок. [`POLICY`]
- **PATCH**: Редакционные уточнения формулировок, опечатки в комментариях. [`POLICY`]
- Любое изменение контракта **требует обязательной Full Revalidation (Gates 0–8)**. [`POLICY`]
