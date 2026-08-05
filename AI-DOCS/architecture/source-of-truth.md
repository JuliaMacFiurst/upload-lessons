# Источники Истины и Реестры Данных (Source of Truth Architecture)

> **СТАТУС ДОКУМЕНТА**: `POLICY` / `IMPLEMENTATION` / `DESIGN`

Документ определяет разделение между Первоисточниками данных (Origins of Truth), Операционными реестрами (Operational Registries) и Правилами применения (`POLICY`).

---

## 1. Поток Географических Идентификаторов (Map Target IDs)

```text
  [Origin of Truth]
  SVG path[id] (Векторный файл в Storage / public)
         │
         ▼ [IMPLEMENTATION: importMapTargets.ts]
  [Operational Registry]
  map_targets.target_id (Реестр в PostgreSQL)
         │
         ▼ [POLICY]
  AI-агент всегда копирует существующий target_id посимвольно без изменений
```

1. **Origin of Truth (Первоисточник)**: Векторные файлы SVG (`path[id]`). [`DESIGN` / `OPEN`: Производственная сверка всех файлов бакета `map-data` требует прямой проверки].
2. **Operational Registry (Операционный реестр)**: Таблица `map_targets` в PostgreSQL. Содержит реестр импортированных целей. [`IMPLEMENTATION`]
3. **Policy (Правило применения)**: AI-агенты и редакторы обязаны использовать точное значение `target_id` из `map_targets`. Ручные исправления или нормализации запрещены. [`POLICY`]

---

## 2. Иерархия Контента и Переводов

```text
  [Canonical Source]
  map_stories (language = 'ru') ➔ Канонический текст истории
         │
         ├──► [Derived] map_story_slides ➔ Слайды и подписи иллюстраций (нарезаются из RU текста)
         │
         └──► [Derived] content_translations (EN/HE) ➔ Локализации по source_hash (SHA-256)
```

1. **Canonical Source (Канонический источник контента)**: Запись `map_stories` с `language = 'ru'`. [`IMPLEMENTATION`]
2. **Derived Data (Производные данные)**:
   - `map_story_slides` — нарезаются из русского текста. [`IMPLEMENTATION`]
   - `content_translations` — создаются локализатором с фиксацией SHA-256 хэша оригинала (`source_hash`). [`IMPLEMENTATION`]
3. **Policy**: Текст на английском или иврите является производным и не может существовать как независимый первоисточник географической карты без русской версии. [`POLICY`]

---

## 3. Матрица Источников Истины по Доменам

| Домен / Данные | Первоисточник (Origin) | Операционный реестр (Registry) | Производные данные (Derived) | Категория доказательности |
|---|---|---|---|:---:|
| **Карты (Геометрия)** | SVG `<path id="...">` | `map_targets.target_id` | Запросы UI, поисковые слоги | `IMPLEMENTATION` |
| **Карты (Текст RU)** | Редакторский ввод / AI Draft | `map_stories` (`lang='ru'`) | `map_story_slides`, переводы | `IMPLEMENTATION` |
| **Карты (Переводы)** | RU `map_stories.content` | `content_translations` | Локализованный UI | `IMPLEMENTATION` |
| **Книги** | Редакторский ввод | `books`, `book_explanations` | `content_translations` (тип `book`) | `IMPLEMENTATION` |
| **Кошачьи карточки** | `cat_presets` | `cat_presets`, `cat_preset_slides` | `content_translations` (тип `cat_preset`) | `IMPLEMENTATION` |
| **Атрибуция медиа** | Результат поиска провайдера | `map_story_slides.image_credit_line` | Отображение подписи в UI | `IMPLEMENTATION` |
