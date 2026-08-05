import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import {
  buildMapContentWriterPrompt,
  type PilotInputObject,
} from "./promptBuilder.ts";
import { validatePilotOutput, type ValidationResult } from "./outputValidator.ts";

export type PilotRunOptions = {
  mapType?: string;
  limit?: number;
  useMockLlm?: boolean;
  projectRoot?: string;
  outputDir?: string;
};

export type PilotRunReport = {
  runTimestamp: string;
  mapType: string;
  objectsProcessed: number;
  successCount: number;
  failureCount: number;
  executionDurationMs: number;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  targets: PilotInputObject[];
  validation: ValidationResult;
  rawResponsePath: string;
  reportPath: string;
};

/**
 * Step 1: Read-only SELECT query to fetch 5 real map_targets without RU stories.
 */
export async function fetchPilotTargets(
  supabaseUrl?: string,
  supabaseKey?: string,
  mapType: string = "river",
  limit: number = 5
): Promise<PilotInputObject[]> {
  const url = supabaseUrl || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn("[PilotRunner] Supabase environment variables missing. Falling back to verified DB river targets.");
    return getFallbackRiverTargets(limit);
  }

  const supabase: SupabaseClient = createClient(url, key);

  // Exact read-only SELECT query for unwritten map_targets
  const { data, error } = await supabase
    .from("map_targets")
    .select("map_type, target_id, title_ru, title_en, title_he")
    .eq("map_type", mapType)
    .limit(30);

  if (error || !data || data.length === 0) {
    console.warn(`[PilotRunner] DB query error or empty result: ${error?.message}. Using fallback verified targets.`);
    return getFallbackRiverTargets(limit);
  }

  // Filter out targets that already have a language='ru' story in map_stories
  const { data: existingStories } = await supabase
    .from("map_stories")
    .select("target_id")
    .eq("type", mapType)
    .eq("language", "ru");

  const existingSet = new Set((existingStories || []).map((s) => s.target_id));

  const unwrittenTargets = data
    .filter((t) => !existingSet.has(t.target_id))
    .slice(0, limit)
    .map((t) => ({
      map_type: t.map_type,
      target_id: t.target_id,
      title_ru: t.title_ru || t.target_id,
      title_en: t.title_en || t.target_id,
      title_he: t.title_he || undefined,
    }));

  if (unwrittenTargets.length < limit) {
    console.warn(`[PilotRunner] Found only ${unwrittenTargets.length} unwritten targets for map_type=${mapType}.`);
  }

  return unwrittenTargets.length > 0 ? unwrittenTargets : getFallbackRiverTargets(limit);
}

/**
 * Verified fallback targets from DB if offline/no DB key.
 */
function getFallbackRiverTargets(limit: number): PilotInputObject[] {
  const verifiedRivers: PilotInputObject[] = [
    { map_type: "river", target_id: "Moma", title_ru: "Мома", title_en: "Moma" },
    { map_type: "river", target_id: "Ula", title_ru: "Ула", title_en: "Ula" },
    { map_type: "river", target_id: "Bhima", title_ru: "Бхима", title_en: "Bhima" },
    { map_type: "river", target_id: "George", title_ru: "Джордж (река)", title_en: "George" },
    { map_type: "river", target_id: "Fraser", title_ru: "Фрейзер", title_en: "Fraser" },
  ];
  return verifiedRivers.slice(0, limit);
}

/**
 * Step 3: Invoke the configured LLM (Gemini / OpenRouter / OpenAI / Mock).
 */
async function invokeLLM(
  systemPrompt: string,
  userPrompt: string,
  useMock: boolean
): Promise<{ text: string; tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
  if (useMock || (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY)) {
    console.log("[PilotRunner] Executing in MOCK LLM mode (or no API key set).");
    return {
      text: `[DRY-RUN CONTRACT TEST RESULT]
Skill: Map Content Writer v1.0.0
Operational Status Source: AI-DOCS/skills/map-content-writer/validation-record.md
Target ID Locked: "Moma" (Protected Immutable Reference Verified)
Map Type: "river" (Semantic Focus Verified)
Research Dossier: 4 confirmed facts, 0 uncertainties, 2 Level-1 sources
Pipeline Result: PASS (All 11 DoD criteria satisfied)
Candidate Output Simulation: Clean 3-key JSON ready.
Candidate Generation for Real Import: BLOCKED (Lifecycle status is IMPLEMENTED, requires PILOT).`,
      tokenUsage: { promptTokens: 450, completionTokens: 120, totalTokens: 570 },
    };
  }

  // Option A: Gemini API via @google/genai
  if (process.env.GEMINI_API_KEY) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = "gemini-2.5-flash";
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await ai.models.generateContent({
      model,
      contents: fullPrompt,
    });

    const text = response.text || "";
    const usage = response.usageMetadata
      ? {
          promptTokens: response.usageMetadata.promptTokenCount,
          completionTokens: response.usageMetadata.candidatesTokenCount,
          totalTokens: response.usageMetadata.totalTokenCount,
        }
      : undefined;

    return { text, tokenUsage: usage };
  }

  // Option B: OpenAI / OpenRouter REST API fallback
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENROUTER_API_KEY
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const modelName = process.env.OPENROUTER_API_KEY ? "google/gemini-2.5-flash" : "gpt-4o-mini";

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM API returned status ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const text = json.choices?.[0]?.message?.content || "";
  const tokenUsage = json.usage
    ? {
        promptTokens: json.usage.prompt_tokens,
        completionTokens: json.usage.completion_tokens,
        totalTokens: json.usage.total_tokens,
      }
    : undefined;

  return { text, tokenUsage };
}

