/** Normalize JSON formatting artifacts without touching quoted keys or values. */
export function normalizeLlmJson(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  const counts: Record<string, number> = {};

  for (const character of input) {
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }

    const category = character === "\u00a0" ? "NBSP"
      : character === "\u202f" ? "NARROW_NBSP"
      : character === "\u2007" ? "FIGURE_SPACE"
      : character === "\ufeff" ? "BOM"
      : character === "\u200b" ? "ZERO_WIDTH_SPACE"
      : null;
    if (category === null) {
      output += character;
      continue;
    }
    counts[category] = (counts[category] ?? 0) + 1;
    if (category !== "BOM" && category !== "ZERO_WIDTH_SPACE") output += " ";
  }

  if (Object.keys(counts).length > 0 && process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEBUG_GENERATION === "true") {
    console.debug(`[llm-json] normalized: ${Object.entries(counts).map(([name, count]) => `${name}=${count}`).join(", ")}`);
  }
  return output;
}

/** Convert curly delimiters only for JSON object keys, never inside ASCII-quoted values. */
function normalizeSmartKeyQuotes(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  let count = 0;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === "\u201c" && /[{,]\s*$/.test(output)) {
      const end = input.indexOf("\u201d", index + 1);
      if (end > index && input.slice(end + 1).match(/^\s*:/) && !/["\\\r\n]/.test(input.slice(index + 1, end))) {
        output += `"${input.slice(index + 1, end)}"`;
        index = end;
        count += 1;
        continue;
      }
    }
    output += character;
  }
  if (count > 0 && process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEBUG_GENERATION === "true") {
    console.debug(`[llm-json] normalized smart key quotes: ${count}`);
  }
  return output;
}

type Frame =
  | { kind: "object"; state: "keyOrEnd" | "colon" | "value" | "commaOrEnd" }
  | { kind: "array"; state: "valueOrEnd" | "commaOrEnd" };

export type LlmJsonDiagnostic = {
  stage: "candidate_extraction" | "initial_parse" | "repaired_parse" | "schema_validation";
  message: string;
  initialParseMessage?: string;
  repairedParseMessage?: string;
  position?: number;
  line?: number;
  column?: number;
  snippet?: string;
  pointerOffset?: number;
  repairCount?: number;
  validationIssues?: Array<{ path: string; message: string }>;
  candidateSummaries?: Array<{ index: number; length: number; status: string; snippet: string }>;
};

export class LlmJsonDiagnosticError extends SyntaxError {
  readonly diagnostic: LlmJsonDiagnostic;

  constructor(diagnostic: LlmJsonDiagnostic) {
    super(formatLlmJsonDiagnostic(diagnostic));
    this.name = "LlmJsonDiagnosticError";
    this.diagnostic = diagnostic;
  }
}

export function formatJsonPath(path: Array<string | number>): string {
  return path.reduce<string>((result, segment) =>
    typeof segment === "number" ? `${result}[${segment}]` : result ? `${result}.${segment}` : segment, "");
}

function parseErrorPosition(text: string, message: string): number | undefined {
  const offset = message.match(/\bposition\s+(\d+)\b/i);
  if (offset) return Math.min(Number(offset[1]), text.length);
  const location = message.match(/\bline\s+(\d+)\s+column\s+(\d+)\b/i);
  if (location) {
    const targetLine = Number(location[1]);
    const targetColumn = Number(location[2]);
    if (targetLine >= 1 && targetColumn >= 1) {
      let line = 1;
      let cursor = 0;
      while (line < targetLine && cursor < text.length) {
        if (text[cursor] === "\n") line += 1;
        cursor += 1;
      }
      if (line === targetLine) return Math.min(cursor + targetColumn - 1, text.length);
    }
  }
  if (/unexpected end|unterminated/i.test(message)) return text.length;
  return undefined;
}

