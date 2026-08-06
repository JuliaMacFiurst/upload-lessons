# Архитектура AI Operating System (AI OS v2.0.0)

> **СТАТУС ДОКУМЕНТА**: `POLICY` / `DESIGN`  
> **СВЯЗАННЫЕ ДОКУМЕНТЫ**: [`../PROJECT_MANIFEST.md`](../PROJECT_MANIFEST.md), [`../../.agents/AGENTS.md`](../../.agents/AGENTS.md), [`../../.agents/registry.json`](../../.agents/registry.json)

---

## 1. Назначение и Архитектурная Роль

**LapLapLa AI Operating System (AI OS)** является единым Decoupled-фундаментом и операционной системой для всех AI-фабрик и Workspace Skills репозитория.

Вместо изолированных скриптов или уникальных реализаций для каждого навыка, AI OS предоставляет:
- **Единый Реестр Навыков (`.agents/registry.json`)**
- **Независимый AI Router (`AGENTS.md`)**
- **Универсальный Конвейер Ответственности (`lib/server/ai/pipeline/`)**
- **Универсальный Движок Очередей (`lib/server/ai/queue/queueEngine.ts`)**
- **Общие Модули Качества и Безопасности (`lib/server/ai/`)**
- **Детерминированный Оценщик Уверенности (Confidence Score Engine)**
- **Единый Диспетчер Производственных Команд**

---

## 2. Сквозной Продуктовый Конвейер (End-to-End Pipeline)

Каждая задача в системе проходит единую 11-звенную цепочку:

```text
[1. User Command] ➔ [2. Router] ➔ [3. Skill] ➔ [4. Queue] ➔ [5. Research] ➔ [6. Generation] ➔ [7. Quality] ➔ [8. Confidence] ➔ [9. Candidate] ➔ [10. Review] ➔ [11. Pre-Write Guard] ➔ [Database]
```

1. **`User Command`**: Короткая текстовая команда пользователя (*«Заполни сегодня 50 карт»*).
2. **`Router`**: Распознавание намерения по [`.agents/registry.json`](../../.agents/registry.json) без сканирования файловой системы.
3. **`Skill`**: Передача управления в соответствующий `SKILL.md` и считывание `validation-record.md`.
4. **`Queue`**: Инициализация `QueueBatchJob` с локальным чекпоинтом (`.agents/jobs/`).
5. **`Research`**: Формирование `VerifiedFactsDossier` по иерархии источников.
6. **`Generation`**: Авторское написание контента согласно спецификации типа.
7. **`Quality`**: Выполнение ворот контроля, DoD и `validateRussianLanguagePurity()` (`STOP-LANG-01`).
8. **`Confidence`**: Расчёт бала уверенности ($CS = S_{\text{fact}} \times S_{\text{lang}} \times S_{\text{dod}} \times S_{\text{retry}}$).
9. **`Candidate`**: Формирование `Candidate for Review JSON` для ручной проверки.
10. **`Review`**: Вычитывание человеком-редактором.
11. **`Pre-Write Guard`**: Повторная автоматическая валидация `validatePreWriteStoryContent()` перед записью.

---

## 3. Модель Детерминированной Оценки Уверенности (Confidence Score Engine)

Базовый балл уверенности ($CS$) рассчитывается по формуле:

$$CS = S_{\text{fact}} \times S_{\text{lang}} \times S_{\text{dod}} \times S_{\text{retry}}$$

### Шкала Бандов Уверенности:
- **95% – 100% (HIGH)**: Высокая уверенность (допущен к автоматизированной проверке).
- **85% – 94% (MEDIUM)**: Средняя уверенность (требует стандартной проверки редактором).
- **< 85% (LOW)**: Низкая уверенность (помечен для углубленной ручной инспекции).
- **0% (REJECTED)**: Отбракован (сработало стоп-условие).

---

## 4. Масштабируемость и Добавление Новых Фабрик (Plugin Model)

Добавление новой AI-фабрики (например, `Translator`, `Book Builder`, `Image Curator`, `Voice Generator`) **НЕ ТРЕБУЕТ изменения Router или инфраструктуры**.

Для добавления нового навыка требуется ровно 3 действия:
1. Зарегистрировать навык в [`.agents/registry.json`](../../.agents/registry.json).
2. Создать исполняемый файл `.agents/skills/<skill-id>/SKILL.md`.
3. Оформить комплект нормативной документации в `AI-DOCS/skills/<skill-id>/`.
