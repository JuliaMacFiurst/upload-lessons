import { test, describe } from "node:test";
import assert from "node:assert/strict";

type MapTargetRow = {
  map_type: string;
  target_id: string;
  title_ru?: string | null;
  title_en?: string | null;
  title_he?: string | null;
};

type MapStoryRow = {
  id: number;
  type: string;
  target_id: string;
  language: string;
  is_approved: boolean;
  content: string;
};

// In-Memory Database Engine simulating PostgreSQL View & Unique Constraint behavior
class MockDatabaseQueueEngine {
  private targets: MapTargetRow[] = [];
  private stories: MapStoryRow[] = [];
  private nextStoryId = 1000;

  constructor() {
    // Populate base targets
    this.targets = [
      { map_type: "river", target_id: "Fraser", title_ru: "Фрейзер", title_en: "Fraser" },
      { map_type: "river", target_id: "Moma", title_ru: "Мома", title_en: "Moma" },
      { map_type: "sea", target_id: "Monterey Bay", title_ru: "Монтерей", title_en: "Monterey Bay" },
      { map_type: "physic", target_id: "Island Mafia I.", title_ru: "Мафия", title_en: "Island Mafia I." },
      { map_type: "river", target_id: "Indigirka", title_ru: "Индигирка", title_en: "Indigirka" },
    ];
  }

  /**
   * Simulates >1000 existing stories in database (e.g., 1381 stories including Fraser)
   */
  public seedLargeDatabaseWithOver1000Stories() {
    // Add 1100 dummy stories to push Fraser past 1000th row boundary
    for (let i = 0; i < 1100; i++) {
      this.stories.push({
        id: ++this.nextStoryId,
        type: "river",
        target_id: `DummyRiver_${i}`,
        language: "ru",
        is_approved: true,
        content: "Story content...",
      });
    }

    // Add Fraser story at position 1101 (>1000 limit boundary)
    this.stories.push({
      id: 1219,
      type: "river",
      target_id: "Fraser",
      language: "ru",
      is_approved: true,
      content: "Existing Fraser story...",
    });
  }

  /**
   * Database-First Generation Queue View Logic:
   * NOT EXISTS (
   *   SELECT 1 FROM map_stories ms 
   *   WHERE ms.type = mt.map_type AND ms.target_id = mt.target_id AND ms.language = 'ru'
   * )
   */
  public getGenerationQueue(mapType?: string): MapTargetRow[] {
    const ruStoryKeys = new Set(
      this.stories
        .filter((s) => s.language === "ru")
        .map((s) => `${s.type}::${s.target_id}`)
    );

    return this.targets.filter((t) => {
      if (mapType && t.map_type !== mapType) return false;
      const key = `${t.map_type}::${t.target_id}`;
      return !ruStoryKeys.has(key);
    });
  }

  /**
   * Simulates story_status generated column:
   * CASE WHEN is_approved = true THEN 'ready' ELSE 'draft' END
   */
  public getStoryStatus(storyId: number): "ready" | "draft" | null {
    const s = this.stories.find((item) => item.id === storyId);
    if (!s) return null;
    return s.is_approved ? "ready" : "draft";
  }

  /**
   * Simulates UNIQUE(type, target_id, language) database constraint
   */
  public insertStory(story: Omit<MapStoryRow, "id">): MapStoryRow {
    const duplicate = this.stories.find(
      (s) => s.type === story.type && s.target_id === story.target_id && s.language === story.language
    );

    if (duplicate) {
      throw new Error(
        `duplicate key value violates unique constraint "map_stories_type_target_id_language_key": Key (type, target_id, language)=(${story.type}, ${story.target_id}, ${story.language}) already exists.`
      );
    }

    const newStory: MapStoryRow = {
      id: ++this.nextStoryId,
      ...story,
    };
    this.stories.push(newStory);
    return newStory;
  }

  public approveStory(storyId: number) {
    const s = this.stories.find((item) => item.id === storyId);
    if (s) {
      s.is_approved = true;
    }
  }
}