function snippetAt(text: string, position: number | undefined): Pick<LlmJsonDiagnostic, "snippet" | "pointerOffset"> {
  const visible = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, (character) =>
    character === "\u007f" ? "␡" : String.fromCharCode(0x2400 + character.charCodeAt(0)));
  if (position === undefined) {
    const start = text.slice(0, 140);
    const end = text.length > 280 ? text.slice(-140) : text.slice(140);
    return { snippet: visible(`${start}${text.length > 280 ? " … " : ""}${end}`) };
  }
  const start = Math.max(0, position - 140);
  const end = Math.min(text.length, position + 140);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return {
    snippet: `${prefix}${visible(text.slice(start, end))}${suffix}`,
    pointerOffset: prefix.length + position - start,
  };
}

function parseDiagnostic(text: string, error: SyntaxError, stage: "initial_parse" | "repaired_parse", initialError?: SyntaxError, repairCount = 0): LlmJsonDiagnostic {
  const position = parseErrorPosition(text, error.message);
  const before = position === undefined ? undefined : text.slice(0, position);
  const line = before === undefined ? undefined : before.split("\n").length;
  const column = before === undefined ? undefined : position! - before.lastIndexOf("\n");
  return {
    stage,
    message: error.message,
    initialParseMessage: initialError?.message ?? error.message,
    repairedParseMessage: stage === "repaired_parse" ? error.message : undefined,
    position,
    line,
    column,
    ...snippetAt(text, position),
    repairCount: stage === "repaired_parse" ? repairCount : undefined,
  };
}

export function diagnoseJsonParseError(text: string, error: unknown): LlmJsonDiagnostic {
  const syntaxError = error instanceof SyntaxError ? error
    : new SyntaxError(error instanceof Error ? error.message : "Unable to parse JSON.");
  return parseDiagnostic(text, syntaxError, "initial_parse");
}

export function formatLlmJsonDiagnostic(diagnostic: LlmJsonDiagnostic): string {
  if (diagnostic.stage === "schema_validation") {
    const issues = diagnostic.validationIssues?.slice(0, 5).map((issue) => `${issue.path || "payload"}: ${issue.message}`) ?? [];
    return ["JSON is syntactically valid, but contract validation failed.", ...issues].join("\n");
  }
  if (diagnostic.stage === "candidate_extraction") {
    return [diagnostic.message, ...(diagnostic.candidateSummaries ?? []).map((candidate) =>
      `Candidate ${candidate.index}: ${candidate.status}, length ${candidate.length}; ${candidate.snippet}`)].join("\n");
  }
  const lines = ["The pasted text is not valid JSON."];
  if (diagnostic.stage === "repaired_parse") {
    lines.push(`JSON parse still failed after deterministic repair${diagnostic.repairCount === undefined ? "" : ` (${diagnostic.repairCount} quote repairs)`}.`);
    lines.push(`Initial JSON.parse: ${diagnostic.initialParseMessage ?? "Unknown syntax error."}`);
    lines.push(`Repaired JSON.parse: ${diagnostic.repairedParseMessage ?? diagnostic.message}`);
  } else {
    lines.push("Initial JSON parse failed.");
    lines.push(`JSON.parse: ${diagnostic.message}`);
  }
  if (diagnostic.line !== undefined && diagnostic.column !== undefined) {
    lines.push(`Line ${diagnostic.line}, column ${diagnostic.column}${diagnostic.position !== undefined ? ` (position ${diagnostic.position})` : ""}`);
  }
  if (diagnostic.snippet) {
    lines.push(diagnostic.snippet);
    if (diagnostic.pointerOffset !== undefined) lines.push(`${" ".repeat(diagnostic.pointerOffset)}^`);
  }
  return lines.join("\n");
}

type JsonCandidate = { text: string; start: number; language: string | null };

