import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { createLogger } from "@/utils/logger";
import type { ChatSettings } from "@/entities/Chat";
import { SKILL_TOOL_NAME, SkillToolContext } from "@/services/ai/tools/skills.tool";

const logger = createLogger(__filename);

/**
 * A skill teaches the model to produce a kind of file (a deck, a PDF, a spreadsheet) by writing a
 * program. The program never runs here: the model writes it into its answer, and the user's
 * browser runs it in a sandbox with the packages the skill names. What the server holds is only
 * the skill itself, read from resources/skills/<id>/:
 *
 *   SKILL.md   frontmatter (name, description, runtime, packages) and the instructions the model gets
 *   scripts/   optional helper modules the program may import, .py for Python, .js (ESM) for TypeScript
 *
 * Skills ship with the image and are not editable through the app, so what an admin reads is what
 * runs.
 */
export type SkillRuntime = "python" | "typescript";

export interface SkillFile {
  path: string;
  content: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  runtime: SkillRuntime;
  /** PyPI requirements for Python (installed by micropip), npm specifiers for TypeScript (jsDelivr ESM) */
  packages: string[];
  instructions: string;
  files: SkillFile[];
}

const SKILL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PYTHON_PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,._-]+\])?((==|>=|<=|~=|!=|<|>)[A-Za-z0-9.*+!-]+)?$/;
const NPM_PACKAGE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(@[A-Za-z0-9.^~*-]+)?$/;
const SCRIPT_EXTENSIONS: Record<SkillRuntime, string[]> = {
  python: [".py", ".json", ".txt"],
  typescript: [".js", ".mjs", ".json", ".txt"],
};
const MAX_FILE_SIZE = 256 * 1024;
const MAX_SKILL_SIZE = 1024 * 1024;

export class SkillError extends Error {}

function parseSkillMarkdown(source: string): { meta: Record<string, unknown>; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new SkillError("SKILL.md must start with a --- frontmatter block");
  const meta = parseYaml(match[1]);
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new SkillError("frontmatter must be a mapping");
  return { meta: meta as Record<string, unknown>, body: match[2].trim() };
}

const requireText = (meta: Record<string, unknown>, key: string): string => {
  const value = meta[key];
  if (typeof value !== "string" || !value.trim()) throw new SkillError(`frontmatter "${key}" is required`);
  return value.trim();
};

function readScripts(dir: string, runtime: SkillRuntime): SkillFile[] {
  if (!fs.existsSync(dir)) return [];
  const files: SkillFile[] = [];
  let total = 0;

  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new SkillError(`${entry.name}: symbolic links are not allowed`);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const relative = path.relative(dir, full).split(path.sep).join("/");
      if (!SCRIPT_EXTENSIONS[runtime].includes(path.extname(entry.name))) {
        throw new SkillError(`scripts/${relative}: only ${SCRIPT_EXTENSIONS[runtime].join(", ")} for ${runtime}`);
      }
      const size = fs.statSync(full).size;
      if (size > MAX_FILE_SIZE) throw new SkillError(`scripts/${relative}: larger than ${MAX_FILE_SIZE} bytes`);
      total += size;
      if (total > MAX_SKILL_SIZE) throw new SkillError(`scripts: more than ${MAX_SKILL_SIZE} bytes in total`);
      files.push({ path: relative, content: fs.readFileSync(full, "utf8") });
    }
  };

  walk(dir);
  return files;
}

