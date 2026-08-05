# Стандарт Проектирования, Пайплайна и Валидации AI-Навыков (Skills Framework)

> **СТАТУС ДОКУМЕНТА**: `POLICY`

---

## 1. Каркас Стандартов AI-Навыков (Skills Framework)

Разработка и эксплуатация специализированных AI-навыков платформы «Сказки Капибары» опирается на четыре основополагающих документа: [`POLICY`]

1. 📜 **Контракт Навыка (Skill Contract)**: [`skill-validation-standard.md#5-контракт-навыка-skill-contract`](skill-validation-standard.md#5-контракт-навыка-skill-contract)  
   *Неизменяемый спецификационный слой между Specification и SKILL.md* (`Input`, `Output Lifecycle`, `Stop Conditions`, `Allowed/Forbidden Tools`, `Pipeline`).
2. ⚙️ **Стандарт Конвейера Ответственности**: [`skill-pipeline-standard.md`](skill-pipeline-standard.md)  
   *Определяет 10-этапную архитектуру работы навыка* (`Metadata Lock` ➔ `Context` ➔ `Research Dossier` ➔ `Story Outline` ➔ `Creator` ➔ `Domain Review` ➔ `Fact Review` ➔ `Audience Review` ➔ `Definition of Done` ➔ `Candidate for Review`).
3. 🛡️ **Стандарт Валидации, Пилотирования и Допуска**: [`skill-validation-standard.md`](skill-validation-standard.md)  
   *Определяет 8 основных статусов, боковые состояния (`FAILED_VALIDATION`/`SUSPENDED`/`DEPRECATED`/`ARCHIVED`), Таблицу возможностей (Capability Matrix), 9 шлюзов контроля (Gates 0–8), артефакт owner-decision.md, жизненный цикл Mutation Grant, регрессионную матрицу и процедуру списания (Skill Retirement)*.
4. 📋 **Шаблон Паспорта Навыка**: [`skill-passport-template.md`](skill-passport-template.md)  
   *Определяет структуру метаданных, целей, не-целей, входов, выходов, допусков и лимитов навыка*.

---

## 2. Официальный Жизненный Цикл Навыка

```text
[IDEA] ➔ [RESEARCH] ➔ [SPECIFICATION] ➔ [IMPLEMENTED] ➔ [VALIDATION] ──(PASS Gate 5)──► [PILOT] ➔ [LIMITED] ➔ [PRODUCTION_READY]
   │            │               │               │              │                           │         │                 │
   │            │               │               │              ├─► [FAILED_VALIDATION]     │         │                 │
   └────────────┴───────────────┴───────────────┴──────────────┴───────────────────────────┴─────────┴─────────────────┴──► [SUSPENDED]
   │                                                                                                                             │
   └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴──► [DEPRECATED] ➔ [ARCHIVED]
```

Каждый статус накладывает жесткие ограничения на разрешенные действия ([`skill-validation-standard.md#3-таблица-матрицы-возможностей-capability-matrix`](skill-validation-standard.md#3-таблица-матрицы-возможностей-capability-matrix)). Наличие файла `validation-record.md` является **обязательным условием существования реализованного навыка**. [`POLICY`]

---

## 3. Трехэтапный Жизненный Цикл Контента Вывода

```text
[Draft] ──(DoD Quality Gate PASS)──► [Candidate for Review] ──(Human Review & Import)──► [Approved]
```

---

## 4. Реестр Навыков Системы

1. **`Map Content Writer`** (Первая реализация стандарта):
   - **Lifecycle Status**: `SPECIFICATION`
   - **Content Capability**: `UNTESTED`
   - **Mutation Capability**: `NO_WRITE`
   - **Mutation Grant Scope**: `Not applicable`
   - **Документация**: [`map-content-writer/README.md`](map-content-writer/README.md).
2. **`Multi-language Translator`**: Локализация на EN/HE по `source_hash`. [`DESIGN`]
3. **`Map Slide Image Curator`**: Поиск медиафайлов с заполнением `image_credit_line`. [`DESIGN`]
4. **`Book Database Editor`**: Наполнение разборов книг и викторин. [`DESIGN`]
5. **`Database Auditor`**: Автоматический поиск некомплектных объектов. [`DESIGN`]
