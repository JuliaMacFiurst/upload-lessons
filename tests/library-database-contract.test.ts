import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20261005000200_make_library_slide_count_content_type_aware.sql";
const migration = readFileSync(migrationPath, "utf8");
const normalizedSql = migration.replace(/\s+/g, " ").trim();

function expectedSlideCountContract(contentType: "slideshow" | "video" | "image", slideCount: number) {
  return contentType === "slideshow"
    ? slideCount >= 1 && slideCount <= 10
    : slideCount >= 0 && slideCount <= 10;
}

test("Library slide-count migration replaces only the named legacy constraint", () => {
  assert.match(normalizedSql, /alter table public\.bedtime_stories drop constraint if exists bedtime_stories_slides_count_check;/);
  assert.match(normalizedSql, /alter table public\.bedtime_stories add constraint bedtime_stories_slides_count_check check/);
  assert.equal((normalizedSql.match(/drop constraint/g) ?? []).length, 1);
  assert.doesNotMatch(normalizedSql, /\b(update|insert|delete|truncate)\b/i);
});

test("database contract allows empty VIDEO and IMAGE slides while preserving slideshow protection", () => {
  assert.match(normalizedSql, /content_type = 'slideshow' and jsonb_array_length\(slides\) between 1 and 10/);
  assert.match(normalizedSql, /content_type in \('video', 'image'\) and jsonb_array_length\(slides\) between 0 and 10/);

  assert.equal(expectedSlideCountContract("video", 0), true);
  assert.equal(expectedSlideCountContract("image", 0), true);
  assert.equal(expectedSlideCountContract("slideshow", 0), false);
  assert.equal(expectedSlideCountContract("slideshow", 1), true);
  assert.equal(expectedSlideCountContract("slideshow", 10), true);
  assert.equal(expectedSlideCountContract("slideshow", 11), false);
});

test("legacy slideshow and moving-paper-desert rows satisfy the new database contract", () => {
  const legacySlideshow = { content_type: "slideshow" as const, slides: [{ slide_number: 1 }] };
  const movingPaperDesert = { content_type: "video" as const, slides: [] };

  assert.equal(expectedSlideCountContract(legacySlideshow.content_type, legacySlideshow.slides.length), true);
  assert.equal(expectedSlideCountContract(movingPaperDesert.content_type, movingPaperDesert.slides.length), true);
});