export function loadSkill(dir: string): Skill {
  const id = path.basename(dir);
  if (!SKILL_ID.test(id)) throw new SkillError("the folder name must be lowercase letters, digits and dashes");

  const { meta, body } = parseSkillMarkdown(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"));
  const runtime = requireText(meta, "runtime");
  if (runtime !== "python" && runtime !== "typescript") {
    throw new SkillError(`runtime must be "python" or "typescript", not "${runtime}"`);
  }

  const packages = meta.packages ?? [];
  if (!Array.isArray(packages) || packages.some(p => typeof p !== "string")) {
    throw new SkillError("packages must be a list of strings");
  }
  const pattern = runtime === "python" ? PYTHON_PACKAGE : NPM_PACKAGE;
  const invalid = packages.find(p => !pattern.test(p));
  if (invalid)
    throw new SkillError(`package "${invalid}" is not a valid ${runtime === "python" ? "PyPI" : "npm"} specifier`);
  if (!body) throw new SkillError("SKILL.md has no instructions after the frontmatter");

  return {
    id,
    name: requireText(meta, "name"),
    description: requireText(meta, "description"),
    runtime,
    packages: packages as string[],
    instructions: body,
    files: readScripts(path.join(dir, "scripts"), runtime),
  };
}

/** Reads every skill folder; a broken one is logged and left out rather than taking the others down. */
export function loadSkills(root: string): Skill[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "SKILL.md")))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      try {
        return [loadSkill(path.join(root, entry.name))];
      } catch (error) {
        logger.error({ skill: entry.name, error: error instanceof Error ? error.message : error }, "Skipping skill");
        return [];
      }
    });
}

function defaultSkillsPath(): string {
  // src/../resources in development and a dist build, ./resources next to the bundle in the image
  const candidates = [path.join(__dirname, "../../resources/skills"), path.join(__dirname, "../resources/skills")];
  return candidates.find(dir => fs.existsSync(dir)) || candidates[0];
}

let cache: Skill[] | undefined;

export function getSkills(): Skill[] {
  if (!cache) {
    const root = process.env.SKILLS_PATH || defaultSkillsPath();
    cache = loadSkills(root);
    logger.info({ root, skills: cache.map(s => s.id) }, "Skills loaded");
  }
  return cache;
}

export function getSkillsByIds(ids: string[]): Skill[] {
  const wanted = new Set(ids);
  return getSkills().filter(skill => wanted.has(skill.id));
}

/** Import name of a helper module: Python imports scripts/theme.py as `theme`, TypeScript as "skill/theme.js". */
const helperImport = (skill: Skill, file: SkillFile) =>
  skill.runtime === "python" ? `\`${file.path.replace(/\.py$/, "").replace(/\//g, ".")}\`` : `"skill/${file.path}"`;

const FENCE_LANGUAGE: Record<SkillRuntime, string> = { python: "python", typescript: "typescript" };

/**
 * The part of the system prompt that makes enabled skills usable. The model cannot run anything, so
 * it is told exactly what the browser will do with its block, and each skill brings its own
 * instructions.
 */
/** A file of the chat a program may read: its S3 key, the name it was uploaded or made under, and what it is */
export interface SkillChatFile {
  fileName: string;
  uploadFile?: string;
  type: "image" | "document" | "generated";
}

function filesPrompt(chatFiles: SkillChatFile[]): string {
  const origin = (file: SkillChatFile) =>
    file.type === "generated"
      ? `made by an earlier answer as "${file.uploadFile}"`
      : file.uploadFile
        ? `${file.type === "image" ? "image" : "document"} sent by the user as "${file.uploadFile}"`
        : "generated image";
  const listed = chatFiles.length
    ? `Files in this chat, oldest first (use the path exactly as written):
${chatFiles.map(file => `- \`/files/${file.fileName}\`: ${origin(file)}`).join("\n")}`
    : "There are no files in this chat yet.";
  return `## Files in this chat

A program can read the files of this chat listed below, to update one or to use its content:
- Python: the file is at its path, e.g. \`Presentation("/files/...")\`, \`load_workbook("/files/...")\`, \`open("/files/...", "rb")\`.
- TypeScript: \`await files.load("/files/...")\` returns its bytes as a Uint8Array (a global, not a module); images also through \`images.load\`.
To update a file, open it, change what was asked and save the result as the block's file; keep everything else as it was. Use the paths as listed: a file that is not listed cannot be read.

${listed}`;
}

