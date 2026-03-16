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
export const STORY_PROMPT = "Сделай добрую, весёлую и безопасную интерактивную историю про капибару.";
export const BATCH_BOOK_PLAN_PROMPT = "Подбери известные и подходящие детям книги для автоматического наполнения CMS.";

const JSON_RULES = [
  "Обязательное правило: верни только валидный JSON.",
  "Не добавляй markdown, комментарии, вступления или объяснения.",
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

const STORY_ROLE_QUESTIONS: Record<StoryRoleKey, string> = {
  intro: "Как начинается приключение капибары?",
  journey: "Куда капибара отправляется дальше?",
  problem: "Какая проблема появляется в пути?",
  solution: "Как капибара решает проблему?",
  ending: "Чем заканчивается история?",
};

function joinPrompt(lines: string[]) {
  return lines.join("\n");
}

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
    'Формат ответа: {"slides":[{"text":"..."},{"text":"..."}]}',
    "Требования к ответу:",
    "- 3-4 слайда.",
    "- Каждый слайд — одно короткое предложение.",
    "- Каждый слайд должен относиться только к нужному разделу.",
    "- Не пиши нумерацию.",
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
    'Формат ответа: {"items":[{"mode":"plot","slides":[{"text":"..."}]}]}',
    "Требования к ответу:",
    "- Генерируй только перечисленные разделы.",
    "- Для каждого раздела сделай 3-4 коротких слайда.",
    "- mode должен точно совпадать со slug раздела.",
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
    'Формат ответа: {"title":"...","description":"...","quiz":[{"question":"...","options":["...","...","..."],"correctAnswerIndex":0}]}',
    "Требования к ответу:",
    "- 5 вопросов.",
    "- В каждом вопросе 3 или 4 варианта ответа.",
    "- correctAnswerIndex должен указывать на один правильный ответ.",
    "- Вопросы должны проверять понимание реальной книги, а не выдуманных деталей.",
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
    SYSTEM_PROMPT,
    "Задача: сгенерируй один элемент интерактивной истории про капибару.",
    ...JSON_RULES,
    ...CHILD_STYLE_RULES,
    ...STORY_SAFETY_RULES,
    STORY_PROMPT,
    "Этот prompt относится к творческому режиму. Здесь можно использовать воображение.",
    "Требования к ответу:",
    "- Один короткий элемент.",
    "- Он должен точно соответствовать роли шага.",
    "- Он должен логично продолжать предыдущий шаг.",
    "- Он должен оставаться понятным ребёнку.",
    "",
    `Название книги-основы: ${input.title}`,
    `Описание: ${input.description ?? "Описание отсутствует."}`,
    `Возраст: ${input.ageGroup ?? "Не указан"}`,
    `Название шаблона: ${input.templateName ?? "Capybara Story"}`,
    `Тип элемента: ${input.kind}`,
    `Story role: ${storyRole.toUpperCase()}`,
    `Описание роли: ${STORY_ROLE_DESCRIPTIONS[storyRole]}`,
    previousRole ? `Previous story role: ${previousRole.toUpperCase()}` : "Previous story role: none",
    `Контекст: ${input.context ?? "Без дополнительного контекста."}`,
    input.kind === "step"
      ? `Формат ответа: {"question":"${STORY_ROLE_QUESTIONS[storyRole]}","step_key":"${storyRole}"}`
      : 'Формат ответа: {"text":"...","keywords":["...","..."]}',
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
    "Задача: сгенерируй полный шаблон интерактивной истории про капибару.",
    ...JSON_RULES,
    ...CHILD_STYLE_RULES,
    ...STORY_SAFETY_RULES,
    STORY_PROMPT,
    "Этот prompt относится к творческому режиму. Здесь можно использовать воображение.",
    'Формат ответа: {"title":"...","steps":[{"step_key":"...","question":"...","choices":[{"text":"...","keywords":["..."]}]}],"fragments":[{"step_key":"...","choice_index":0,"text":"...","keywords":["..."]}],"twists":[{"text":"...","keywords":["..."]}]}',
    "Требования к ответу:",
    "- title: короткое доброе название истории из 3-6 слов.",
    "- Если название истории не задано, придумай короткое и доброе название истории.",
    "- Ровно 5 шагов: intro, journey, problem, solution, ending.",
    "- All step_key values MUST be one of: intro, journey, problem, solution, ending.",
    "- На каждый шаг ровно 3 варианта выбора.",
    "- На каждый вариант 1 или 2 фрагмента.",
    "- 3 неожиданных добрых поворота.",
    "- История должна оставаться связной при любом выборе.",
    "- Все step_key должны точно совпадать с допустимыми значениями.",
    "",
    `Название истории: ${input.title?.trim() || "Не задано, придумай сам."}`,
    `Описание: ${input.description ?? "Описание отсутствует."}`,
    `Возраст: ${input.ageGroup ?? "Не указан"}`,
    `Название шаблона: ${input.templateName}`,
    `Slug шаблона: ${input.templateSlug}`,
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
    'Формат ответа: {"description":"...","keywords":["...","...","..."],"plot":{"slides":[{"text":"..."}]},"characters":{"slides":[{"text":"..."}]},"main_idea":{"slides":[{"text":"..."}]},"philosophy":{"slides":[{"text":"..."}]},"conflicts":{"slides":[{"text":"..."}]},"author_message":{"slides":[{"text":"..."}]},"ending_meaning":{"slides":[{"text":"..."}]},"twenty_seconds":{"slides":[{"text":"..."}]},"test":{"title":"...","description":"...","quiz":[{"question":"...","options":["...","...","..."],"correctAnswerIndex":0}]}}',
    "Если структура JSON не совпадает точно, ответ считается неверным.",
    "Верни только JSON.",
    "Не добавляй пояснения.",
    "Не добавляй markdown.",
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
    'Формат ответа: {"books":[{"title":"...","author":"..."}]}',
    "Требования к ответу:",
    "- Подбирай только детские книги.",
    "- Подбирай известные, классические или хорошо знакомые детям книги.",
    "- Никогда не предлагай книги, предназначенные только для взрослых.",
    "- Книги должны подходить указанной возрастной группе.",
    "- Если жанр указан, соблюдай жанр.",
    "- Не возвращай книги из списка уже существующих.",
    "- Не возвращай дубликаты внутри ответа.",
    "- Верни не больше запрошенного количества.",
    "",
    `Возрастная группа: ${input.ageGroup}`,
    `Жанр: ${input.genre ?? "любой"}`,
    `Количество: ${input.count}`,
    `Уже существующие книги: ${input.existingTitles.join("; ") || "нет"}`,
  ]);
}
