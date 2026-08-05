import fs from "fs";
import path from "path";

export type PilotInputObject = {
  map_type: string;
  target_id: string;
  title_ru: string;
  title_en: string;
  title_he?: string;
};

export type BuiltPromptContext = {
  systemPrompt: string;
  userPrompt: string;
  loadedFiles: string[];
};

/**
 * Assembles the full context for Map Content Writer execution by reading
 * SKILL.md and referenced AI-DOCS files without manual duplication.
 */
export function buildMapContentWriterPrompt(
  inputObjects: PilotInputObject[],
  projectRoot: string = process.cwd()
): BuiltPromptContext {
  const loadedFiles: string[] = [];

  const readDoc = (relativePath: string): string => {
    const fullPath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[PromptBuilder] Warning: File not found: ${relativePath}`);
      return `[FILE NOT FOUND: ${relativePath}]`;
    }
    loadedFiles.push(relativePath);
    return fs.readFileSync(fullPath, "utf-8");
  };

  // 1. Read Workspace Skill SKILL.md
  const skillMd = readDoc(".agents/skills/map-content-writer/SKILL.md");

  // 2. Read core contract and specification files
  const contractMd = readDoc("AI-DOCS/skills/map-content-writer/skill-contract.md");
  const workflowMd = readDoc("AI-DOCS/skills/map-content-writer/workflow.md");
  const specMd = readDoc("AI-DOCS/skills/map-content-writer/specification.md");

  // 3. Read quality checklists
  const stopConditionsMd = readDoc("AI-DOCS/skills/map-content-writer/quality/stop-conditions.md");
  const editorialChecklistMd = readDoc("AI-DOCS/skills/map-content-writer/quality/editorial-checklist.md");
  const structuralChecklistMd = readDoc("AI-DOCS/skills/map-content-writer/quality/structural-checklist.md");
  const factualChecklistMd = readDoc("AI-DOCS/skills/map-content-writer/quality/factual-checklist.md");

  // 4. Read specific map-type specification for river
  const riverTypeMd = readDoc("AI-DOCS/skills/map-content-writer/map-types/river.md");

  const systemPrompt = `
YOU ARE EXECUTING THE WORKSPACE SKILL: Map Content Writer v1.0.0.
FOLLOW ALL NORMATIVE RULES IN THE ATTACHED DOCUMENTS STRICTLY.

=== SKILL EXECUTION INSTRUCTIONS (.agents/skills/map-content-writer/SKILL.md) ===
${skillMd}

=== SKILL CONTRACT (AI-DOCS/skills/map-content-writer/skill-contract.md) ===
${contractMd}

=== WORKFLOW & PIPELINE (AI-DOCS/skills/map-content-writer/workflow.md) ===
${workflowMd}

=== TECHNICAL SPECIFICATION (AI-DOCS/skills/map-content-writer/specification.md) ===
${specMd}

=== MAP TYPE SPECIFICATION: RIVER (AI-DOCS/skills/map-content-writer/map-types/river.md) ===
${riverTypeMd}

=== QUALITY CHECKLISTS ===
--- Stop Conditions ---
${stopConditionsMd}

--- Editorial Checklist ---
${editorialChecklistMd}

--- Structural Checklist ---
${structuralChecklistMd}

--- Factual Checklist ---
${factualChecklistMd}
`.trim();

  const userPrompt = `
Process the following input batch of interactive map targets strictly according to the Map Content Writer contract and workflow:

INPUT OBJECTS (BATCH OF ${inputObjects.length}):
${JSON.stringify(inputObjects, null, 2)}

Provide your response according to the output rules of the skill.
`.trim();

  return {
    systemPrompt,
    userPrompt,
    loadedFiles,
  };
}