function photosPrompt(): string {
  return `## Photos in TypeScript programs

A TypeScript program can use photos through the global \`images\` (it is not a module: do not import it):
- \`await images.search("Eiffel Tower at night", { count: 3 })\` finds real photos on Wikimedia Commons and returns exactly \`count\` of them: \`{ data, width, height, title, credit, placeholder }\`. Prefer it to URLs: a photo URL you remember may not exist. When nothing is found the result is a grey stand-in with \`placeholder: true\`.
- Commons holds freely licensed photos: places, landmarks, nature, animals, historical objects, well-known people and older products. It has no photos of new, rumoured or fictional products, and a search for one finds whatever older thing shares the name (a search for a new "Apple Duo" finds a 1992 PowerBook Duo). Search with specific, descriptive terms; for such a product use an image from this chat if there is one, otherwise leave photos out or show a related subject (the company's headquarters, the city of a launch event).
- \`await images.load(src)\` returns one photo (not an array): \`src\` is an image of this chat (its \`/files/...\` path, see "Files in this chat"), \`"commons:<file name>"\` for a Wikimedia Commons file, or an https URL on images.unsplash.com or upload.wikimedia.org.
- Photos come back as \`data\` URLs that pptxgenjs and pdfmake take directly, and the skills' helpers accept a search result or any \`src\` wherever they take an image. Show \`credit\` near a photo from Wikimedia Commons (the slide helpers do).
- No other hosts are reachable.`;
}

function skillSection(skill: Skill): string {
  const packages = skill.packages.length ? skill.packages.join(", ") : "none beyond the standard library";
  const helpers = skill.files.filter(f => /\.(py|m?js)$/.test(f.path));
  const helperLine = helpers.length
    ? `\nHelper modules: ${helpers.map(file => helperImport(skill, file)).join(", ")}.`
    : "";
  return `## Skill \`${skill.id}\`: ${skill.name}
Runtime: ${skill.runtime}. Packages: ${packages}.${helperLine}
Block header: \`\`\`${FENCE_LANGUAGE[skill.runtime]} skill=${skill.id} file=<file name>

${skill.instructions}`;
}

const SKILLS_INTRO = `You can produce files, and change the documents of this chat, with skills. You do not create the file yourself: you write a program, and the user's browser runs it in a sandbox once your answer is complete and attaches the file it writes to your message. Use a skill only when the user wants a file or a change to one; otherwise answer as usual.`;

const SKILL_BLOCK_RULES = `To use a skill, write the whole program in one fenced code block whose header names the skill and the file, for example \`\`\`python skill=<skill id> file=report.pptx
- One block per file. It runs exactly as written, so it must be complete: no placeholders, no omitted parts, no "...".
- Only the skill's packages and helper modules are available, and you must import every helper you use. There is no network access (TypeScript programs can load photos) and of the user's files only this chat's; put the content in the program.
- Python: save the file to /output/<file name>. TypeScript: import packages by name and finish with \`await output.save("<file name>", data)\`, where data is a Uint8Array, ArrayBuffer, Blob or string.
- Outside the block, say in a sentence or two what the file contains; do not repeat its content. Do not write that the file was made or attached: the app adds that note to your message itself once the program has run.
- If the user sends you an error from a run, answer with the corrected complete block under the same header.`;

/** Every skill's full instructions in the system prompt: for models that cannot call tools. */
export function buildSkillsPrompt(skills: Skill[], chatFiles: SkillChatFile[] = []): string {
  if (!skills.length) return "";
  return `# Skills

${SKILLS_INTRO}

${SKILL_BLOCK_RULES}

${skills.map(skillSection).join("\n\n")}

${filesPrompt(chatFiles)}${skills.some(skill => skill.runtime === "typescript") ? `\n\n${photosPrompt()}` : ""}`;
}

