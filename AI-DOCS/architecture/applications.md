# Архитектура Приложений и Границы Ответственности

> **СТАТУС ДОКУМЕНТА**: `IMPLEMENTATION` / `POLICY`

---

## 1. Обзор приложений

Экосистема разделена на два приложения, работающие с общей базой данных Supabase: [`IMPLEMENTATION`]

1. **`upload-lessons`** (CMS и Административный пайплайн):
   - Управление контентом, AI-генерация, нарезка слайдов, подбор иллюстраций, вычисление хэшей и перевод. [`IMPLEMENTATION`]
   - Эндпоинты: `/api/admin/map-story`, `/api/admin/map-story-slides/save`, `/api/admin/translation/translate-one` и др. [`IMPLEMENTATION`]
2. **`capybara_tales`** (Runtime и Пользовательский интерфейс):
   - Интерактивный интерфейс для детей, рендеринг SVG-карт, читальный зал книг, игры и отображение переведенного контента. [`IMPLEMENTATION`]
   - Эндпоинт загрузки карточки карты: `/api/map-popup-content`. [`IMPLEMENTATION`]

---

## 2. Разделение по категориям доказательности

### A. Runtime (Пользовательский слой выполнения)
- **Что делает текущий код Runtime (`IMPLEMENTATION`)**:
  - При клике по карте получает `path.id` и вызывает API `getMapPopupContent.ts`. [`IMPLEMENTATION`]
  - Не проверяет валидность `source_hash` при выдаче перевода из `content_translations`. [`IMPLEMENTATION`]
  - Не проверяет флаг `is_approved` при прямой загрузке истории по `target_id`. [`IMPLEMENTATION`]
  - Выполняет нестрогий `ILIKE` fallback при отсутствии точного совпадения `target_id`. [`IMPLEMENTATION`]
- **Что ДОЛЖНА делать система (`POLICY` / `DESIGN`)**:
  - Позывать в публичном интерфейсе только проверенный контент (`is_approved = true`). [`POLICY`]
  - Отображать только актуальные переводы, совпадающие по `source_hash`. [`DESIGN`]
  - Использовать строгое посимвольное совпадение `target_id`. [`POLICY`]

---

### B. Admin Pipeline (Административный пайплайн)
- **Что делает текущий код Admin Pipeline (`IMPLEMENTATION`)**:
  - `saveStoryContent` выполняет очистку текста через `sanitizeMapStoryContent`. [`IMPLEMENTATION`]
  - Сохраняет русскую историю в `map_stories` с `language = 'ru'`. [`IMPLEMENTATION`]
  - При ручном перепарсинге удаляет все прошлые записи в `map_story_slides` по `story_id` и заново вставляет слайды. [`IMPLEMENTATION`]
- **Правила администрирования (`POLICY`)**:
  - Любые массовые изменения должны выводиться пользователю в формате draft/JSON перед сохранением. [`POLICY`]
  - Автоматически сгенерированный контент всегда получает `is_approved = false`. [`POLICY`]
