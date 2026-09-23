import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { createLogger } from "@/utils/logger";

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
export function buildSkillsPrompt(skills: Skill[]): string {
  if (!skills.length) return "";

  const sections = skills.map(skill => {
    const packages = skill.packages.length ? skill.packages.join(", ") : "none beyond the standard library";
    const helpers = skill.files.filter(f => /\.(py|m?js)$/.test(f.path));
    const helperLine = helpers.length
      ? `\nHelper modules: ${helpers.map(file => helperImport(skill, file)).join(", ")}.`
      : "";
    return `## Skill \`${skill.id}\`: ${skill.name}
Runtime: ${skill.runtime}. Packages: ${packages}.${helperLine}
Block header: \`\`\`${FENCE_LANGUAGE[skill.runtime]} skill=${skill.id} file=<file name>

${skill.instructions}`;
  });

  return `# Skills

You can produce files with the skills below. You do not create the file yourself: you write a program, and the user's browser runs it in a sandbox once your answer is complete and attaches the file it writes to your message.

When the user asks for a file a skill covers, write the whole program in one fenced code block whose header names the skill and the file, for example \`\`\`python skill=<skill id> file=report.pptx
- One block per file. It runs exactly as written, so it must be complete: no placeholders, no omitted parts, no "...".
- Only the listed packages and helper modules are available. There is no network access and no access to the user's files; put the content in the program.
- Python: save the file to /output/<file name>. TypeScript: import packages by name and finish with \`await output.save("<file name>", data)\`, where data is a Uint8Array, ArrayBuffer, Blob or string.
- Outside the block, say in a sentence or two what the file contains; do not repeat its content.
- If the user sends you an error from a run, answer with the corrected complete block under the same header.

${sections.join("\n\n")}`;
}
