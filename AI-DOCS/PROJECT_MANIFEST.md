# PROJECT MANIFEST: Манифест Проекта «Сказки Капибары»

> **СТАТУС**: `POLICY`  
> **ОБЯЗАТЕЛЬНЫЙ КОНТЕКСТ**: Данный документ — главный входной индекс и защитный регламент для всех AI-агентов. Перед выполнением любой задачи агент обязан прочитать данный файл.

---

## 1. Карта Репозитория и Навигация (Repository Map)

Манифест является **маршрутизатором**. Подробные описания вынесены в специализированные документы:

- 🤖 **Единый Диспетчер AI-ОС**: [`.agents/AGENTS.md`](.agents/AGENTS.md) — единственный входной роутер для любого нового AI-агента (`POLICY`).
- 🧭 **Реестр Навыков AI-ОС**: [`.agents/registry.json`](.agents/registry.json) — центральный реестр зарегистрированных AI-навыков (`POLICY`).
- 🏗️ **Архитектура AI OS v2.0.0**: [`architecture/ai-operating-system.md`](architecture/ai-operating-system.md) — универсальная платформа AI-фабрик (`DESIGN`).
- 📦 **Каталог Общих AI Модулей**: [`architecture/shared-modules.md`](architecture/shared-modules.md) — общие сервисы безопасности и качества (`DESIGN`).
- 📖 **Глоссарий терминов**: [`glossary.md`](glossary.md) — точные определения базовых понятий (`POLICY`).
- ⚖️ **Стандарт доказательности**: [`evidence-levels.md`](evidence-levels.md) — категории `STATE`, `IMPLEMENTATION`, `POLICY`, `DESIGN`, `OPEN`.
- ⚙️ **Приложения и Потоки**: [`architecture/applications.md`](architecture/applications.md) — границы `upload-lessons` и `capybara_tales`.
- 🗄️ **Домены данных**: [`architecture/data-domains.md`](architecture/data-domains.md) — 11 доменов данных и таблицы СУБД.
- 🔄 **Жизненный цикл контента**: [`architecture/content-lifecycle.md`](architecture/content-lifecycle.md) — этапы от создания до публикации.
- 🎯 **Матрица источников истины**: [`architecture/source-of-truth.md`](architecture/source-of-truth.md) — происхождение и реестры данных.
- 🛡️ **Каталог Инвариантов**: [`safety/invariants.md`](safety/invariants.md) — критические правила системы.
- 🛢️ **Политика работы с СУБД**: [`safety/database-policy.md`](safety/database-policy.md) — регламент Read-Only и Admin API.
- 🔌 **Политика использования MCP**: [`safety/mcp-policy.md`](safety/mcp-policy.md) — доступ к Supabase, DevTools и GitHub MCP.
- 🌐 **Языковая политика**: [`editorial/languages.md`](editorial/languages.md) — архитектура локализаций EN/HE.
- 📸 **Атрибуция Медиа**: [`editorial/media-attribution.md`](editorial/media-attribution.md) — правила подписи авторства и лицензий.
- 📝 **Качество контента**: [`editorial/content-quality.md`](editorial/content-quality.md) — стандарты фактологии и стиля.
- 🛠️ **Стандарт AI-Навыков**: [`skills/README.md`](skills/README.md) — разработка и паспорта навыков.
- 📊 **Результаты аудита**: [`research/confirmed-findings.md`](research/confirmed-findings.md) — снимки состояния на момент аудита.
- ❓ **Открытые вопросы**: [`research/open-questions.md`](research/open-questions.md) — нерешенные продуктовые задачи.
- 📜 **Журнал решений (ADR)**: [`research/decision-log.md`](research/decision-log.md) — исторические архитектурные решения.

---

## 2. Классификация Достоверности (Truth Classification)

Во всей системе `AI-DOCS` используется строгий стандарт классификации информации ([`evidence-levels.md`](evidence-levels.md)):

1. **`STATE`** — Подтверждённый снимок продуктивной среды на дату. *(Не вечная истина! Снимки хранятся в [`research/confirmed-findings.md`](research/confirmed-findings.md))*.
2. **`IMPLEMENTATION`** — Описание поведения существующего кода.
3. **`POLICY`** — Обязательные правила и регламенты проекта.
4. **`DESIGN`** — Целевая спроектированная архитектура (ещё не реализованная в коде).
5. **`OPEN`** — Нерешённые и неподтверждённые вопросы.

---

## 3. Регламент Расхождений (Discrepancy Rule)

> 🚨 **КРИТИЧЕСКИЙ РЕГЛАМЕНТ ДЛЯ AI-АГЕНТОВ**:
> **Если код приложения или база данных противоречат документации `AI-DOCS`, агент НЕ ИМЕЕТ ПРАВА молча выбирать одну из версий!** [`POLICY`]
> 
> В случае обнаружения расхождения агент **ОБЯЗАН**:
> 1. **Остановить** выполнение задачи. [`POLICY`]
> 2. **Сообщить пользователю** о найденном расхождении с указанием файлов и строк. [`POLICY`]
> 3. **Не продолжать работу**, пока расхождение не будет явным образом разрешено пользователем. [`POLICY`]

---

## 4. Главные Защитные Ограничения (Guardrails)

### 🚨 1. Неизменяемость `target_id`
Поле `map_targets.target_id` является **точным внешним ключом к ID слоя (`path[id]`) векторной SVG-карты**. [`POLICY`]

**КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО**:
- Переводить `target_id`. [`POLICY`]
- Изменять регистр букв. [`POLICY`]
- Нормализовать или преобразовывать в slug. [`POLICY`]
- Удалять или заменять пробелы, дефисы, тире, апострофы и Unicode-символы. [`POLICY`]
- Удалять диакритические знаки. [`POLICY`]
- Восстанавливать `target_id` из полей `title_ru`, `title_en` или `title_he`. [`POLICY`]

`target_id` всегда копируется из `map_targets` **посимвольно**. [`POLICY`]

---

### 🚨 2. Канонический язык RU
Русский язык (`ru`) — единственный канонический исходный язык истории. Все переводы на английский и иврит сохраняются в `content_translations` и привязаны к `source_hash`. [`POLICY`]

---

### 🚨 3. Read-Only СУБД по умолчанию
Прямые модифицирующие SQL-запросы (`INSERT`, `UPDATE`, `DELETE`, DDL) в production-базе запрещены. Запись производится исключительно через Admin API панели `upload-lessons` после согласования draft/JSON с пользователем. [`POLICY`]

---

## 5. Обязательный Чек-Лист перед операцией

- [ ] Прочитан ли данный `PROJECT_MANIFEST.md`?
- [ ] Определены ли используемые категории доказательности (`STATE`, `IMPLEMENTATION`, `POLICY`, `DESIGN`, `OPEN`)?
- [ ] Проверено ли посимвольное совпадение `target_id` без исправлений?
- [ ] Будет ли создан draft/JSON перед внесением изменений через Admin API?
