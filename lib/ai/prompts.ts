import type { StoryRoleKey } from "../books/types";

export const SYSTEM_PROMPT = `
Ты работаешь внутри CMS детской библиотеки.
Твоя задача — помогать наполнять базу знаний о книгах для детей.
Пиши только на русском языке.
Пиши как добрый рассказчик для детей.
Используй простой, тёплый, понятный язык.
Пиши короткими предложениями.
Текст должен быть ясным, интересным и лёгким для чтения.
Не используй академический стиль.
Никогда не добавляй насилие, хоррор, жестокость, взрослые темы или непристойные детали.
Возвращай только валидный JSON.
Не используй markdown.
Не добавляй пояснения вне JSON.
`.trim();

export const PLOT_PROMPT = "Коротко и точно объясни реальный сюжет книги для ребёнка.";
export const CHARACTERS_PROMPT = "Объясни, кто главные персонажи книги и чем они важны.";
export const MAIN_IDEA_PROMPT = "Объясни главную идею книги простыми словами.";
export const PHILOSOPHY_PROMPT = "Объясни мягко и понятно, о чём книга заставляет задуматься.";
export const CONFLICTS_PROMPT = "Объясни основные конфликты книги простым детским языком.";
export const AUTHOR_MESSAGE_PROMPT = "Объясни, что хотел сказать автор.";
export const ENDING_PROMPT = "Объясни смысл финала без спойлерных фантазий и выдумок.";
export const SUMMARY_PROMPT = "Очень коротко перескажи книгу для ребёнка.";
export const TEST_PROMPT = "Сделай понятный детский тест по реальной книге.";
export const STORY_PROMPT = "Сделай добрую, весёлую и безопасную интерактивную историю для детей с оригинальным героем.";
export const BATCH_BOOK_PLAN_PROMPT = "Подбери известные и подходящие детям книги для автоматического наполнения CMS.";
const STORY_TEMPLATE_VARIETY_PROMPT =
  "Сделай добрый, безопасный и оригинальный шаблон интерактивной истории для детей с разнообразными героями и мирами.";

const JSON_RULES = [
  "Обязательное правило: верни только валидный JSON.",
  "Если структура JSON невалидна или отличается от требуемой, ответ будет отклонён.",
  "Не добавляй markdown, комментарии, вступления или объяснения.",
  "Не добавляй пояснения вне JSON.",
];

const NON_FICTION_RULES = [
  "Описывай реальную книгу.",
  "Не придумывай новые события, персонажей или детали.",
  "Не меняй оригинальный сюжет.",
  "Можно упрощать формулировки, но нельзя искажать содержание книги.",
];

const CHILD_STYLE_RULES = [
  "Пиши для детей.",
  "Тон — добрый рассказчик объясняет историю детям.",
  "Используй короткие предложения.",
  "Слова должны быть простыми и понятными.",
  "Текст должен быть живым и дружелюбным.",
];

const STORY_SAFETY_RULES = [
  "Можно использовать воображение.",
  "История должна быть весёлой, доброй и безопасной.",
  "Избегай насилия, страха, мрака, жестокости и взрослых тем.",
];

const BOOK_SECTION_PROMPTS: Record<string, string> = {
  plot: PLOT_PROMPT,
  characters: CHARACTERS_PROMPT,
  main_idea: MAIN_IDEA_PROMPT,
  philosophy: PHILOSOPHY_PROMPT,
  conflicts: CONFLICTS_PROMPT,
  author_message: AUTHOR_MESSAGE_PROMPT,
  ending_meaning: ENDING_PROMPT,
  twenty_seconds: SUMMARY_PROMPT,
};

const STORY_ROLE_DESCRIPTIONS: Record<StoryRoleKey, string> = {
  intro: "Начни историю: знакомство, находка или приглашение к приключению.",
  journey: "Продолжи историю: путь, исследование или движение к цели.",
  problem: "Покажи препятствие: трудность, помеху или неожиданную проблему.",
  solution: "Разреши проблему: умное, доброе или смешное решение.",
  ending: "Заверши историю: счастливый итог, вывод или тёплый финал.",
};

