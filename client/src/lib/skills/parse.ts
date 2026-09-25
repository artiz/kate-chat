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

const isSkillBlock = (block: Pick<FencedBlock, "attributes">) => !!block.attributes.skill && !!block.attributes.file;

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
 * The answer as the chat shows it: without its skill blocks, whose code only matters for the file it
 * made (the file card under the answer runs it again, and the message details show it). A block
 * still being streamed goes as soon as its header names a skill, so the code never flashes up.
 */
export function withoutSkillBlocks(content: string): string {
  const shown: string[] = [];
  let open: { fence: string; info: string; lines: string[] } | undefined;

  for (const line of content.split("\n")) {
    if (!open) {
      const match = line.match(OPENING_FENCE);
      if (match && !(match[1][0] === "`" && match[2].includes("`"))) {
        open = { fence: match[1], info: match[2], lines: [line] };
      } else {
        shown.push(line);
      }
      continue;
    }
    open.lines.push(line);
    const trimmed = line.trimEnd();
    if (trimmed.length >= open.fence.length && trimmed === open.fence[0].repeat(trimmed.length)) {
      if (!isSkillBlock(parseInfo(open.info))) shown.push(...open.lines);
      open = undefined;
    }
  }
  // the answer ends inside this block: a skill one, or a header still being written
  if (open && !parseInfo(open.info).attributes.skill && open.lines.length > 1) shown.push(...open.lines);

  const text = shown.join("\n");
  return text === content ? content : text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * How a skill answer is shown: without its skill blocks (see withoutSkillBlocks) and without a copied
 * "files attached" note. The content keeps the blocks, for the file cards and the details; the html
 * `render` makes of the rest is what the chat shows.
 */
export function withSkillView<T extends { content: string; html?: string[]; linkedMessages?: T[] }>(
  message: T,
  render: (markdown: string) => string[]
): T {
  if (!message?.content) return message;
  const content = stripGeneratedFilesNote(message.content);
  const shown = withoutSkillBlocks(content);
  const linkedMessages = message.linkedMessages?.map(linked => withSkillView(linked, render));
  const changed = content !== message.content || shown !== content;
  if (!changed && linkedMessages?.every((m, i) => m === message.linkedMessages![i]) !== false) {
    return message;
  }
  return {
    ...message,
    content,
    ...(changed ? { html: render(shown) } : {}),
    ...(linkedMessages ? { linkedMessages } : {}),
  };
}

const FENCE_RUNTIME: Record<string, "python" | "typescript"> = {
  python: "python",
  py: "python",
  typescript: "typescript",
  ts: "typescript",
  javascript: "typescript",
  js: "typescript",
};

/**
 * A note for a failed run whose block is marked in another language than the skill runs: models
 * sometimes write TypeScript for a Python skill. The runner goes by the skill, so a block that is
 * only mislabelled still runs; this is added only when the run fails, for the user and "Ask to fix".
 */
export function languageMismatchNote(
  block: { language: string; skillId: string },
  skill: { runtime: "python" | "typescript" }
): string | undefined {
  const written = FENCE_RUNTIME[block.language.toLowerCase()];
  if (!written || written === skill.runtime) return undefined;
  const name = (runtime: string) => (runtime === "python" ? "Python" : "TypeScript");
  return `This block is written as ${name(written)}, but the "${block.skillId}" skill runs ${name(skill.runtime)} programs: rewrite it in ${name(skill.runtime)} under the header \`\`\`${skill.runtime} skill=${block.skillId} file=<file name>.`;
}