/** Keep non-JSON fenced code out of the candidate search; JSON and plain prose remain searchable. */
function candidateRegions(input: string): Array<{ start: number; end: number; language: string | null }> {
  const regions: Array<{ start: number; end: number; language: string | null }> = [];
  const fences = /^[ \t]*```([^\r\n`]*)\r?\n|^[ \t]*```[ \t]*(?:\r?\n|$)/gm;
  let cursor = 0;
  let open: { start: number; language: string } | null = null;
  for (const match of input.matchAll(fences)) {
    const offset = match.index;
    if (!open) {
      if (offset > cursor) regions.push({ start: cursor, end: offset, language: null });
      open = { start: offset + match[0].length, language: (match[1] ?? "").trim().toLowerCase() };
    } else {
      regions.push({ start: open.start, end: offset, language: open.language });
      open = null;
      cursor = offset + match[0].length;
    }
  }
  if (open) {
    regions.push({ start: open.start, end: input.length, language: open.language });
  } else if (cursor < input.length) {
    regions.push({ start: cursor, end: input.length, language: null });
  }
  return regions;
}

/** Find one balanced root, observing JSON strings and escaped backslashes. Syntax is checked later. */
function balancedEnd(input: string, start: number, limit: number): number | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let cursor = start; cursor < limit; cursor += 1) {
    const character = input[cursor];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      if (stack.pop() !== (character === "}" ? "{" : "[")) return null;
      if (stack.length === 0) return cursor + 1;
    }
  }
  return null;
}

function findJsonCandidates(input: string): JsonCandidate[] {
  const candidates: JsonCandidate[] = [];
  let inspectedRoots = 0;
  for (const region of candidateRegions(input)) {
    for (let cursor = region.start; cursor < region.end && candidates.length < 64 && inspectedRoots < 256; cursor += 1) {
      if (input[cursor] !== "{" && input[cursor] !== "[") continue;
      inspectedRoots += 1;
      const end = balancedEnd(input, cursor, region.end);
      if (end === null) continue;
      candidates.push({ text: input.slice(cursor, end), start: cursor, language: region.language });
      cursor = end - 1;
    }
  }
  return candidates;
}

function nextSignificant(text: string, index: number): number {
  while (index < text.length && /[ \t\r\n]/.test(text[index])) index += 1;
  return index;
}

function hasFollowingObjectKey(text: string, index: number): boolean {
  let cursor = nextSignificant(text, index);
  if (text[cursor] !== '"') return false;
  cursor += 1;
  let escaped = false;
  for (; cursor < text.length; cursor += 1) {
    if (escaped) {
      escaped = false;
    } else if (text[cursor] === "\\") {
      escaped = true;
    } else if (text[cursor] === '"') {
      const colon = nextSignificant(text, cursor + 1);
      return text[colon] === ":" && isJsonValueStart(text, nextSignificant(text, colon + 1));
    }
  }
  return false;
}

function isJsonValueStart(text: string, index: number): boolean {
  const character = text[index];
  return character === '"' || character === "{" || character === "[" || character === "-" || /[0-9]/.test(character ?? "")
    || ["true", "false", "null"].some((literal) => text.startsWith(literal, index));
}

function hasFollowingArrayValue(text: string, index: number): boolean {
  const cursor = nextSignificant(text, index);
  const character = text[cursor];
  if (character === '"') {
    let escaped = false;
    for (let position = cursor + 1; position < text.length; position += 1) {
      if (escaped) escaped = false;
      else if (text[position] === "\\") escaped = true;
      else if (text[position] === '"') {
        const after = text[nextSignificant(text, position + 1)];
        return after === "," || after === "]";
      }
    }
    return false;
  }
  if (character === "{" || character === "[") return true;
  if (character === "-" || /[0-9]/.test(character ?? "")) {
    const number = text.slice(cursor).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!number) return false;
    const after = text[nextSignificant(text, cursor + number[0].length)];
    return after === "," || after === "]";
  }
  for (const literal of ["true", "false", "null"]) {
    if (text.startsWith(literal, cursor)) {
      const after = text[nextSignificant(text, cursor + literal.length)];
      return after === "," || after === "]";
    }
  }
  return false;
}

function hasStructuralClose(text: string, index: number, frames: Frame[]): boolean {
  let cursor = index;
  for (let depth = frames.length - 1; depth >= 0; depth -= 1) {
    const frame = frames[depth];
    if (text[cursor] !== (frame.kind === "object" ? "}" : "]")) return false;
    cursor = nextSignificant(text, cursor + 1);
    if (depth === 0) return cursor === text.length;
    const parent = frames[depth - 1];
    if (text[cursor] === ",") {
      return parent.kind === "object"
        ? hasFollowingObjectKey(text, cursor + 1)
        : hasFollowingArrayValue(text, cursor + 1);
    }
  }
  return false;
}

function repairUnescapedValueQuotes(text: string): { text: string; count: number } {
  const frames: Frame[] = [];
  let rootState: "value" | "done" = "value";
  let inString = false;
  let escaped = false;
  let inPrimitive = false;
  let stringRole: "key" | "value" = "value";
  let count = 0;
  let output = "";

  const consumeValue = () => {
    const frame = frames.at(-1);
    if (!frame) rootState = "done";
    else frame.state = "commaOrEnd";
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        output += character;
        escaped = false;
        continue;
      }
      if (character === "\\") {
        output += character;
        escaped = true;
        continue;
      }
      if (character !== '"') {
        output += character;
        continue;
      }

      const next = nextSignificant(text, index + 1);
      const following = text[next];
      const parent = frames.at(-1);
      const closesKey = stringRole === "key" && following === ":";
      const closesValue = stringRole === "value" && (
        !parent ? next === text.length
          : parent.kind === "array" ? (following === "]" && hasStructuralClose(text, next, frames)) || (following === "," && hasFollowingArrayValue(text, next + 1))
            : (following === "}" && hasStructuralClose(text, next, frames)) || (following === "," && hasFollowingObjectKey(text, next + 1))
      );
      if (!closesKey && !closesValue) {
        if (stringRole === "key") return { text, count: 0 };
        output += '\\"';
        count += 1;
        continue;
      }
      output += character;
      inString = false;
      if (stringRole === "key") {
        if (parent?.kind === "object") parent.state = "colon";
      } else consumeValue();
      continue;
    }

    if (inPrimitive && (character === "," || character === "}" || character === "]" || /[ \t\r\n]/.test(character))) {
      inPrimitive = false;
    }
    if (inPrimitive) {
      output += character;
      continue;
    }
    const frame = frames.at(-1);
    if (character === '"') {
      if (frame?.kind === "object" && frame.state === "keyOrEnd") stringRole = "key";
      else if ((!frame && rootState === "value") || frame?.state === "value" || (frame?.kind === "array" && frame.state === "valueOrEnd")) stringRole = "value";
      else return { text, count: 0 };
      inString = true;
    } else if (character === "{" || character === "[") {
      consumeValue();
      frames.push(character === "{" ? { kind: "object", state: "keyOrEnd" } : { kind: "array", state: "valueOrEnd" });
    } else if (character === "}" || character === "]") {
      frames.pop();
    } else if (character === ":") {
      if (frame?.kind === "object" && frame.state === "colon") frame.state = "value";
    } else if (character === ",") {
      if (frame?.kind === "object" && frame.state === "commaOrEnd") frame.state = "keyOrEnd";
      else if (frame?.kind === "array" && frame.state === "commaOrEnd") frame.state = "valueOrEnd";
    } else if (!/[ \t\r\n]/.test(character) && ((!frame && rootState === "value") || frame?.state === "value" || (frame?.kind === "array" && frame.state === "valueOrEnd"))) {
      consumeValue();
      inPrimitive = true;
    }
    output += character;
  }
  return { text: output, count };
}

type ParsedJson = { value: unknown; text: string; changed: boolean; quoteRepairs: number };

/** Parse once unchanged; on syntax failure, try one bounded quote repair. */
function parseCandidate(input: string): ParsedJson {
  const normalized = normalizeSmartKeyQuotes(normalizeLlmJson(input));
  try {
    return { value: JSON.parse(normalized), text: normalized, changed: normalized !== input, quoteRepairs: 0 };
  } catch (initialError) {
    if (!(initialError instanceof SyntaxError)) throw initialError;
    const repaired = repairUnescapedValueQuotes(normalized);
    if (repaired.count === 0) throw new LlmJsonDiagnosticError(parseDiagnostic(normalized, initialError, "initial_parse"));
    let value: unknown;
    try {
      value = JSON.parse(repaired.text);
    } catch (repairedError) {
      if (!(repairedError instanceof SyntaxError)) throw repairedError;
      throw new LlmJsonDiagnosticError(parseDiagnostic(repaired.text, repairedError, "repaired_parse", initialError, repaired.count));
    }
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEBUG_GENERATION === "true") {
      console.debug(`[llm-json] quote repair applied: ${repaired.count}`);
    }
    return { value, text: repaired.text, changed: true, quoteRepairs: repaired.count };
  }
}

export type LlmJsonParseOptions = { isExpectedShape?: (value: unknown) => boolean };

function looksLikeTranslationContract(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && "contract_version" in value && "items" in value && Array.isArray(value.items);
}

/** Extract balanced JSON roots before normalization, parsing, and local quote repair. */
export function parseLlmJson(input: string, options: LlmJsonParseOptions = {}): ParsedJson {
  const trimmed = input.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return parseCandidate(input);
    } catch (error) {
      if (!(error instanceof LlmJsonDiagnosticError)) throw error;
      // A complete-looking root may contain trailing prose or other candidates.
    }
  }
  const candidates = findJsonCandidates(input);
  if (candidates.length === 0) {
    // Preserve the original syntax diagnostic for a root that starts as JSON but is unbalanced.
    if (/^\s*[{["\d-]|^\s*(?:true|false|null)\s*$/.test(input)) return parseCandidate(input);
    throw new LlmJsonDiagnosticError({
      stage: "candidate_extraction",
      message: "No JSON object or array candidate found in LLM response.",
      ...snippetAt(input, undefined),
    });
  }

  const attempts = candidates.map((candidate, index) => {
    try {
      const parsed = parseCandidate(candidate.text);
      return { candidate, index, parsed, expected: options.isExpectedShape?.(parsed.value) ?? looksLikeTranslationContract(parsed.value), error: null };
    } catch (error) {
      return { candidate, index, parsed: null, expected: false, error };
    }
  });
  const eligibleAttempts = attempts.filter((attempt) =>
    attempt.candidate.language === null || attempt.candidate.language === "" || attempt.candidate.language === "json" || attempt.expected);
  if (eligibleAttempts.length === 0) {
    throw new LlmJsonDiagnosticError({
      stage: "candidate_extraction",
      message: "No JSON object or array candidate found in LLM response.",
      ...snippetAt(input, undefined),
    });
  }
  const successful = eligibleAttempts.filter((attempt): attempt is typeof attempt & { parsed: ParsedJson } => attempt.parsed !== null);
  if (successful.length > 0) {
    successful.sort((left, right) =>
      Number(right.expected) - Number(left.expected)
      || Number(right.candidate.language === "json") - Number(left.candidate.language === "json")
      || right.candidate.text.length - left.candidate.text.length);
    const best = successful[0];
    return { ...best.parsed, changed: best.parsed.changed || best.candidate.text !== input };
  }

  if (eligibleAttempts.length === 1 && eligibleAttempts[0].error instanceof LlmJsonDiagnosticError) throw eligibleAttempts[0].error;
  const candidateSummaries = eligibleAttempts.map((attempt) => ({
    index: attempt.index + 1,
    length: attempt.candidate.text.length,
    status: attempt.error instanceof LlmJsonDiagnosticError
      ? `parse failed${attempt.error.diagnostic.position === undefined ? "" : ` at position ${attempt.error.diagnostic.position}`}`
      : "parse failed",
    snippet: snippetAt(attempt.candidate.text, attempt.error instanceof LlmJsonDiagnosticError ? attempt.error.diagnostic.position : undefined).snippet ?? "",
  }));
  throw new LlmJsonDiagnosticError({
    stage: "candidate_extraction",
    message: `Found ${eligibleAttempts.length} JSON candidates; none could be parsed after deterministic repair.`,
    candidateSummaries,
  });
}