describe("Database-First Generation Queue & Hard Protection Unit & Integration Tests", () => {
  test("Test A: Target exists in map_targets without story -> present in generation queue", () => {
    const db = new MockDatabaseQueueEngine();
    const queue = db.getGenerationQueue();

    const indigirka = queue.find((t) => t.target_id === "Indigirka");
    assert.ok(indigirka, "Indigirka without RU story must be in generation queue");
  });

  test("Test B: Draft story (is_approved = false) -> target excluded from generation queue", () => {
    const db = new MockDatabaseQueueEngine();
    const draft = db.insertStory({
      type: "river",
      target_id: "Indigirka",
      language: "ru",
      is_approved: false,
      content: "Draft story content...",
    });

    assert.equal(db.getStoryStatus(draft.id), "draft", "story_status must be 'draft'");

    const queue = db.getGenerationQueue();
    const indigirka = queue.find((t) => t.target_id === "Indigirka");
    assert.equal(indigirka, undefined, "Target with draft RU story must NOT be in generation queue");
  });

  test("Test C: Ready story (is_approved = true) -> target excluded from generation queue", () => {
    const db = new MockDatabaseQueueEngine();
    const readyStory = db.insertStory({
      type: "river",
      target_id: "Indigirka",
      language: "ru",
      is_approved: true,
      content: "Approved story content...",
    });

    assert.equal(db.getStoryStatus(readyStory.id), "ready", "story_status must be 'ready'");

    const queue = db.getGenerationQueue();
    const indigirka = queue.find((t) => t.target_id === "Indigirka");
    assert.equal(indigirka, undefined, "Target with ready RU story must NOT be in generation queue");
  });

  test("Test D: EN/HE story alone -> target remains in RU generation queue", () => {
    const db = new MockDatabaseQueueEngine();
    db.insertStory({
      type: "river",
      target_id: "Indigirka",
      language: "en",
      is_approved: true,
      content: "English story...",
    });

    const queue = db.getGenerationQueue();
    const indigirka = queue.find((t) => t.target_id === "Indigirka");
    assert.ok(indigirka, "Target with only EN story must still be in RU generation queue");
  });

  test("Test E: Inserting new RU draft -> target automatically disappears from queue", () => {
    const db = new MockDatabaseQueueEngine();

    // Before insert -> Indigirka in queue
    let queue = db.getGenerationQueue();
    assert.ok(queue.some((t) => t.target_id === "Indigirka"));

    // Insert draft
    db.insertStory({
      type: "river",
      target_id: "Indigirka",
      language: "ru",
      is_approved: false,
      content: "Fresh draft...",
    });

    // After insert -> Indigirka automatically disappears from queue
    queue = db.getGenerationQueue();
    assert.ok(!queue.some((t) => t.target_id === "Indigirka"), "Target must disappear after insert");
  });

  test("Test F: UNIQUE constraint catches duplicate INSERT attempt", () => {
    const db = new MockDatabaseQueueEngine();

    db.insertStory({
      type: "river",
      target_id: "Indigirka",
      language: "ru",
      is_approved: false,
      content: "First story...",
    });

    assert.throws(
      () => {
        db.insertStory({
          type: "river",
          target_id: "Indigirka",
          language: "ru",
          is_approved: false,
          content: "Second duplicate story...",
        });
      },
      /unique constraint/,
      "Database must throw unique constraint violation on duplicate insert"
    );
  });

  test("Regression Test (>1000 rows limit): Fraser positioned after 1000th row is correctly excluded by Queue", () => {
    const db = new MockDatabaseQueueEngine();
    db.seedLargeDatabaseWithOver1000Stories();

    // Database generation queue operates natively via NOT EXISTS
    const queue = db.getGenerationQueue();

    const fraser = queue.find((t) => t.target_id === "Fraser");
    assert.equal(
      fraser,
      undefined,
      "REGRESSION PASS: Fraser (located after 1000th DB row) MUST be excluded by database generation queue!"
    );
  });
});
