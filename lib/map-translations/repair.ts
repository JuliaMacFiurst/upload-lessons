export type TranslationJsonRepairResult =
  | { ok: true; text: string; changed: boolean }
  | { ok: false };

function unwrapPayload(raw: string): TranslationJsonRepairResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false };
  const fenced = trimmed.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  if (fenced) return { ok: true, text: fenced[1].trim(), changed: true };
  if (trimmed.includes("```")) return { ok: false };
  if (/}\s*{/.test(trimmed)) return { ok: false };
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return { ok: true, text: trimmed, changed: trimmed !== raw };
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first < 0 || last <= first) return { ok: false };
  const before = trimmed.slice(0, first);
  const after = trimmed.slice(last + 1);
  if (/[{}]/.test(before) || /[{}]/.test(after)) return { ok: false };
  const candidate = trimmed.slice(first, last + 1);
  // More than one apparent root object is ambiguous and must not be guessed at.
  return { ok: true, text: candidate, changed: true };
}

function repairContentValue(text: string, start: number): { ok: true; text: string; end: number; changed: boolean } | { ok: false } {
  let output = "";
  let changed = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") {
      if (index + 1 >= text.length) return { ok: false };
      output += character + text[index + 1];
      index += 1;
      continue;
    }
    if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      output += "\\n";
      changed = true;
      continue;
    }
    if (character === "\t") {
      output += "\\t";
      changed = true;
      continue;
    }
    if (character !== '"') {
      if (character.charCodeAt(0) < 0x20) return { ok: false };
      output += character;
      continue;
    }

    const tail = text.slice(index + 1);
    if (/^[ \t\r\n]*}/.test(tail)) {
      return { ok: true, text: output, end: index, changed };
    }
    const nextMeaningful = tail.match(/\S/)?.[0];
    // These characters can denote JSON structure, so treating the quote as prose would be guessing.
    if (!nextMeaningful || [",", "]", ":", "}"].includes(nextMeaningful)) return { ok: false };
    output += '\\"';
    changed = true;
  }
  return { ok: false };
}

export function repairTranslationJsonInput(raw: string): TranslationJsonRepairResult {
  const unwrapped = unwrapPayload(raw);
  if (!unwrapped.ok) return unwrapped;
  let text = unwrapped.text;
  let changed = unwrapped.changed;
  const contentStart = /"(?:en|he)"\s*:\s*\{\s*"content"\s*:\s*"/g;
  let match: RegExpExecArray | null;
  while ((match = contentStart.exec(text)) !== null) {
    const valueStart = match.index + match[0].length;
    const repaired = repairContentValue(text, valueStart);
    if (!repaired.ok) return { ok: false };
    if (repaired.changed) {
      text = text.slice(0, valueStart) + repaired.text + text.slice(repaired.end);
      changed = true;
      contentStart.lastIndex = valueStart + repaired.text.length + 1;
    } else {
      contentStart.lastIndex = repaired.end + 1;
    }
  }
  return { ok: true, text, changed };
}
