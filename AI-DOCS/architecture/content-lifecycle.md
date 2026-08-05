# Жизненный Цикл Контента (Content Lifecycle)

> **СТАТУС ДОКУМЕНТА**: `CONFIRMED` / `POLICY`

---

## 1. Жизненный цикл историй карт (Map Story Lifecycle)

```text
[1. Импорт SVG] ➔ [2. RU map_story] ➔ [3. Редакторский Review] ➔ [4. Нарезка RU slides] ➔ [5. Курация Медиа] ➔ [6. EN/HE Translation] ➔ [7. Runtime]
```

### Подтверждённые этапы:

1. **Создание географической цели (Автоматический / Ручной импорт)**:
   - *Файл*: `lib/server/mapTargets/importMapTargets.ts` [CONFIRMED]
   - Скрипт скачивает SVG из хранилища, извлекает `path[id]` и заносит запись в `map_targets(map_type, target_id)`.

2. **Создание русской истории (Автоматический / Ручной этап)**:
   - *Файлы*: `pages/api/admin/map-story.ts`, `lib/server/mapTargets/storyAutomation.ts` [CONFIRMED]
   - Автор вручную вставляет JSON на странице `/admin/map-targets` или вызывает AI-генерацию (`generate-batch`).
   - Функция `sanitizeMapStoryContent` очищает текст от лишних символов.
   - Запись сохраняется в `map_stories` (`language = 'ru'`). При AI-генерации выставляется `auto_generated = true` и `is_approved = false`.

3. **Редакторская проверка (Проверка)**:
   - *Файл*: `components/admin/maps/MapTargetEditorPage.tsx` [CONFIRMED]
   - Редактор читает текст, исправляет факты и нажимает «Сохранить», что переводит историю в статус `is_approved = true`.

4. **Парсинг на слайды (Автоматический / Ручной этап)**:
   - *Файл*: `pages/api/admin/map-story-slides/save.ts` [CONFIRMED]
   - Текст истории нарезается на предложения. Удаляются прошлые записи в `map_story_slides` для данной истории и создаются новые строки с порядковыми номерами `slide_order`.

5. **Курация медиафайлов (Ручной / Полуавтоматический этап)**:
   - *Файлы*: `lib/server/media/resolveMedia.ts`, `components/admin/maps/MediaPickerModal.tsx` [CONFIRMED]
   - Для каждого слайда ищется иллюстрация в Wikimedia, Pexels или Giphy.
   - Заполняются колонки `image_url` и `image_credit_line`. Для карт типа `flag` первый слайд намертво привязывается к векторному флагу.

6. **Локализация на EN и HE (Автоматический / Ручной этап)**:
   - *Файлы*: `lib/server/translation-runner.ts`, `pages/api/admin/translation/translate-one.ts` [CONFIRMED]
   - Переводчик запрашивает перевод текста на EN/HE через Gemini или вставляет готовый JSON.
   - Сервер рассчитывает `source_hash` (SHA-256 от канонического русского текста) и сохраняет запись в `content_translations` (`content_type = 'map_story'`, `content_id = map_stories.id`).

7. **Клиентский показ и Fallback (Runtime)**:
   - *Файл*: `lib/server/mapPopup/getMapPopupContent.ts` в клиентском приложении [CONFIRMED]
   - Если пользователь запрашивает историю на иврите, приложение ищет запись в `content_translations`. При ее отсутствии берется русский текст из `map_stories`.

---

### ⚠️ Точки возможного рассинхрона данных карт (Desync Risks):

1. **Рассинхрон `map_stories` и `map_story_slides`**:
   - При повторном сохранении текста `map_stories.content` через bulk JSON, старые слайды в `map_story_slides` **не обновляются автоматически**.
2. **Рассинхрон `source_hash` и `content_translations`**:
   - Изменение даже одной буквы в `map_stories.content` делает существующий перевод в `content_translations` устаревшим.
3. **Рассинхрон индексов предложений и картинок**:
   - Если при переводе количество предложений на английском отличается от русского оригинального набора, сопоставление иллюстраций по `slide_order` смещается.

---

## 2. Жизненный цикл книг (`books`)

```text
[Ввод книги в books] ➔ [Привязка категорий] ➔ [Создание 8 режимов разбора] ➔ [Создание викторины] ➔ [Перевод в content_translations]
```
- **Автоматические этапы**: Автоматическая генерация разборов и вопросов тестов через Gemini API (`lib/server/books/`). [CONFIRMED]
- **Точка рассинхрона**: Редактирование русской книги без перезапуска перевода оставляет EN/HE версии со старыми вопросами викторины. [CONFIRMED]

---

## 3. Жизненный цикл Кошачьих карточек (`cat_presets`)

```text
[Создание cat_presets] ➔ [Заполнение cat_preset_slides] ➔ [Генерация медиа/GIF] ➔ [Перевод слайдов в content_translations]
```
- В отличие от карт, структура `content_translations` для `cat_preset` хранит массив переведенных слайдов (`translation.slides[]`). [CONFIRMED]

---

## 4. Жизненный цикл Рецептов Енота (`recipes`)

```text
[Создание рецепта] ➔ [Привязка country_target_id] ➔ [Генерация шагов] ➔ [Экспорт в Pinterest] ➔ [Перевод]
```
- **Специфика**: Таблица `recipes` содержит поле `pinterest_status` (статусы: `draft`, `exported`, `scheduled`, `uploaded`, `published`) и JSONB-полигон макета `layout_json`. [CONFIRMED]