/**
 * The skills by description only, for models that call tools: the model decides which skill a
 * request needs and loads its instructions with use_skill, so the prompt stays short.
 */
export function buildSkillsCatalog(skills: Skill[]): string {
  if (!skills.length) return "";
  return `# Skills

${SKILLS_INTRO}

Skills:
${skills.map(skill => `- \`${skill.id}\` (${skill.name}): ${skill.description}`).join("\n")}

Pick the skill from its description${skills.some(skill => skill.id === "office-edit") ? "; to change a document that is already in this chat (attached or made earlier) and keep its design, pick `office-edit`, not a skill that makes new files" : ""}. Before writing its block, call the \`${SKILL_TOOL_NAME}\` tool with the skill's id: it returns the skill's API, helper modules and an example, the files of this chat and, for TypeScript skills, how to use photos. Then write the block following them.

${SKILL_BLOCK_RULES}`;
}

/**
 * The system prompt addition for an answer restarted because it began a skill block without the
 * skill's instructions: the instructions, and, when the chat has an Office document the model may
 * have meant to change, those of office-edit too. Returns the ids whose instructions it holds.
 */
export async function skillRestartPrompt(
  id: string,
  context: SkillToolContext,
  chatFiles: SkillChatFile[]
): Promise<{ prompt: string; loaded: string[] }> {
  const loaded = [id];
  const parts = [
    `# Instructions for the skill \`${id}\`

Your answer started a \`${id}\` block without loading the skill's instructions. They follow: write your whole answer again, following them. The answer has no length limit.

${await context.load(id)}`,
  ];
  const editable = chatFiles.some(file => file.type !== "image" && /\.(docx|pptx|xlsx)$/i.test(file.fileName));
  if (id !== "office-edit" && editable && context.skills.some(skill => skill.id === "office-edit")) {
    loaded.push("office-edit");
    parts.push(`# Instructions for the skill \`office-edit\`

If the user wants a document that is already in this chat changed (for example keeping its design), use \`office-edit\` on that file instead of making a new one.

${await context.load("office-edit")}`);
  }
  return { prompt: parts.join("\n\n"), loaded };
}

/** What use_skill returns: one skill's instructions, with the chat's files and the photo API. */
export function buildSkillInstructions(skill: Skill, chatFiles: SkillChatFile[] = []): string {
  return `${skillSection(skill)}

${filesPrompt(chatFiles)}${skill.runtime === "typescript" ? `\n\n${photosPrompt()}` : ""}`;
}

/**
 * The skills for an answer of a chat model: every skill is available, and the model picks.
 * - A model that calls tools gets the catalog in its system prompt and the use_skill tool, whose
 *   handler returns the instructions and lifts Max Tokens for the rest of the answer.
 * - Any other model gets every skill's instructions in the system prompt instead.
 * The chat's files are read only when needed: when a skill is loaded, or for the full prompt.
 */
export async function withSkills(
  settings: ChatSettings,
  { toolCalls, loadChatFiles }: { toolCalls: boolean; loadChatFiles: () => Promise<SkillChatFile[]> }
): Promise<{ settings: ChatSettings; skills?: SkillToolContext }> {
  const skills = getSkills();
  if (!skills.length) return { settings };
  const append = (prompt: string) => ({
    ...settings,
    systemPrompt: [settings.systemPrompt, prompt].filter(Boolean).join("\n\n"),
  });

  if (!toolCalls) {
    return { settings: append(buildSkillsPrompt(skills, await loadChatFiles())) };
  }
  return {
    settings: append(buildSkillsCatalog(skills)),
    skills: {
      skills: skills.map(skill => ({ id: skill.id, name: skill.name })),
      load: async id => {
        const skill = skills.find(s => s.id === id);
        return skill ? buildSkillInstructions(skill, await loadChatFiles()) : `There is no skill "${id}".`;
      },
    },
  };
}