function joinPrompt(lines: string[]) {
  return lines.join("\n");
}

function formatField(key: string, value: string) {
  return `"${key}":${value}`;
}

function formatObject(fields: string[]) {
  return `{${fields.join(",")}}`;
}

function formatArray(value: string) {
  return `[${value}]`;
}

const CANONICAL_SLIDE_FORMAT = formatObject([
  formatField("text", '"..."'),
]);

const CANONICAL_EXPLANATION_SECTION_FORMAT = formatObject([
  formatField("slides", formatArray(CANONICAL_SLIDE_FORMAT)),
]);

const CANONICAL_QUIZ_QUESTION_FORMAT = formatObject([
  formatField("question", '"..."'),
  formatField("options", formatArray('"..."')),
  formatField("correctAnswerIndex", "0"),
]);

const CANONICAL_QUIZ_FORMAT = formatObject([
  formatField("title", '"..."'),
  formatField("description", '"..."'),
  formatField("quiz", formatArray(CANONICAL_QUIZ_QUESTION_FORMAT)),
]);

const CANONICAL_STORY_TEXT_FORMAT = formatObject([
  formatField("text", '"..."'),
  formatField("keywords", formatArray('"..."')),
]);

const CANONICAL_STORY_TEMPLATE_FORMAT = formatObject([
  formatField("title", '"..."'),
  formatField(
    "steps",
    formatArray(
      formatObject([
        formatField("step_key", '"intro"'),
        formatField("question", '"..."'),
        formatField(
          "choices",
          formatArray(
            formatObject([
              formatField("text", '"..."'),
              formatField("keywords", formatArray('"..."')),
            ]),
          ),
        ),
      ]),
    ),
  ),
  formatField(
    "fragments",
    formatArray(
      formatObject([
        formatField("step_key", '"intro"'),
        formatField("choice_index", "0"),
        formatField("text", '"..."'),
        formatField("keywords", formatArray('"..."')),
      ]),
    ),
  ),
  formatField("twists", formatArray(CANONICAL_STORY_TEXT_FORMAT)),
]);

const CANONICAL_FULL_BOOK_FORMAT = formatObject([
  formatField("description", '"..."'),
  formatField("keywords", formatArray('"..."')),
  formatField("plot", CANONICAL_EXPLANATION_SECTION_FORMAT),
  formatField("characters", CANONICAL_EXPLANATION_SECTION_FORMAT),
  formatField("main_idea", CANONICAL_EXPLANATION_SECTION_FORMAT),
  formatField("philosophy", CANONICAL_EXPLANATION_SECTION_FORMAT),
  formatField("conflicts", CANONICAL_EXPLANATION_SECTION_FORMAT),
  formatField("author_message", CANONICAL_EXPLANATION_SECTION_FORMAT),
  formatField("ending_meaning", CANONICAL_EXPLANATION_SECTION_FORMAT),
  formatField("twenty_seconds", CANONICAL_EXPLANATION_SECTION_FORMAT),
  formatField("test", CANONICAL_QUIZ_FORMAT),
]);

export function buildExplanationPrompt(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  mode: string;
}) {
  return joinPrompt([
    SYSTEM_PROMPT,
    "Задача: сгенерируй один раздел объяснения книги для детской библиотеки.",
    ...JSON_RULES,
    ...CHILD_STYLE_RULES,
    ...NON_FICTION_RULES,
    BOOK_SECTION_PROMPTS[input.mode] ?? `Объясни раздел ${input.mode} простым языком.`,
    `Формат ответа: ${CANONICAL_EXPLANATION_SECTION_FORMAT}`,
    "Требования к ответу:",
    "- 3-4 слайда.",
    "- Каждый слайд — одно короткое предложение.",
    "- Каждый слайд должен относиться только к нужному разделу.",
    "- Каждый слайд MUST быть объектом с полем text.",
    "- slides MUST быть массивом объектов вида {\"text\":\"...\"}.",
    "- Не возвращай массив строк.",
    "- Не вкладывай в slides другие объекты кроме {\"text\":\"...\"}.",
    "- Не пиши нумерацию.",
    "- Если формат отличается, ответ считается неверным.",
    "",
    `Название книги: ${input.title}`,
    `Автор: ${input.author ?? "Не указан"}`,
    `Описание книги: ${input.description ?? "Описание отсутствует."}`,
    `Раздел: ${input.mode}`,
  ]);
}

