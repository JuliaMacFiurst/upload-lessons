export type SlideIntent =
  | "fact"
  | "place"
  | "description"
  | "story"
  | "action";

type IntentScore = Record<SlideIntent, number>;

const FACT_SIGNALS = [
  "это",
  "находится",
  "является",
  "столица",
  "самый",
  "самая",
  "известен",
  "известна",
  "расположен",
  "расположена",
  "called",
  "capital",
  "located",
  "known for",
  "is one of",
  "is the",
];

const PLACE_SIGNALS = [
  "в стране",
  "на территории",
  "в европе",
  "в азии",
  "в африке",
  "в америке",
  "город",
  "река",
  "море",
  "озеро",
  "остров",
  "горы",
  "стране",
  "country",
  "city",
  "river",
  "sea",
  "lake",
  "mountain",
  "island",
];

const ACTION_SIGNALS = [
  "течёт",
  "движется",
  "растёт",
  "меняется",
  "идёт",
  "падает",
  "бежит",
  "летит",
  "танцует",
  "flows",
  "moves",
  "grows",
  "changes",
  "falls",
  "runs",
  "flies",
  "dances",
];

const STORY_SIGNALS = [
  "жил",
  "жила",
  "однажды",
  "представь",
  "девочка",
  "мальчик",
  "герой",
  "смешной",
  "забавный",
  "funny",
  "once",
  "hero",
  "girl",
  "boy",
  "character",
  "imagine",
];

function addSignalScore(score: IntentScore, text: string, signals: string[], intent: SlideIntent, amount: number) {
  for (const signal of signals) {
    if (text.includes(signal)) {
      score[intent] += amount;
    }
  }
}

export function detectSlideIntent(text: string): SlideIntent {
  const t = text.toLowerCase();
  const score: IntentScore = {
    fact: 0,
    place: 0,
    description: 1,
    story: 0,
    action: 0,
  };

  addSignalScore(score, t, FACT_SIGNALS, "fact", 2);
  addSignalScore(score, t, PLACE_SIGNALS, "place", 2);
  addSignalScore(score, t, ACTION_SIGNALS, "action", 3);
  addSignalScore(score, t, STORY_SIGNALS, "story", 3);

  if (/\d/.test(t)) {
    score.fact += 1;
  }

  if (/(столица|capital|country|city|река|river|sea|mountain|lake)/.test(t)) {
    score.place += 2;
  }

  if (/(легенда|история|приключени|сказк|legend|story|adventure)/.test(t)) {
    score.story += 2;
  }

  if (/(ветер|дожд|storm|flow|wave|moving|running|flying)/.test(t)) {
    score.action += 2;
  }

  const ranked = (Object.entries(score) as Array<[SlideIntent, number]>).sort((left, right) => {
    if (left[1] !== right[1]) {
      return right[1] - left[1];
    }

    const priority: SlideIntent[] = ["action", "story", "place", "fact", "description"];
    return priority.indexOf(left[0]) - priority.indexOf(right[0]);
  });

  return ranked[0]?.[0] ?? "description";
}
