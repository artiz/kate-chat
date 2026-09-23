/** A fenced block the model wrote for a skill: ```python skill=xlsx file=report.xlsx */
export interface SkillBlock {
  /** Position among the skill blocks of the message, stable while the text does not change */
  index: number;
  language: string;
  skillId: string;
  fileName: string;
  code: string;
}

// An opening fence of three or more backticks, its info string, the body, and the same fence closing it
const FENCE = /^(`{3,})([^\n`]*)\n([\s\S]*?)\n\1[ \t]*$/gm;
const ATTRIBUTE = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;

function parseInfo(info: string): { language: string; attributes: Record<string, string> } {
  const trimmed = info.trim();
  const language = (trimmed.split(/\s+/)[0] || "").toLowerCase();
  const attributes: Record<string, string> = {};
  for (const match of trimmed.slice(language.length).matchAll(ATTRIBUTE)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return { language, attributes };
}

/**
 * Finds the blocks addressed to a skill. Other code blocks are left alone, and so is a skill block
 * that names no file: there would be nothing to attach.
 */
export function parseSkillBlocks(content: string | undefined): SkillBlock[] {
  if (!content) return [];
  const blocks: SkillBlock[] = [];
  for (const match of content.matchAll(FENCE)) {
    const { language, attributes } = parseInfo(match[2]);
    if (!attributes.skill || !attributes.file) continue;
    blocks.push({
      index: blocks.length,
      language,
      skillId: attributes.skill,
      fileName: attributes.file,
      code: match[3],
    });
  }
  return blocks;
}

/**
 * The name the server stores a generated file under (see normalizeGeneratedFileName in the API):
 * the base name with unusual characters replaced. Used to find a block's file again after a reload.
 */
export function normalizeFileName(name: string): string {
  const base = (name.replace(/\\/g, "/").split("/").pop() || "").trim();
  return base
    .replace(/[^\p{L}\p{N}._ ()-]/gu, "_")
    .replace(/\s+/g, " ")
    .slice(-120);
}