export function buildFullExplanationPrompt(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  modes: Array<{ slug: string; name: string }>;
}) {
  return joinPrompt([
    SYSTEM_PROMPT,
    "Задача: сгенерируй сразу несколько разделов объяснения книги для детской библиотеки.",
    ...JSON_RULES,
    ...CHILD_STYLE_RULES,
    ...NON_FICTION_RULES,
    `Формат ответа: ${formatObject([
      formatField(
        "items",
        formatArray(
          formatObject([
            formatField("mode", '"plot"'),
            formatField("slides", formatArray(CANONICAL_SLIDE_FORMAT)),
          ]),
        ),
      ),
    ])}`,
    "Требования к ответу:",
    "- Генерируй только перечисленные разделы.",
    "- Для каждого раздела сделай 3-4 коротких слайда.",
    "- mode должен точно совпадать со slug раздела.",
    "- Каждый слайд MUST быть объектом с полем text.",
    "- Не возвращай массив строк вместо slides.",
    "- Если формат отличается, ответ считается неверным.",
    "",
    `Название книги: ${input.title}`,
    `Автор: ${input.author ?? "Не указан"}`,
    `Описание книги: ${input.description ?? "Описание отсутствует."}`,
    `Нужные разделы: ${input.modes.map((mode) => `${mode.slug} (${mode.name})`).join(", ")}`,
  ]);
}

export function buildTestPrompt(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  ageGroup?: string | null;
}) {
  return joinPrompt([
    SYSTEM_PROMPT,
    "Задача: сгенерируй тест по реальной книге для ребёнка.",
    ...JSON_RULES,
    ...CHILD_STYLE_RULES,
    ...NON_FICTION_RULES,
    TEST_PROMPT,
    `Формат ответа: ${CANONICAL_QUIZ_FORMAT}`,
    "Требования к ответу:",
    "- 5 вопросов.",
    "- В каждом вопросе 3 или 4 варианта ответа.",
    "- correctAnswerIndex должен указывать на один правильный ответ.",
    "- correctAnswerIndex MUST совпадать с индексом правильного элемента в options.",
    "- Вопросы должны проверять понимание реальной книги, а не выдуманных деталей.",
    "- НЕ используй answers[].",
    "- НЕ используй questions[] на верхнем уровне.",
    "- НЕ пропускай correctAnswerIndex.",
    "- Каждый вопрос MUST иметь поля question, options, correctAnswerIndex.",
    "- options MUST быть массивом строк.",
    "- Если структура отличается, ответ считается неверным.",
    "",
    `Название книги: ${input.title}`,
    `Автор: ${input.author ?? "Не указан"}`,
    `Описание книги: ${input.description ?? "Описание отсутствует."}`,
    `Возраст: ${input.ageGroup ?? "Не указан"}`,
  ]);
}

