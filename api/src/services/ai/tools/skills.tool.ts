import type { ChatToolCall, CompleteChatRequest } from "@/types/ai.types";

/**
 * The built-in tool through which a model picks a skill itself: the system prompt lists the skills
 * by description only, and the model calls this tool for the instructions of the one it needs
 * before writing its program. Each provider wraps runSkillTool in its own callable type.
 */
export const SKILL_TOOL_NAME = "use_skill";

export const SKILL_TOOL_DESCRIPTION =
  "Returns the instructions for a skill (its API, helper modules, an example program, this chat's files). " +
  "Call it before writing a skill block, with the id of the skill from the skills list.";

/** What a request needs to offer the tool: the skills the model may pick, and their instructions */
export interface SkillToolContext {
  skills: { id: string; name: string }[];
  load: (id: string) => Promise<string>;
}

export function skillToolSchema(context: SkillToolContext) {
  return {
    type: "object" as const,
    properties: {
      skill: {
        type: "string",
        enum: context.skills.map(skill => skill.id),
        description: "The id of the skill",
      },
    },
    required: ["skill"],
  };
}

/**
 * Loads a skill's instructions for the model. A skill answer holds a whole program, and one cut off
 * by the chat's Max Tokens makes no file (continuing it only starts a new block), so the rest of the
 * answer runs with the model's own output limit: the providers read the settings on each call.
 */
export async function runSkillTool(request: CompleteChatRequest, args: Record<string, unknown>): Promise<string> {
  const context = request.skills;
  const id = String(args?.skill ?? "").trim();
  if (!context?.skills.some(skill => skill.id === id)) {
    const known = context?.skills.map(skill => skill.id).join(", ") || "none";
    return `There is no skill "${id}". Skills: ${known}.`;
  }
  if (request.settings) request.settings.maxTokens = undefined;
  return context.load(id);
}

/** What the message keeps of a use_skill result: the instructions are long and can be loaded again */
export const SKILL_TOOL_RESULT_SUMMARY = (id: string) => `Instructions for the skill "${id}" loaded.`;

/** The skill id a use_skill call asked for, from its JSON arguments */
export function skillOfCall(calls: ChatToolCall[] | undefined, callId?: string): string {
  const call = calls?.find(c => c.callId === callId && c.name === SKILL_TOOL_NAME);
  try {
    return String(JSON.parse(call?.args || "{}").skill || "");
  } catch {
    return "";
  }
}

// the opening line of a skill block, complete (so the whole id is there): ```python skill=xlsx file=...
const SKILL_BLOCK_HEADER = /^[ \t]*(?:`{3,}|~{3,})[^\n]*?\bskill=["']?([\w-]+)["']?[^\n]*\n/gm;

/**
 * The first skill whose block an answer has started without loading its instructions (weak models
 * skip use_skill and write from memory), if any.
 */
export function unloadedSkillBlock(
  content: string,
  context: SkillToolContext | undefined,
  loaded: Set<string>
): string | undefined {
  if (!context || !content.includes("skill=")) return undefined;
  for (const match of content.matchAll(SKILL_BLOCK_HEADER)) {
    const id = match[1];
    if (!loaded.has(id) && context.skills.some(skill => skill.id === id)) return id;
  }
  return undefined;
}