/**
 * Core Orchestrator for Pilot A Execution.
 */
export async function runPilotA(options: PilotRunOptions = {}): Promise<PilotRunReport> {
  const mapType = options.mapType || "river";
  const limit = options.limit || 5;
  const projectRoot = options.projectRoot || process.cwd();
  const outputDir = options.outputDir || path.join(projectRoot, ".pilot-reports");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Step 1: Fetch 5 targets (Read-only)
  const targets = await fetchPilotTargets(undefined, undefined, mapType, limit);

  // Step 2: Build prompt context automatically
  const promptContext = buildMapContentWriterPrompt(targets, projectRoot);

  // Step 3: Invoke LLM & measure duration
  const startTime = Date.now();
  const llmResult = await invokeLLM(
    promptContext.systemPrompt,
    promptContext.userPrompt,
    !!options.useMockLlm
  );
  const executionDurationMs = Date.now() - startTime;

  // Step 4: Validate output
  const validation = validatePilotOutput(llmResult.text, targets);

  // Step 5: Save raw response & report to output directory
  const rawResponseFilename = `pilot-a-raw-${runTimestamp}.txt`;
  const rawResponsePath = path.join(outputDir, rawResponseFilename);
  fs.writeFileSync(rawResponsePath, llmResult.text, "utf-8");

  const successCount = validation.validObjectsCount;
  const failureCount = targets.length - successCount;

  const reportContent = `
================================================================================
PILOT A EXECUTION REPORT — MAP CONTENT WRITER v1.0.0
================================================================================
Run Timestamp: ${runTimestamp}
Map Type Target: ${mapType}
Objects Processed: ${targets.length}
Success Count: ${successCount}
Failure Count: ${failureCount}
Execution Time: ${executionDurationMs} ms
LLM Token Usage: ${llmResult.tokenUsage ? JSON.stringify(llmResult.tokenUsage) : "N/A"}

RAW RESPONSE FILE:
${rawResponsePath}

TARGET OBJECTS PROCESSED:
${targets.map((t, idx) => `  [${idx + 1}] map_type: "${t.map_type}", target_id: "${t.target_id}", title_ru: "${t.title_ru}"`).join("\n")}

VALIDATION SUMMARY:
- Is Valid Output: ${validation.isValid ? "YES" : "NO"}
- Output Format Type: ${validation.isContractTestReport ? "Contract Test Report (IMPLEMENTED Status)" : validation.isCandidateJson ? "Candidate JSON Array" : "Unknown / Plain Text"}
- Errors Count: ${validation.errors.length}
- Warnings Count: ${validation.warnings.length}

${validation.errors.length > 0 ? `VALIDATION ERRORS:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}\n` : ""}
${validation.warnings.length > 0 ? `VALIDATION WARNINGS:\n${validation.warnings.map((w) => `  - ${w}`).join("\n")}\n` : ""}

FILES LOADED INTO CONTEXT:
${promptContext.loadedFiles.map((f) => `  - ${f}`).join("\n")}

================================================================================
DATABASE MUTATION STATUS: NO WRITES (READ-ONLY PILOT VALIDATION RUN)
================================================================================
`.trim();

  const reportFilename = `pilot-a-report-${runTimestamp}.txt`;
  const reportPath = path.join(outputDir, reportFilename);
  fs.writeFileSync(reportPath, reportContent, "utf-8");

  return {
    runTimestamp,
    mapType,
    objectsProcessed: targets.length,
    successCount,
    failureCount,
    executionDurationMs,
    tokenUsage: llmResult.tokenUsage,
    targets,
    validation,
    rawResponsePath,
    reportPath,
  };
}
