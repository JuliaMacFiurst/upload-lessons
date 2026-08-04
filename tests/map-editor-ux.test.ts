import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dedupeMediaItems } from "../lib/media-search/normalize.ts";
import type { MediaSearchItem } from "../lib/media-search/types.ts";

const component = (name: string) => readFile(new URL(`../components/admin/maps/${name}`, import.meta.url), "utf8");

function item(id: string, source: "pexels" | "wikimedia" | "giphy", url = `https://cdn.example/${id}`): MediaSearchItem {
  return { id, source, kind: "image", thumbnailUrl: url, originalUrl: url, creditLine: source };
}

test("media query Enter opens search without submitting an outer form", async () => {
  const slide = await component("MapStorySlideEditor.tsx");
  assert.match(slide, /event\.key !== "Enter"/);
  assert.match(slide, /event\.preventDefault\(\)/);
  assert.match(slide, /props\.onSearch\(\)/);
  assert.match(slide, /type="button" className="is-search"/);
});

test("picker receives the selected slide identity and retains query through search and selection", async () => {
  const page = await component("MapTargetEditorPage.tsx");
  const picker = await component("MediaPickerModal.tsx");
  assert.match(page, /slideId=\{slideKey\(slides\[pickerIndex\], pickerIndex\)\}/);
  assert.match(page, /query=\{queries\[slideKey\(slides\[pickerIndex\], pickerIndex\)\]/);
  assert.match(picker, /props\.onQueryChange\(query\)/);
  assert.doesNotMatch(picker, /setSearchQuery\(""\)/);
  assert.doesNotMatch(page, /setQueries\(\{\}\)/);
});

test("changing source/type searches a fresh first page while load-more appends", async () => {
  const picker = await component("MediaPickerModal.tsx");
  assert.match(picker, /switchSource[\s\S]*\[source\]: \[\][\s\S]*runSearch\(\{ source, kind: mediaKind, query: searchQuery \}\)/);
  assert.match(picker, /switchKind[\s\S]*setResultsBySource\(emptyResults\(\)\)[\s\S]*runSearch\(\{ source: activeSource, kind, query: searchQuery \}\)/);
  assert.match(picker, /append \? \[\.\.\.current\[source\], \.\.\.data\.items\] : data\.items/);
});

test("results are deduplicated without mixing providers", async () => {
  const duplicate = item("same", "pexels");
  assert.equal(dedupeMediaItems([duplicate, duplicate]).length, 1);
  const picker = await component("MediaPickerModal.tsx");
  assert.match(picker, /const visibleResults = resultsBySource\[activeSource\]/);
  assert.match(picker, /filter\(\(item\) => item\.source === source\)/);
  assert.doesNotMatch(picker, /source.*"all"/);
});

test("Pexels is the default and each source has an isolated tab/result bucket", async () => {
  const picker = await component("MediaPickerModal.tsx");
  assert.match(picker, /useState<MediaProvider>\(props\.initialSource \?\? "pexels"\)/);
  for (const source of ["pexels", "wikimedia", "giphy"]) {
    assert.match(picker, new RegExp(`value: "${source}"`));
    assert.match(picker, new RegExp(`${source}: \\[\\]`));
  }
  assert.match(picker, /role="tab" aria-selected=\{activeSource === tab\.value\}/);
});

test("API request always carries active source, media kind, and active cursor", async () => {
  const picker = await component("MediaPickerModal.tsx");
  const api = await readFile(new URL("../pages/api/admin/media-search.ts", import.meta.url), "utf8");
  assert.match(picker, /new URLSearchParams\(\{[\s\S]*source,[\s\S]*kind,[\s\S]*paginationBySource\[source\]\.cursor/);
  assert.match(api, /new Set<MediaProvider>\(\["pexels", "wikimedia", "giphy"\]\)/);
  assert.doesNotMatch(api, /"all"/);
});

test("query survives source, kind, pagination, selection, and close", async () => {
  const picker = await component("MediaPickerModal.tsx");
  assert.match(picker, /switchSource[\s\S]*query: searchQuery/);
  assert.match(picker, /switchKind[\s\S]*query: searchQuery/);
  assert.match(picker, /runSearch\(\{ append: true \}\)/);
  assert.doesNotMatch(picker, /setSearchQuery\(""\)/);
});

test("unsupported Wikimedia video renders an empty state without requesting", async () => {
  const picker = await component("MediaPickerModal.tsx");
  assert.match(picker, /source === "wikimedia" && kind === "video"/);
  assert.match(picker, /Этот источник не поддерживает выбранный тип медиа/);
});

test("selection updates only the active slide and success copy contains no URL", async () => {
  const page = await component("MapTargetEditorPage.tsx");
  assert.match(page, /index === pickerIndex \? \{ \.\.\.slide, image_url: item\.originalUrl/);
  assert.match(page, /item\.kind === "video" \? "Видео добавлено" : "Изображение добавлено"/);
  assert.doesNotMatch(page, /добавлено.*originalUrl/);
});

test("every slide Save button calls the shared whole-array save flow", async () => {
  const page = await component("MapTargetEditorPage.tsx");
  assert.match(page, /const saveAllSlides = async/);
  assert.match(page, /body: JSON\.stringify\(payload\(\)\)/);
  assert.match(page, /onSave=\{\(\) => void saveAllSlides\(\)\}/);
});

test("drafts debounce to a story-specific key, offer restore, and clear after save", async () => {
  const page = await component("MapTargetEditorPage.tsx");
  assert.match(page, /map-story-draft:\$\{mapType\}:\$\{targetId\}:\$\{story\?\.language/);
  assert.match(page, /setTimeout\(\(\) => \{/);
  assert.match(page, /localStorage\.setItem\(draftKey/);
  assert.match(page, /Найдены несохранённые изменения/);
  assert.match(page, /localStorage\.removeItem\(draftKey\)/);
  assert.match(page, /beforeunload/);
});

test("media removal is gated by the accessible confirmation dialog", async () => {
  const page = await component("MapTargetEditorPage.tsx");
  const dialog = await component("ConfirmationDialog.tsx");
  assert.match(page, /onRemoveMedia=\{\(\) => setConfirmAction/);
  assert.match(page, /confirmAction\?\.kind === "remove"/);
  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /props\.onCancel/);
});

test("media search API validates input and requires the admin session", async () => {
  const api = await readFile(new URL("../pages/api/admin/media-search.ts", import.meta.url), "utf8");
  assert.match(api, /requireAdminSession\(req, res\)/);
  assert.match(api, /query\.length > 120/);
  assert.match(api, /SOURCES\.has/);
  assert.match(api, /KINDS\.has/);
});

test("mobile CSS prevents overflow and renders exactly three picker columns", async () => {
  const css = await readFile(new URL("../styles/admin-layout.css", import.meta.url), "utf8");
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /aspect-ratio: 1\/1/);
  assert.match(css, /object-fit: cover/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /font-size: 16px/);
  assert.match(css, /\.map-media-search-row \{[^}]*grid-template-columns: minmax\(0,1fr\) auto;[^}]*width: 100%;[^}]*min-width: 0;/);
  assert.match(css, /\.map-media-search-input \{[^}]*width: 100%;[^}]*min-width: 0;[^}]*height: 44px/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*grid-template-columns: minmax\(0,1fr\)/);
});
