import fs from "fs";
import path from "path";
import type { SkillRegistry, SkillRegistryEntry } from "./types";

export type DispatchResult = {
  isMatch: boolean;
  userPrompt: string;
  matchedCommand?: string;
  skill?: SkillRegistryEntry;
  canExecute: boolean;
  refusalReason?: string;
  instructions: string[];
};

export class AIRouter {
  private registryPath: string;

  constructor(customRegistryPath?: string) {
    this.registryPath =
      customRegistryPath ||
      path.join(process.cwd(), ".agents", "registry.json");
  }

  /**
   * Loads the central Skill Registry (.agents/registry.json).
   */
  public loadRegistry(): SkillRegistry {
    if (!fs.existsSync(this.registryPath)) {
      throw new Error(
        `Skill Registry file not found at path: ${this.registryPath}`
      );
    }
    const content = fs.readFileSync(this.registryPath, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Matches a user prompt to a registered skill in registry.json.
   */
  public matchIntent(userPrompt: string): DispatchResult {
    const registry = this.loadRegistry();
    const normalizedPrompt = userPrompt.trim().toLowerCase();

    let matchedSkill: SkillRegistryEntry | null = null;
    let matchedCommand: string | null = null;

    for (const skillKey of Object.keys(registry.skills)) {
      const skill = registry.skills[skillKey];
      for (const command of skill.supportedCommands) {
        if (
          normalizedPrompt.includes(command.toLowerCase()) ||
          command.toLowerCase().includes(normalizedPrompt)
        ) {
          matchedSkill = skill;
          matchedCommand = command;
          break;
        }
      }
      if (matchedSkill) break;
    }

    if (!matchedSkill) {
      return {
        isMatch: false,
        userPrompt,
        canExecute: false,
        refusalReason: `No registered skill matched prompt "${userPrompt}". Refer to .agents/registry.json for supported commands.`,
        instructions: [],
      };
    }

    // Lifecycle check
    const instructions: string[] = [
      `Matched Skill: ${matchedSkill.displayName} (${matchedSkill.id})`,
      `Lifecycle Status: ${matchedSkill.status}`,
      `Mutation Capability: ${matchedSkill.mutation}`,
      `Entry File: ${matchedSkill.entry}`,
      `Contract: ${matchedSkill.contract}`,
    ];

    let canExecute = true;
    let refusalReason: string | undefined;

    if (matchedSkill.mutation !== "NO_WRITE") {
      instructions.push(
        `Mutation Capability is ${matchedSkill.mutation}. Write endpoints require strict owner release authorization.`
      );
    } else {
      instructions.push(
        `Mutation Capability is NO_WRITE. Candidate for Review JSON output allowed. Database write is FORBIDDEN.`
      );
    }

    return {
      isMatch: true,
      userPrompt,
      matchedCommand: matchedCommand || undefined,
      skill: matchedSkill,
      canExecute,
      refusalReason,
      instructions,
    };
  }
}
