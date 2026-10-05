import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalLibrarySlideshowImportExample,
  canonicalLibraryVideoImportExample,
  libraryImportExampleForContentType,
  libraryImportExampleJson,
} from "../lib/bedtime-stories/import-examples.ts";
import { parseBedtimeStoryJson } from "../lib/server/bedtime-stories-admin.ts";

test("canonical VIDEO import example stays aligned with the real import validator", () => {
  const parsed = parseBedtimeStoryJson(JSON.stringify(canonicalLibraryVideoImportExample));

  assert.equal(parsed.content_type, "video");
  assert.deepEqual(parsed.slides, []);
  assert.equal(canonicalLibraryVideoImportExample.slides.length, 0);
  assert.equal(parsed.media.url, "");
  assert.deepEqual(parsed.category_slugs, ["crafts", "science"]);
});

test("canonical SLIDESHOW import example contains real content and passes the real import validator", () => {
  const parsed = parseBedtimeStoryJson(JSON.stringify(canonicalLibrarySlideshowImportExample));

  assert.equal(parsed.content_type, "slideshow");
  assert.equal(parsed.slides.length, 1);
  assert.ok(parsed.slides[0].text.en);
  assert.ok(parsed.slides[0].illustration_prompt);
});

test("Library UI example selection follows content_type", () => {
  assert.equal(libraryImportExampleForContentType("video"), canonicalLibraryVideoImportExample);
  assert.equal(libraryImportExampleForContentType("slideshow"), canonicalLibrarySlideshowImportExample);
  assert.deepEqual(JSON.parse(libraryImportExampleJson("video")).slides, []);
  assert.equal(JSON.parse(libraryImportExampleJson("slideshow")).slides.length, 1);

  const adminPage = readFileSync("pages/admin/bedtime-stories.tsx", "utf8");
  assert.match(adminPage, /libraryImportExampleJson\(activeStory\.content_type\)/);
  assert.match(adminPage, /copyTextToClipboard\(jsonImportExample\)/);
  assert.match(adminPage, /placeholder=\{jsonImportExample\}/);
});