export function buildStoryPartPrompt(input: {
  title: string;
  description?: string | null;
  ageGroup?: string | null;
  templateName?: string | null;
  kind: "step" | "choice" | "fragment" | "twist";
  storyRole?: StoryRoleKey;
  previousRole?: StoryRoleKey | null;
  context?: string;
}) {
  const storyRole = input.storyRole ?? "intro";
  const previousRole = input.previousRole ?? null;

  return joinPrompt([
    "You are generating structured JSON for an interactive children’s storytelling system.",
    "",
    "STRICT RULES:",
    "- Return ONLY valid JSON",
    "- No explanations, no markdown",
    "- Follow schema EXACTLY",
    "- Do not rename fields",
    "- Do not add extra fields",
    "- Do not wrap response",
    "",
    "TASK:",
    "Generate a story fragment.",
    "This generation is part of a deterministic 5-step path builder.",
    "You must continue the existing story context, not invent a disconnected scene.",
    "",
    "INPUT:",
    `kind: "${input.kind}"`,
    `storyRole: "${storyRole}"`,
    `title: "${input.title}"`,
    `context: "${input.context ?? "Без дополнительного контекста."}"`,
    "",
    "SCHEMA:",
    "",
    'IF kind = "step":',
    formatObject([
      formatField("question", '"..."'),
      formatField("step_key", '"intro"'),
    ]),
    "",
    "RULES:",
    "- question must present a meaningful choice in the story",
    "- NOT yes/no",
    "- must move the story forward",
    "- must be understandable for a child (age 6–10)",
    "- question MUST be in Russian",
    "- question MUST refer to the same main hero from the title and intro context",
    "- do not introduce any predefined hero type if the context does not mention it",
    "- do not replace the existing hero with a new character",
    `- step_key MUST be "${storyRole}"`,
    '- step_key MUST be one of: ["intro","journey","problem","solution","ending"]',
    "",
    'IF kind != "step":',
    CANONICAL_STORY_TEXT_FORMAT,
    "",
    "RULES:",
    input.kind === "choice"
      ? "- For kind \"choice\", text MUST be ONE short sentence."
      : "- text must be 2–4 sentences",
    input.kind === "choice"
      ? "- For kind \"choice\", text MUST be 5-10 words."
      : "- simple, clear, logical",
    input.kind === "choice"
      ? "- For kind \"choice\", text MUST be no longer than 120 characters."
      : "- no surreal nonsense",
    input.kind === "choice"
      ? "- For kind \"choice\", answer must be a short action of the hero, without descriptions or details."
      : "- no contradictions",
    input.kind === "choice"
      ? "- For kind \"choice\", do not write multiple sentences."
      : "- keywords MUST be an array of strings",
    input.kind === "choice"
      ? "- For kind \"choice\", do not write scene setup, background, weather, or narration."
      : "- keywords: 3–8 items",
    input.kind === "choice"
      ? "- For kind \"choice\", do not write descriptions before the action."
      : "- keywords: lowercase",
    input.kind === "choice"
      ? "- Correct examples: \"Пойдёт к старому дереву\", \"Откроет странную коробку\", \"Поговорит с незнакомцем\", \"Побежит за странным звуком\"."
      : "- keywords: no duplicates",
    input.kind === "choice"
      ? "- Incorrect examples: \"Яркое солнце грело...\", \"Она сидела и думала...\", \"Вдруг произошло что-то...\"."
      : "- keywords: no empty strings",
    input.kind === "choice"
      ? "- keywords MUST be an array of strings."
      : "",
    input.kind === "choice"
      ? "- keywords: 3–8 items."
      : "",
    input.kind === "choice"
      ? "- keywords: lowercase, no duplicates, no empty strings."
      : "",
    input.kind === "twist"
      ? "- For kind \"twist\", text MUST be short and no longer than 220 characters."
      : "- Keep the text concise and easy for a child to read.",
    input.kind === "twist"
      ? "- For kind \"twist\", create one short unexpected turn, not a full scene."
      : "- Do not turn this into a long scene or summary.",
    input.kind === "choice" && storyRole === "intro"
      ? "- For kind \"choice\" in intro, make the 3 choices differ by story direction, not wording."
      : "- Avoid near-duplicate options.",
    input.kind === "choice" && storyRole === "intro"
      ? "- Prefer one exploratory option, one playful/social option, and one unusual/curious option."
      : "- Each choice should feel meaningfully distinct.",
    input.kind === "fragment" && storyRole === "intro"
      ? "- For kind \"fragment\" in intro, add one sensory detail, mood, or memorable image."
      : "- Add one vivid but simple detail when helpful.",
    input.kind === "fragment" && storyRole === "intro"
      ? "- Do not paraphrase the choice text. Continue it naturally."
      : "- Continue the selected choice instead of repeating it.",
    "",
    "QUALITY RULES:",
    "- no empty fields",
    "- no duplicate values",
    "- no broken logic",
    "- no random absurdity",
    "- no repetition",
    "- Never assume a predefined hero type.",
    "- The hero MUST be inferred only from the template title and intro context.",
    "- The output MUST continue the previous assembled context naturally.",
    "- The output MUST fit the current step role exactly.",
    "- If the context mentions a selected choice, continue that choice directly.",
    "- The output should prepare the next step without skipping logic.",
    "",
    "SELF-CHECK BEFORE RETURN:",
    "- Is JSON valid?",
    "- Does it match schema exactly?",
    "- Are all required fields present?",
    "- Are values non-empty?",
    "- Are keywords array of strings?",
    "- Does the story make sense?",
    "- If ANY answer is NO -> FIX before returning.",
    "",
    "ADDITIONAL STORY CONTEXT:",
    `Описание: ${input.description ?? "Описание отсутствует."}`,
    `Возраст: ${input.ageGroup ?? "Не указан"}`,
    `Название шаблона: ${input.templateName ?? "Новая история"}`,
    `Описание роли: ${STORY_ROLE_DESCRIPTIONS[storyRole]}`,
    previousRole ? `Previous story role: ${previousRole.toUpperCase()}` : "Previous story role: none",
    `Next story role: ${
      storyRole === "intro"
        ? "journey"
        : storyRole === "journey"
          ? "problem"
          : storyRole === "problem"
            ? "solution"
            : storyRole === "solution"
              ? "ending"
              : "none"
    }`,
    "Context notes:",
    "- context contains the current step, previous assembled story context, selected choice if any, and the goal of the next step.",
    "- Use that context as the source of continuity.",
    "- Do not reset the story.",
    "- Do not contradict the previous assembled path.",
    "",
    "OUTPUT:",
    "Return ONLY JSON.",
  ]);
}

