import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { diagnoseJsonParseError, formatLlmJsonDiagnostic, LlmJsonDiagnosticError, normalizeLlmJson, parseLlmJson } from "../lib/ai/llmJson.ts";
import { parseTranslatedPayload, translateLessonWithRetries } from "../lib/lesson-translation.ts";
import { validatePilotOutput } from "../lib/server/mapContentWriter/outputValidator.ts";
import { parseHumanTranslationJson, validateHumanTranslationImport } from "../lib/server/human-translation-import.ts";
import { buildSourceHash } from "../lib/server/translation-hash.ts";

test("valid JSON is unchanged, including technical characters inside string values", () => {
  const raw = '{"text":"A\u00a0B\u202fC\u2007D\ufeffE\u200bF \\"quote\\""}';
  assert.equal(normalizeLlmJson(raw), raw);
  assert.deepEqual(JSON.parse(normalizeLlmJson(raw)), JSON.parse(raw));
});

for (const [name, character] of [
  ["NBSP", "\u00a0"],
  ["narrow NBSP", "\u202f"],
  ["figure space", "\u2007"],
  ["BOM", "\ufeff"],
  ["zero-width space", "\u200b"],
] as const) {
  test(`parses JSON with ${name} outside strings`, () => {
    const raw = `${character}{${character}"steps_texts"${character}:${character}["Привет"]${character}}${character}`;
    assert.deepEqual(parseTranslatedPayload(raw).steps_texts, ["Привет"]);
  });
}

test("parses mixed technical characters and preserves all quoted content", () => {
  const raw = '\ufeff{\u00a0"steps_texts"\u202f:\u2007["A\u00a0B\u200bC\ufeffD"]\u200b}';
  assert.deepEqual(parseTranslatedPayload(raw).steps_texts, ["A\u00a0B\u200bC\ufeffD"]);
});

test("existing map-story Markdown fence extraction still precedes normalization", () => {
  const result = validatePilotOutput('```json\n[\u00a0{"map_type":"river","target_id":"x","content":"Текст"}\u200b]\n```', [
    { map_type: "river", target_id: "x" },
  ]);
  assert.deepEqual(result.parsedData, [{ map_type: "river", target_id: "x", content: "Текст" }]);
  assert.equal(result.isCandidateJson, true);
});

test("malformed JSON remains malformed", () => {
  assert.throws(() => JSON.parse(normalizeLlmJson('{"steps_texts" ["x"]}')), SyntaxError);
  assert.throws(() => parseTranslatedPayload('{"steps_texts" ["x"]}'), /Invalid JSON/);
});

