# Домены Данных и Таблицы Базы Данных

> **СТАТУС ДОКУМЕНТА**: `CONFIRMED`
> **ИСТОЧНИК**: Схема production-базы Supabase (37 таблиц схемы `public`).

---

## Общий реестр доменов

```text
                                  ┌───────────────────────────┐
                                  │   content_translations    │
                                  └─────────────▲─────────────┘
                                                │ (Переводы EN/HE)
 ┌──────────────┐  ┌──────────────┐  ┌──────────┴───┐  ┌──────────────┐  ┌──────────────┐
 │ Maps Domain  │  │ Books Domain │  │ Cats Domain  │  │Parrot Domain │  │Recipes Domain│
 └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

---

## 1. Домен Maps (Интерактивные Карты)

### Таблицы:
- **`map_targets`** (Родительская сущность): Реестр географических объектов.
  - *Колонки*: `id` (uuid, PK), `map_type` (text), `target_id` (text), `title_ru` (text), `title_en` (text), `title_he` (text), `created_at`, `updated_at`. [CONFIRMED]
- **`map_stories`** (Каноническая история): Текст истории объекта на русском языке.
  - *Колонки*: `id` (bigint, PK), `type` (text), `target_id` (text), `language` (text, по умолчанию `'ru'`), `content` (text), `is_approved` (bool), `images` (jsonb), `audio_url` (text), `google_maps_url` (text), `youtube_url_ru`, `youtube_url_en`, `youtube_url_he` (text), `content_mode` (text), `slides_ready` (bool), `auto_generated` (bool), `auto_generation_model` (text), `created_at`, `updated_at`. [CONFIRMED]
- **`map_story_slides`** (Дочерняя сущность слайдов): Нарезанные предложения и медиаиллюстрации.
  - *Колонки*: `id` (uuid, PK), `story_id` (bigint, FK ➔ `map_stories.id`), `slide_order` (int), `text` (text), `image_url` (text), `image_provider` (text), `image_source_page` (text), `image_license` (text), `image_license_url` (text), `image_author` (text), `image_credit_line` (text), `created_at`, `updated_at`. [CONFIRMED]

- **Канонический оригинал**: `map_stories` с `language = 'ru'`. [CONFIRMED]
- **Производные данные**: `map_story_slides` (нарезаются из `content`), записи в `content_translations`. [CONFIRMED]
- **Статус публикации**: `is_approved` в `map_stories` и `slides_ready`. [CONFIRMED]
- **Переводимая структура**: Весь текст `content` переводится на EN/HE и сохраняется в `content_translations` (`content_type = 'map_story'`). [CONFIRMED]

---

## 2. Домен Books (Книжная Библиотека)

### Таблицы:
- **`books`** (Главная сущность): `id` (uuid, PK), `title`, `slug` (UNIQUE), `author`, `year`, `description`, `keywords` (_text), `age_group`, `reading_time`, `is_published` (bool), `created_at`. [CONFIRMED]
- **`categories`**: `id` (uuid, PK), `name`, `slug` (UNIQUE), `icon`, `sort_order`, `is_published`, `translations` (jsonb). [CONFIRMED]
- **`book_categories`** (Связывающая таблица N:M): `book_id` (FK ➔ `books.id`), `category_id` (FK ➔ `categories.id`). [CONFIRMED]
- **`explanation_modes`**: Справочник 8 режимов разборов (`slug`, `name`, `description`). [CONFIRMED]
- **`book_explanations`**: `id` (uuid, PK), `book_id` (FK), `mode_id` (FK), `is_published` (bool), `slides` (jsonb). [CONFIRMED]
- **`book_tests`**: `id` (uuid, PK), `book_id` (FK), `title`, `description`, `quiz` (jsonb), `is_published` (bool). [CONFIRMED]

- **Канонический оригинал**: Таблицы `books`, `book_explanations`, `book_tests`. [CONFIRMED]
- **Статус публикации**: `is_published` (boolean) в каждой таблице. [CONFIRMED]
- **Переводимая структура**: `content_translations` (`content_type = 'book'`), содержащая локализованные `title`, `author`, `description`, `categories`, `sections` (слайды разборов) и `tests` (вопросы и ответы). [CONFIRMED]

---

## 3. Домен Cats (Коты объясняют)

### Таблицы:
- **`cat_presets`**: `id` (uuid, PK), `legacy_id`, `base_key`, `kind` (enum: `full`, `text`), `lang` (`'ru'`), `prompt`, `category`, `is_active` (bool). [CONFIRMED]
- **`cat_preset_slides`**: `id` (uuid, PK), `preset_id` (FK ➔ `cat_presets.id`), `slide_order` (int), `text`, `media_url`, `media_type` (enum: `gif`, `video`). [CONFIRMED]

- **Переводимая структура**: `content_translations` (`content_type = 'cat_preset'`), содержащая JSONB с `prompt`, `category` и массивом `slides` (`[{ text, order }]`). [CONFIRMED]

---

## 4. Домен Parrot (Музыкальный Попугай)

### Таблицы:
- **`parrot_music_styles`**: `id` (uuid, PK), `slug` (UNIQUE), `title`, `description`, `search_artist`, `search_genre`, `is_active`. [CONFIRMED]
- **`parrot_music_style_presets`**: `id`, `style_id` (FK), `preset_key`, `title`, `default_on`. [CONFIRMED]
- **`parrot_music_style_variants`**: `id`, `preset_id` (FK), `variant_key`, `title`, `audio_url`. [CONFIRMED]
- **`parrot_music_style_slides`**: `id`, `style_id` (FK), `slide_order`, `text`, `media_url`, `media_type`. [CONFIRMED]

- **Переводимая структура**: `content_translations` (`content_type = 'parrot_music_style'`). [CONFIRMED]

---

## 5. Домен Recipes (Рецепты Енота)

### Таблица:
- **`recipes`**: `id` (uuid, PK), `slug` (UNIQUE), `title`, `description`, `country`, `country_target_id`, `ingredients` (jsonb), `cooking_steps` (jsonb), `raccoon_advice`, `serving_instructions`, `pinterest_status`, `is_active`. [CONFIRMED]

- **Переводимая структура**: `content_translations` (`content_type = 'recipe'`). [CONFIRMED]

---

## 6. Домен Bedtime Stories (Сказки на ночь)

### Таблицы:
- **`bedtime_stories`**: `id` (uuid, PK), `slug` (UNIQUE), `status`, `title` (jsonb), `emotional_theme` (jsonb), `full_json` (jsonb), `slides` (jsonb), `stamp_assets` (jsonb), `is_published`. [CONFIRMED]
- **`bedtime_stamp_assets`**: `id`, `name`, `path` (UNIQUE), `url`, `prompt`, `tags`. [CONFIRMED]

---

## 7. Домен Story Builder (Конструктор историй)

### Таблицы:
- **`story_templates`**: `id`, `name`, `slug` (UNIQUE), `description`, `hero_name`, `is_published`. [CONFIRMED]
- **`story_steps`**: `id`, `template_id` (FK), `step_key`, `question`, `narration`. [CONFIRMED]
- **`story_choices`**: `id`, `step_id` (FK), `text`, `short_text`. [CONFIRMED]
- **`story_fragments`**: `id`, `template_id` (FK), `choice_id` (FK), `text`. [CONFIRMED]
- **`user_story_submissions`**: `id`, `template_id` (FK), `hero_name`, `mode`, `status` (enum: `draft`, `pending`, `approved`, `rejected`), `user_input` (jsonb), `assembled_story` (jsonb). [CONFIRMED]

---

## 8. Домен Media & Assets (Медиафайлы и стикеры)

### Таблицы:
- **`sticker_assets`**: `id`, `title`, `slug`, `storage_path` (UNIQUE), `public_url`, `set_key`, `crop` (jsonb). [CONFIRMED]
- **`animated_sticker_assets`**: `id`, `title`, `slug`, `animation_url`, `storage_path` (UNIQUE). [CONFIRMED]
- **`artworks`**: `id`, `title`, `artist`, `description`, `category_slug`, `tags`, `image_url` (jsonb). [CONFIRMED]
- **`lessons`**: `id`, `slug`, `title`, `category`, `steps` (jsonb), `preview`. [CONFIRMED]

---

## 9. Домен Publication (Расписание публикаций)

### Таблица:
- **`publication_schedule_items`**: `id`, `slot_key`, `content_type`, `content_id`, `publish_at`, `status` (enum: `draft`, `scheduled`, `published`, `skipped`), `metadata` (jsonb). [CONFIRMED]

---

## 10. Домен Analytics (Аналитика)

### Таблицы:
- **`analytics_events`**: `id`, `event_name`, `entity_type`, `entity_id`, `entity_title`, `lang`, `visitor_id`, `session_id`, `metadata` (jsonb). [CONFIRMED]
- **`analytics_daily_summary`**: Суточные агрегированные данные просмотров и активности. [CONFIRMED]

---

## 11. Домен Translations (Переводы)

### Таблицы:
- **`content_translations`**: Единое хранилище локализаций.
  - *Колонки*: `id` (uuid, PK), `content_type` (text), `content_id` (text), `language` (text), `source_hash` (text), `translation` (jsonb), `created_at`, `updated_at`. [CONFIRMED]
- **`translation_runs`**: Журнал автоматических сессий перевода (`status`, `started_at`, `finished_at`). [CONFIRMED]