export function buildMissingStoryChoicesPrompt(input: {
  title: string;
  stepKey: StoryRoleKey;
  introNarration: string;
  currentStoryText: string;
  selectedPath: string;
  roleDescription: string;
  question: string;
  existingChoices: Array<{
    text: string;
    fragment?: string | null;
  }>;
  count: number;
}) {
  return joinPrompt([
    SYSTEM_PROMPT,
    "Задача: дополни уже существующий шаг истории недостающими вариантами.",
    ...JSON_RULES,
    ...CHILD_STYLE_RULES,
    ...STORY_SAFETY_RULES,
    "Ты продолжаешь уже существующую детскую историю.",
    "Нельзя генерировать новый вопрос.",
    "Нельзя менять уже существующие варианты.",
    "Нужно сгенерировать только недостающие варианты для этого шага.",
    `Нужно вернуть ровно ${input.count} новых вариантов.`,
    'Формат ответа: {"choices":[{"text":"...","fragment":"...","keywords":["..."]}]}',
    "Требования к choices:",
    "- Каждый choice должен быть коротким действием героя.",
    "- Только одна короткая фраза.",
    "- 5-10 слов.",
    "- Не длиннее 120 символов.",
    "- Без описаний, без вступления, без нескольких предложений.",
    "- Каждый новый choice должен вести историю в другую сторону и не повторять существующие варианты.",
    "Требования к fragments:",
    "- Каждый fragment должен быть одним коротким предложением.",
    "- Fragment должен развивать choice, а не повторять его.",
    "- Fragment должен сохранять тон и мир начала истории.",
    "Хорошие примеры choices:",
    "- Пойдёт к старому дереву",
    "- Откроет странную коробку",
    "- Поговорит с незнакомцем",
    "- Побежит за странным звуком",
    "Плохие примеры choices:",
    "- Яркое солнце грело дорожку",
    "- Она сидела и долго думала о странном дне",
    "- Вдруг произошло что-то очень неожиданное",
    "",
    `Шаг: ${input.stepKey}`,
    `Роль шага: ${input.roleDescription}`,
    `Название шаблона: ${input.title}`,
    `Начало истории:\n${input.introNarration || "Начало истории ещё не заполнено."}`,
    `Текущая ветка:\n${input.selectedPath}`,
    `Текущий текст истории:\n${input.currentStoryText || input.introNarration || "Текст истории пока не заполнен."}`,
    `Вопрос:\n${input.question}`,
    "Уже есть варианты и фрагменты:",
    input.existingChoices.length > 0
      ? input.existingChoices
          .map((item, index) =>
            [
              `Вариант ${index + 1}: ${item.text}`,
              `Фрагмент ${index + 1}: ${item.fragment?.trim() || "ещё не заполнен"}`,
            ].join("\n"),
          )
          .join("\n\n")
      : "Пока нет ни одного заполненного варианта.",
    "",
    "Продолжай именно эту ветку истории.",
    "Не начинай историю заново.",
    "Не меняй героя, место и настроение без логической причины.",
    "Не добавляй новый контекст, если он не вытекает из текущего текста истории.",
    "",
    "Верни только JSON.",
  ]);
}