test("technical Unicode alone never triggers another LLM call", async () => {
  let calls = 0;
  const result = await translateLessonWithRetries({
    lesson: { title: "Урок", steps: [{ text: "Привет", type: "paint" }] },
    sourceLanguage: "ru",
    targetLanguage: "en",
    translateFn: async () => {
      calls += 1;
      return '\ufeff{\u00a0"steps_texts"\u202f:\u2007["Hello"]\u200b}';
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.equal(calls, 1);
});

test("schema-invalid parsed JSON retains the existing validation retry", async () => {
  let calls = 0;
  const result = await translateLessonWithRetries({
    lesson: { title: "Урок", steps: [{ text: "Привет", type: "paint" }] },
    sourceLanguage: "ru",
    targetLanguage: "en",
    maxRetries: 2,
    translateFn: async () => {
      calls += 1;
      return calls === 1 ? '{"steps_texts":[]}' : '{"steps_texts":["Hello"]}';
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("valid JSON with escaped quotes is returned byte-for-byte unchanged", () => {
  const raw = String.raw`{"content":"He said \"hello\" and left"}`;
  const parsed = parseLlmJson(raw);
  assert.equal(parsed.text, raw);
  assert.equal(parsed.changed, false);
  assert.equal(parsed.quoteRepairs, 0);
  assert.deepEqual(parsed.value, { content: 'He said "hello" and left' });
});

test("quote repair preserves apostrophes, escaped slashes, tabs and newlines", () => {
  const raw = String.raw`{"content":"It's a path C:\\Maps\\River; he said "hello"\nthen\tleft"}`;
  const parsed = parseLlmJson(raw);
  assert.deepEqual(parsed.value, { content: "It's a path C:\\Maps\\River; he said \"hello\"\nthen\tleft" });
  assert.equal(parsed.quoteRepairs, 2);
});

test("valid JSON without inner quotes is unchanged", () => {
  const raw = '{"content":"Обычный текст 🐻‍❄️"}';
  assert.equal(parseLlmJson(raw).text, raw);
});

test("Paraguay regression repairs multiple human quotes without changing the story", () => {
  const raw = '{"content": "Парагвай! Звучит немножко как "пара-два-ай", правда? Его "сердце" называется Асунсьон. Напиток пьют из "калаваса" через "бомбилью"."}';
  const result = parseLlmJson(raw);
  assert.equal(result.quoteRepairs, 8);
  assert.deepEqual(result.value, {
    content: 'Парагвай! Звучит немножко как "пара-два-ай", правда? Его "сердце" называется Асунсьон. Напиток пьют из "калаваса" через "бомбилью".',
  });
  assert.deepEqual(JSON.parse(result.text), result.value);
});

test("Russian, English and Hebrew quotes are repaired inside nested objects and arrays", () => {
  const raw = '{"items":[{"content":"Он сказал "привет" и ушёл"},{"content":"The "heart" of it"},{"content":"הוא אמר "שלום" והלך"}]}';
  const result = parseLlmJson(raw);
  assert.deepEqual(result.value, { items: [
    { content: 'Он сказал "привет" и ушёл' },
    { content: 'The "heart" of it' },
    { content: 'הוא אמר "שלום" והלך' },
  ] });
});

test("emoji ZWJ and escaped newline survive quote repair", () => {
  const raw = String.raw`{"content":"👩‍👩‍👧‍👦 says "hello"\nagain"}`;
  const result = parseLlmJson(raw);
  assert.deepEqual(result.value, { content: '👩‍👩‍👧‍👦 says "hello"\nagain' });
});

test("inner quotes followed by commas do not become object boundaries", () => {
  const raw = '{"content":"его "сердце", "калаваса", "бомбилью"","next":"ok"}';
  assert.deepEqual(parseLlmJson(raw).value, { content: 'его "сердце", "калаваса", "бомбилью"', next: "ok" });
});

test("Unicode normalization and quote repair work in the same pass", () => {
  const raw = '\ufeff{\u00a0"content":"Это называется "сердце" страны"\u200b}';
  assert.deepEqual(parseLlmJson(raw).value, { content: 'Это называется "сердце" страны' });
});

test("human translation import and map-story validator share quote repair", () => {
  const raw = '{"items":[{"content":"Это называется "сердце" страны"}]}';
  assert.deepEqual(parseHumanTranslationJson(raw), { items: [{ content: 'Это называется "сердце" страны' }] });
  const story = validatePilotOutput('[{"map_type":"river","target_id":"x","content":"Это называется "сердце" страны"}]', [
    { map_type: "river", target_id: "x" },
  ]);
  assert.deepEqual(story.parsedData, [{ map_type: "river", target_id: "x", content: 'Это называется "сердце" страны' }]);
});

test("an inner quote before a prose comma stays inside an array string", () => {
  const raw = '["He said "hello", then left", "ordinary"]';
  assert.deepEqual(parseLlmJson(raw).value, ['He said "hello", then left', "ordinary"]);
});

test("quotes before commas never split one human sentence into extra array elements", () => {
  const raw = '["Он сказал "привет", "улыбнулся" и ушёл"]';
  assert.deepEqual(parseLlmJson(raw).value, ['Он сказал "привет", "улыбнулся" и ушёл']);
});

test("a bracket after a human quote does not close its container without a valid suffix", () => {
  assert.deepEqual(parseLlmJson('{"content":"Знак "} напоминает дверь"}').value, { content: 'Знак "} напоминает дверь' });
  assert.deepEqual(parseLlmJson('["Символ "] похож на дверь"]' ).value, ['Символ "] похож на дверь']);
});

test("full Paraguay response preserves identities, translations, emoji, escapes and array lengths", () => {
  const raw = readFileSync(new URL("./fixtures/paraguay-llm-response.txt", import.meta.url), "utf8");
  assert.throws(() => JSON.parse(raw), SyntaxError);
  const result = parseLlmJson(raw);
  const payload = result.value as Record<string, unknown>;
  const items = payload.items as Array<Record<string, unknown>>;
  const item = items[0];
  const source = item.source as { content: string };
  const translations = item.translations as Record<string, { content: string }>;
  assert.deepEqual(JSON.parse(result.text), result.value);
  assert.equal(items.length, 1);
  assert.equal(item.content_id, "paraguay-001");
  assert.equal(item.source_hash, "sha256:unchanged-paraguay-source");
  assert.equal((item.slides as string[]).length, 2);
  assert.equal((item.tags as string[]).length, 2);
  assert.equal(source.content, '🇵🇾 Парагвай! Звучит немножко как "пара-два-ай", правда? Его "сердце" называется Асунсьон. Там напиток мате наливают в сосуд, который называется "калаваса", и пьют через "бомбилью". Каждая такая "паутинка" улиц ведёт к новой истории. 🧑‍⚖️\nУ реки прохладно, а на площади снова слышны песни.');
  assert.match(source.content, /Звучит немножко как "пара-два-ай", правда\?/);
  assert.match(source.content, /Его "сердце"/);
  assert.match(source.content, /называется "калаваса"/);
  assert.match(source.content, /через "бомбилью"/);
  assert.match(source.content, /Каждая такая "паутинка"/);
  assert.match(source.content, /🧑‍⚖️\n/);
  assert.match(translations.en.content, /"heart"/);
  assert.match(translations.he.content, /"לב"/);
  assert.equal((item.slides as string[])[0], 'Он сказал "привет", "улыбнулся" и ушёл по улице. 🧑‍⚖️');
});

test("damaged Paraguay fixture reports repaired stage and a bounded local snippet", () => {
  const raw = readFileSync(new URL("./fixtures/paraguay-llm-response.txt", import.meta.url), "utf8");
  const damaged = raw.replace("правда? Его", "правда?\u0001 Его");
  assert.throws(() => parseLlmJson(damaged), (error: unknown) => {
    assert.ok(error instanceof LlmJsonDiagnosticError);
    const diagnostic = error.diagnostic;
    assert.equal(diagnostic.stage, "repaired_parse");
    assert.ok(diagnostic.initialParseMessage);
    assert.ok(diagnostic.repairedParseMessage);
    assert.ok((diagnostic.repairCount ?? 0) > 0);
    assert.equal(typeof diagnostic.position, "number");
    assert.equal(typeof diagnostic.line, "number");
    assert.equal(typeof diagnostic.column, "number");
    assert.match(diagnostic.snippet ?? "", /Парагвай|пара-два-ай|правда/);
    assert.match(diagnostic.snippet ?? "", /␁/);
    assert.ok((diagnostic.snippet?.length ?? 0) <= 283);
    assert.ok((diagnostic.pointerOffset ?? -1) >= 0);
    const shown = formatLlmJsonDiagnostic(diagnostic);
    assert.match(shown, /Initial JSON\.parse:/);
    assert.match(shown, /Repaired JSON\.parse:/);
    assert.doesNotMatch(shown, /בכל רחוב מחכה סיפור חדש/);
    assert.ok(shown.length < 1100);
    return true;
  });
});

test("unrepaired syntax error reports initial stage and location", () => {
  assert.throws(() => parseLlmJson('{"contract_version":2 "content_type":"map_story"}'), (error: unknown) => {
    assert.ok(error instanceof LlmJsonDiagnosticError);
    assert.equal(error.diagnostic.stage, "initial_parse");
    assert.match(error.diagnostic.message, /JSON|Unexpected|Expected/i);
    assert.equal(typeof error.diagnostic.line, "number");
    assert.match(formatLlmJsonDiagnostic(error.diagnostic), /\^/);
    return true;
  });
});

test("diagnostics still include a short excerpt when V8 gives no position", () => {
  assert.throws(() => parseLlmJson('{"items":[1,2,}'), (error: unknown) => {
    assert.ok(error instanceof LlmJsonDiagnosticError);
    assert.equal(error.diagnostic.stage, "initial_parse");
    assert.match(error.diagnostic.snippet ?? "", /items/);
    assert.match(formatLlmJsonDiagnostic(error.diagnostic), /JSON\.parse:/);
    return true;
  });
});

test("location helper accepts offset and line-column JSON.parse message variants", () => {
  const text = "first\nsecond";
  const offset = diagnoseJsonParseError(text, new SyntaxError("Unexpected token in JSON at position 6"));
  const lineColumn = diagnoseJsonParseError(text, new SyntaxError("Expected value in JSON at line 2 column 1"));
  for (const diagnostic of [offset, lineColumn]) {
    assert.equal(diagnostic.position, 6);
    assert.equal(diagnostic.line, 2);
    assert.equal(diagnostic.column, 1);
    assert.equal(diagnostic.pointerOffset, 6);
    assert.match(diagnostic.snippet ?? "", /first␊second/);
  }
});

test("structural damage is not repaired by the quote pass", () => {
  assert.throws(() => parseLlmJson('{"content" "missing colon"}'), SyntaxError);
  assert.throws(() => parseLlmJson('{"content":"x",}'), SyntaxError);
  assert.throws(() => parseLlmJson('{"bad "key":"x"}'), SyntaxError);
});

test("quote repair avoids LLM retry when it succeeds", async () => {
  let calls = 0;
  const result = await translateLessonWithRetries({
    lesson: { title: "Урок", steps: [{ text: "Привет", type: "paint" }] },
    sourceLanguage: "ru",
    targetLanguage: "en",
    translateFn: async () => {
      calls += 1;
      return '{"steps_texts":["Парагвай! Звучит немножко как "пара-два-ай", правда? Его "сердце" называется Асунсьон. 🧑‍⚖️"]}';
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.equal(calls, 1);
});

test("LLM retry remains available after deterministic repair fails", async () => {
  let calls = 0;
  const result = await translateLessonWithRetries({
    lesson: { title: "Урок", steps: [{ text: "Привет", type: "paint" }] },
    sourceLanguage: "ru",
    targetLanguage: "en",
    maxRetries: 2,
    translateFn: async () => {
      calls += 1;
      return calls === 1 ? '{"steps_texts" ["bad"]}' : '{"steps_texts":["Good"]}';
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("extractor leaves clean JSON byte-for-byte unchanged", () => {
  const raw = String.raw`{"items":[{"text":"a {brace} and \\\\ slash and \"quote\""}]}`;
  const result = parseLlmJson(raw);
  assert.equal(result.text, raw);
  assert.equal(result.changed, false);
  assert.equal(result.quoteRepairs, 0);
});

test("extractor reads a json fence and nested object and array roots", () => {
  const result = parseLlmJson('```json\n{"items":[{"nested":{"value":[1,2,{"x":"{not structure}"}]}}]}\n```');
  assert.deepEqual(result.value, { items: [{ nested: { value: [1, 2, { x: "{not structure}" }] } }] });
});

test("extractor ignores python and text fences before JSON", () => {
  const raw = '```python\nprint({"wrong": True})\n```\n```text\n{"wrong":true}\n```\n```bash\necho {}\n```\n{"contract_version":1,"items":[{"id":42}]}';
  assert.deepEqual(parseLlmJson(raw).value, { contract_version: 1, items: [{ id: 42 }] });
});

test("an unclosed python fence can still yield a full contract, never a Python example", () => {
  const raw = '```python\nprint({"example": true})\nLength: 13166\n{“contract_version”:1,“items”:[{"id":42}]}';
  assert.deepEqual(parseLlmJson(raw).value, { contract_version: 1, items: [{ id: 42 }] });
});

test("extractor accepts prose before and after a JSON object", () => {
  assert.deepEqual(parseLlmJson('Here is the payload:\n{"a":1}\nDone.').value, { a: 1 });
});

test("contract candidate beats a smaller parseable example", () => {
  const raw = '{"example":true}\n{"contract_version":1,"items":[{"id":42}],"requested_languages":["en","he"]}';
  assert.deepEqual(parseLlmJson(raw).value, { contract_version: 1, items: [{ id: 42 }], requested_languages: ["en", "he"] });
});

test("explicit shape callback selects expected candidate over a longer unrelated object", () => {
  const raw = '{"unrelated":"This is a very long but irrelevant example."}\n{"items":[1]}';
  const result = parseLlmJson(raw, { isExpectedShape: (value) =>
    value !== null && typeof value === "object" && "items" in value });
  assert.deepEqual(result.value, { items: [1] });
});

test("extractor respects escaped quotes, backslashes and brackets inside values", () => {
  const raw = String.raw`Before: {"content":"a \"quoted\" [section] {brace} C:\\Maps","nested":[{"ok":true}]}`;
  assert.deepEqual(parseLlmJson(raw).value, { content: 'a "quoted" [section] {brace} C:\\Maps', nested: [{ ok: true }] });
});

test("extractor supports an array root", () => {
  assert.deepEqual(parseLlmJson('Result:\n[{"x":1},[2,3]]\nEnd.').value, [{ x: 1 }, [2, 3]]);
});

test("smart quotes around structural keys are normalized without changing quoted prose", () => {
  const raw = '{“contract_version”:1,“items”:[{"content":"Human “quotes” stay curly"}]}';
  const parsed = parseLlmJson(raw);
  assert.deepEqual(parsed.value, { contract_version: 1, items: [{ content: "Human “quotes” stay curly" }] });
  assert.equal((parsed.value as { items: Array<{ content: string }> }).items[0].content, "Human “quotes” stay curly");
});

test("extractor reports when no object or array exists", () => {
  assert.throws(() => parseLlmJson('```python\nprint({"x": 1})\n```\nNo result.'), (error: unknown) => {
    assert.ok(error instanceof LlmJsonDiagnosticError);
    assert.equal(error.diagnostic.stage, "candidate_extraction");
    assert.match(error.message, /No JSON object or array candidate found/);
    return true;
  });
});

test("multiple malformed candidates report bounded parse summaries", () => {
  assert.throws(() => parseLlmJson('{"a":}\n{"b": tru}'), (error: unknown) => {
    assert.ok(error instanceof LlmJsonDiagnosticError);
    assert.equal(error.diagnostic.stage, "candidate_extraction");
    assert.equal(error.diagnostic.candidateSummaries?.length, 2);
    assert.match(error.message, /Candidate 1: parse failed/);
    assert.ok(error.message.length < 700);
    return true;
  });
});

test("parseable extracted JSON still reaches contract validation", () => {
  const parsed = parseHumanTranslationJson('```python\nprint({})\n```\n{"contract_version":1,"items":[{"translations":{}}]}');
  const preview = validateHumanTranslationImport(parsed, []);
  assert.equal(preview.invalid, 1);
  assert.equal(preview.items[0]?.errors[0]?.kind, "item_schema");
  assert.doesNotMatch(preview.items[0]?.errors[0]?.message ?? "", /not valid JSON/i);
});

test("real Paraguay response ignores diagnostic blocks and imports without LLM retry", () => {
  const raw = readFileSync(new URL("./fixtures/paraguay-llm-response-with-blocks.txt", import.meta.url), "utf8");
  const extracted = parseLlmJson(raw);
  assert.ok(extracted.quoteRepairs > 0);
  assert.ok(extracted.text.startsWith("{"));
  assert.doesNotMatch(extracted.text, /Let's diagnose|Length: 13166/);
  let calls = 0;
  const getModelOutput = () => { calls += 1; return raw; };
  const parsed = parseHumanTranslationJson(getModelOutput()) as {
    contract_version: number;
    requested_languages: string[];
    items: Array<{ content_id: string; source_hash: string; source: { content: string }; translations: { en: { content: string }; he: { content: string } } }>;
  };
  assert.equal(parsed.contract_version, 1);
  assert.deepEqual(parsed.requested_languages, ["en", "he"]);
  assert.equal(parsed.items.length, 1);
  const item = parsed.items[0];
  assert.equal(item.content_id, "paraguay-001");
  assert.equal(item.source_hash, buildSourceHash(item.source));
  assert.match(item.source.content, /Звучит немножко как "пара-два-ай", правда\?/);
  assert.match(item.source.content, /его "сердце"|Его "сердце"/);
  assert.match(item.source.content, /называется "калаваса"/);
  assert.match(item.source.content, /через "бомбилью"/);
  assert.match(item.source.content, /Каждая такая "паутинка"/);
  assert.match(item.source.content, /🧑‍⚖️\n/);
  assert.match(item.translations.en.content, /"heart"/);
  assert.match(item.translations.he.content, /"לב"/);
  const sourceItems = [{ contentType: "map_story" as const, contentId: item.content_id, payload: item.source, sourceHash: item.source_hash, characters: item.source.content.length }];
  const preview = validateHumanTranslationImport(parsed, sourceItems);
  assert.equal(preview.ready, 1);
  assert.equal(preview.can_save, true);
  assert.equal(calls, 1);
});

test("extraction plus quote repair avoids a second translation model call", async () => {
  let calls = 0;
  const result = await translateLessonWithRetries({
    lesson: { title: "Урок", steps: [{ text: "Привет", type: "paint" }] },
    sourceLanguage: "ru",
    targetLanguage: "en",
    maxRetries: 2,
    translateFn: async () => {
      calls += 1;
      return '```python\nprint({"example": True})\n```\nResult:\n{"steps_texts":["Hello "friend", then leave"]}\nDone.';
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.equal(calls, 1);
});
