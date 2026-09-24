/** A fenced block the model wrote for a skill: ```python skill=xlsx file=report.xlsx */
export interface SkillBlock {
  /** Position among the skill blocks of the message, stable while the text does not change */
  index: number;
  language: string;
  skillId: string;
  fileName: string;
  code: string;
}

const ATTRIBUTE = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
const OPENING_FENCE = /^(`{3,}|~{3,})(.*)$/;

function parseInfo(info: string): { language: string; attributes: Record<string, string> } {
  const trimmed = info.trim();
  const language = (trimmed.split(/\s+/)[0] || "").toLowerCase();
  const attributes: Record<string, string> = {};
  for (const match of trimmed.slice(language.length).matchAll(ATTRIBUTE)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return { language, attributes };
}

/** A fenced code block as the chat renders it; `closed` is false for one the answer ended inside. */
export interface FencedBlock {
  language: string;
  attributes: Record<string, string>;
  code: string;
  closed: boolean;
}

/**
 * Splits markdown into its fenced code blocks the way the renderer does: a fence closes on a line of
 * the same character at least as long as the one that opened it. An answer that stops mid-block (cut
 * off by the output limit or a content filter) leaves the last block open.
 */
export function scanFencedBlocks(content: string | undefined): FencedBlock[] {
  if (!content) return [];
  const blocks: FencedBlock[] = [];
  let open: { fence: string; info: string; lines: string[] } | undefined;

  for (const line of content.split("\n")) {
    if (!open) {
      const match = line.match(OPENING_FENCE);
      // a backtick fence's info string cannot contain backticks
      if (match && !(match[1][0] === "`" && match[2].includes("`"))) {
        open = { fence: match[1], info: match[2], lines: [] };
      }
      continue;
    }
    const trimmed = line.trimEnd();
    if (trimmed.length >= open.fence.length && trimmed === open.fence[0].repeat(trimmed.length)) {
      blocks.push({ ...parseInfo(open.info), code: open.lines.join("\n"), closed: true });
      open = undefined;
    } else {
      open.lines.push(line);
    }
  }
  if (open) blocks.push({ ...parseInfo(open.info), code: open.lines.join("\n"), closed: false });
  return blocks;
}

const isSkillBlock = (block: FencedBlock) => !!block.attributes.skill && !!block.attributes.file;

/**
 * Finds the complete blocks addressed to a skill. Other code blocks are left alone, and so is a skill
 * block that names no file: there would be nothing to attach.
 */
export function parseSkillBlocks(content: string | undefined): SkillBlock[] {
  return scanFencedBlocks(content)
    .filter(block => block.closed && isSkillBlock(block))
    .map((block, index) => ({
      index,
      language: block.language,
      skillId: block.attributes.skill,
      fileName: block.attributes.file,
      code: block.code,
    }));
}

/** The skill block the answer ended inside, if it did: its program is incomplete and cannot run. */
export function findUnfinishedSkillBlock(
  content: string | undefined
): { skillId: string; fileName: string } | undefined {
  const last = scanFencedBlocks(content).pop();
  return last && !last.closed && isSkillBlock(last)
    ? { skillId: last.attributes.skill, fileName: last.attributes.file }
    : undefined;
}

/**
 * The skill block behind a code block's own Run button. `blockIndex` counts the blocks the chat
 * renders with a header, which are those that name a language.
 */
export function skillBlockAt(
  content: string | undefined,
  blockIndex: number
): { index: number; fileName: string; closed: boolean } | undefined {
  const withLanguage = scanFencedBlocks(content).filter(block => block.language);
  const block = withLanguage[blockIndex];
  if (!block || !isSkillBlock(block)) return undefined;
  const index = withLanguage.slice(0, blockIndex).filter(b => b.closed && isSkillBlock(b)).length;
  return { index, fileName: block.attributes.file, closed: block.closed };
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

// The note the API adds after an answer's generated files, for the model (GENERATED_FILES_NOTE).
// Models sometimes copy it into their own answers, bare or in a code fence.
const GENERATED_FILES_NOTE_RE =
  /^(?:(`{3,}|~{3,})[^\n]*\n)?\[The code in this answer ran in the user's browser and attached:[^\n]*\][ \t]*(?:\n\1[ \t]*$)?\n?/gm;

/** The answer without a copied "files attached" note: the file cards below the answer show that. */
export function stripGeneratedFilesNote(content: string): string {
  if (!content.includes("[The code in this answer ran")) return content;
  return content.replace(GENERATED_FILES_NOTE_RE, "").trimEnd();
}

/**
 * How a skill answer is shown: its code only matters for the file it made, so code blocks start
 * collapsed, and a copied "files attached" note is dropped.
 */
export function withSkillView<T extends { content: string; collapseCodeBlocks?: boolean; linkedMessages?: T[] }>(
  message: T
): T {
  if (!message?.content) return message;
  const content = stripGeneratedFilesNote(message.content);
  // a block still being streamed counts too, so the code is collapsed from its first line
  const collapseCodeBlocks =
    message.collapseCodeBlocks || parseSkillBlocks(content).length > 0 || !!findUnfinishedSkillBlock(content);
  const linkedMessages = message.linkedMessages?.map(withSkillView);
  if (
    content === message.content &&
    collapseCodeBlocks === !!message.collapseCodeBlocks &&
    linkedMessages?.every((m, i) => m === message.linkedMessages![i]) !== false
  ) {
    return message;
  }
  return { ...message, content, collapseCodeBlocks, ...(linkedMessages ? { linkedMessages } : {}) };
}