export function buildStoryTemplatePrompt(input: {
  title?: string | null;
  description?: string | null;
  ageGroup?: string | null;
  templateName: string;
  templateSlug: string;
}) {
  return joinPrompt([
    SYSTEM_PROMPT,
    "Задача: сгенерируй полный шаблон интерактивной истории для детей.",
    ...JSON_RULES,
    ...CHILD_STYLE_RULES,
    ...STORY_SAFETY_RULES,
    STORY_TEMPLATE_VARIETY_PROMPT,
    "Этот prompt относится к творческому режиму. Здесь можно использовать воображение.",
    `Формат ответа: ${CANONICAL_STORY_TEMPLATE_FORMAT}`,
    "Требования к ответу:",
    "- title: короткое, яркое и запоминающееся название истории из 3-7 слов.",
    "- Не делай название шаблонным.",
    "- Избегай повторов вроде: «Приключения ...», «История про ...», одинаковых героев и одинаковых тем.",
    "- Не делай одного и того же героя героем по умолчанию.",
    "- Используй разнообразные миры: животные, дети, фантастические существа, волшебные предметы, необычные места, смешные ситуации.",
    "- Если название истории не задано, придумай оригинальное детское название с лёгкой загадкой, образом или смешной деталью.",
    "- Ровно 5 шагов: intro, journey, problem, solution, ending.",
    "- Все step_key MUST быть только из списка: intro, journey, problem, solution, ending.",
    "- На каждый шаг ровно 3 варианта выбора.",
    "- На каждый вариант 1 или 2 фрагмента.",
    "- 3 неожиданных добрых поворота.",
    "- История должна оставаться связной при любом выборе.",
    "- Для intro три choice должны вести историю в разные стороны, а не повторять одну и ту же идею.",
    "- Для intro сделай: один исследовательский вариант, один игровой или социальный вариант, один необычный или любопытный вариант.",
    "- Для intro fragments должны добавлять короткую деталь, настроение или образ, а не пересказывать choice.",
    "- Каждый choice MUST быть объектом с полями text и keywords.",
    "- keywords MUST всегда быть массивом строк.",
    "- fragments MUST использовать поле choice_index.",
    "- twists MUST быть массивом объектов с полями text и keywords.",
    "- Не переименовывай поля.",
    "- Не добавляй лишние поля.",
    "- Если структура отличается, ответ считается неверным.",
    "",
    `Название истории: ${input.title?.trim() || "Не задано, придумай сам."}`,
    `Описание: ${input.description ?? "Описание отсутствует."}`,
    `Возраст: ${input.ageGroup ?? "Не указан"}`,
    `Название шаблона: ${input.templateName}`,
    `Slug шаблона: ${input.templateSlug}`,
    "Примеры хороших названий:",
    "- Тайна фонаря на чердаке",
    "- Как облако потеряло тень",
    "- Лисёнок, который собирал эхо",
    "- Девочка и карманный вулкан",
    "- Кто разбудил лунный автобус",
  ]);
}

