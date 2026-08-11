import assert from "node:assert/strict";
import test from "node:test";
import { repairTranslationJsonInput } from "../lib/map-translations/repair.ts";

function compactJson(en: string, he: string): string {
  return `{
  "contract_version": 2,
  "content_type": "map_story",
  "items": [{
    "content_id": "1",
    "source_hash": "hash",
    "translations": {
      "en": { "content": "${en}" },
      "he": { "content": "${he}" }
    }
  }]
}`;
}

test("repairs unescaped ASCII quotes only inside English translation content", () => {
  const result = repairTranslationJsonInput(compactJson(
    'Easy to remember—just like the word "mali" (little), but with an "i" at the end!',
    "שלום",
  ));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.changed, true);
  assert.equal(JSON.parse(result.text).items[0].translations.en.content, 'Easy to remember—just like the word "mali" (little), but with an "i" at the end!');
});

test("repairs unescaped ASCII quotes and raw line breaks inside Hebrew content", () => {
  const result = repairTranslationJsonInput(compactJson("Hello", 'המילה "שלום" נשארת כאן\nבשורה חדשה'));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(JSON.parse(result.text).items[0].translations.he.content, 'המילה "שלום" נשארת כאן\nבשורה חדשה');
});

test("typographic quotes are already valid and require no quote repair", () => {
  const raw = compactJson("“hello”", "“שלום”");
  assert.deepEqual(JSON.parse(raw).items[0].translations, {
    en: { content: "“hello”" },
    he: { content: "“שלום”" },
  });
});

test("structurally broken JSON outside translation content is not guessed at", () => {
  const raw = '{"contract_version":2 "content_type":"map_story","items":[]}';
  const result = repairTranslationJsonInput(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.throws(() => JSON.parse(result.text), SyntaxError);
});

test("complete Markdown fences are removed but partial fences are rejected", () => {
  const valid = JSON.stringify({ contract_version: 2, content_type: "map_story", items: [] });
  const fenced = repairTranslationJsonInput(`\n\`\`\`json\n${valid}\n\`\`\`\n`);
  assert.equal(fenced.ok, true);
  if (fenced.ok) assert.deepEqual(JSON.parse(fenced.text), JSON.parse(valid));
  assert.deepEqual(repairTranslationJsonInput(`\`\`\`json\n${valid}`), { ok: false });
});

test("explanatory text is stripped only around one apparent root object", () => {
  const valid = JSON.stringify({ contract_version: 2, content_type: "map_story", items: [] });
  const result = repairTranslationJsonInput(`Here is the JSON:\n${valid}\nDone.`);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(JSON.parse(result.text), JSON.parse(valid));
  assert.deepEqual(repairTranslationJsonInput(`${valid}\n${valid}`), { ok: false });
});

test("ambiguous quotes adjacent to JSON structural punctuation are rejected", () => {
  const raw = compactJson('ambiguous "quote", next', "שלום");
  assert.deepEqual(repairTranslationJsonInput(raw), { ok: false });
});

test("semantic script content is never automatically replaced", () => {
  const raw = compactJson("Hello", "המילה малыш נשארת");
  const result = repairTranslationJsonInput(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.changed, false);
  assert.equal(JSON.parse(result.text).items[0].translations.he.content, "המילה малыш נשארת");
});