export function generateWholeBookPrompt(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  ageGroup?: string | null;
}) {
  return joinPrompt([
    SYSTEM_PROMPT,
    "Задача: сгенерируй сразу весь комплект данных по книге для детской библиотеки.",
    ...JSON_RULES,
    ...CHILD_STYLE_RULES,
    ...NON_FICTION_RULES,
    "Нужно сгенерировать description, keywords и разделы: plot, characters, main_idea, philosophy, conflicts, author_message, ending_meaning, twenty_seconds, test.",
    "Верни JSON в точной структуре ниже.",
    `Формат ответа: ${CANONICAL_FULL_BOOK_FORMAT}`,
    "Требования к ответу:",
    "- description: 1-2 коротких предложения, объясняющих книгу ребёнку.",
    "- keywords: 3-5 простых ключевых слов или коротких фраз о сюжете, персонажах или теме.",
    "- plot.slides: 12 слайдов.",
    "- characters.slides: 6 слайдов.",
    "- main_idea.slides: 5 слайдов.",
    "- philosophy.slides: 6 слайдов.",
    "- conflicts.slides: 6 слайдов.",
    "- author_message.slides: 5 слайдов.",
    "- ending_meaning.slides: 6 слайдов.",
    "- twenty_seconds.slides: 6 слайдов.",
    "- test.quiz: 5 вопросов.",
    "- Каждый раздел MUST иметь вид {\"slides\":[{\"text\":\"...\"}]}.",
    "- Внутри slides каждый элемент MUST быть объектом с полем text.",
    "- Не возвращай slides как массив строк.",
    "- Не добавляй вложенные структуры внутри slide кроме поля text.",
    "- Блок test MUST точно соответствовать формату quiz: title, description, quiz[].",
    "- В test.quiz каждый элемент MUST иметь question, options, correctAnswerIndex.",
    "- НЕ используй answers[].",
    "- НЕ используй questions[] на верхнем уровне test.",
    "- correctAnswerIndex MUST указывать на индекс правильного ответа в options.",
    "- Если структура отличается, ответ считается неверным.",
    "",
    `Название книги: ${input.title}`,
    `Автор: ${input.author ?? "Не указан"}`,
    `Описание книги: ${input.description ?? "Описание отсутствует."}`,
    `Возраст: ${input.ageGroup ?? "Не указан"}`,
    'Пример description: "История о друзьях, которые вместе проходят через смешные и добрые приключения."',
    'Пример keywords: ["дружба","приключения","лес","животные"]',
  ]);
}

export function buildBookBatchPlanPrompt(input: {
  ageGroup: string;
  genre?: string | null;
  count: number;
  existingTitles: string[];
}) {
  return joinPrompt([
    SYSTEM_PROMPT,
    "Задача: подбери список книг для пакетного добавления в детскую библиотеку.",
    ...JSON_RULES,
    ...CHILD_STYLE_RULES,
    BATCH_BOOK_PLAN_PROMPT,
    `Формат ответа: ${formatObject([
      formatField(
        "books",
        formatArray(
          formatObject([
            formatField("title", '"..."'),
            formatField("author", '"..."'),
          ]),
        ),
      ),
    ])}`,
    "Требования к ответу:",
    "- Подбирай только детские книги.",
    "- Подбирай известные, классические или хорошо знакомые детям книги.",
    "- Никогда не предлагай книги, предназначенные только для взрослых.",
    "- Книги должны подходить указанной возрастной группе.",
    "- Если жанр указан, соблюдай жанр.",
    "- Не возвращай книги из списка уже существующих.",
    "- Не возвращай дубликаты внутри ответа.",
    "- Верни не больше запрошенного количества.",
    "- Не переименовывай поля title и author.",
    "- Если структура отличается, ответ считается неверным.",
    "",
    `Возрастная группа: ${input.ageGroup}`,
    `Жанр: ${input.genre ?? "любой"}`,
    `Количество: ${input.count}`,
    `Уже существующие книги: ${input.existingTitles.join("; ") || "нет"}`,
  ]);
}
