import fs from "fs";
import os from "os";
import path from "path";
import { buildSkillsPrompt, loadSkill, loadSkills, SkillError, withSkills } from "../skills.service";
import { ToolType } from "@/types/api";

const RESOURCES = path.join(__dirname, "../../../resources/skills");

const writeSkill = (root: string, id: string, skillMd: string, scripts: Record<string, string> = {}) => {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd);
  for (const [file, content] of Object.entries(scripts)) {
    fs.mkdirSync(path.dirname(path.join(dir, "scripts", file)), { recursive: true });
    fs.writeFileSync(path.join(dir, "scripts", file), content);
  }
  return dir;
};

const md = (meta: string, body = "Write the program.") => `---\n${meta}\n---\n${body}\n`;

describe("skills", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("loads the skills shipped in resources", () => {
    const skills = loadSkills(RESOURCES);
    expect(skills.map(s => [s.id, s.runtime])).toEqual([
      ["office-edit", "python"],
      ["pdf", "typescript"],
      ["pptx", "typescript"],
      ["xlsx", "python"],
    ]);
    const pptx = skills.find(s => s.id === "pptx")!;
    expect(pptx.packages).toEqual(["pptxgenjs@3.12.0"]);
    expect(pptx.files.map(f => f.path)).toEqual(["deck.js"]);
    expect(pptx.instructions).toContain("```typescript skill=pptx file=");
  });

  it("reads frontmatter, instructions and nested helper scripts", () => {
    const dir = writeSkill(
      tmp,
      "charts",
      md("name: Charts\ndescription: Plots\nruntime: python\npackages: [matplotlib]"),
      {
        "plot.py": "def plot(): pass\n",
        "lib/colors.py": "RED = 'f00'\n",
      }
    );
    const skill = loadSkill(dir);
    expect(skill).toMatchObject({ id: "charts", name: "Charts", description: "Plots", packages: ["matplotlib"] });
    expect(skill.instructions).toBe("Write the program.");
    expect(skill.files.map(f => f.path)).toEqual(["lib/colors.py", "plot.py"]);
  });

  it.each([
    ["Bad_Id", md("name: A\ndescription: B\nruntime: python"), /folder name/],
    ["no-frontmatter", "Just text", /frontmatter/],
    ["bad-runtime", md("name: A\ndescription: B\nruntime: ruby"), /runtime must be/],
    ["no-name", md("description: B\nruntime: python"), /"name" is required/],
    [
      "bad-package",
      md("name: A\ndescription: B\nruntime: typescript\npackages: ['pptxgenjs; rm -rf /']"),
      /not a valid npm/,
    ],
    ["no-body", md("name: A\ndescription: B\nruntime: python", ""), /no instructions/],
  ])("rejects %s", (id, skillMd, error) => {
    const dir = writeSkill(tmp, id, skillMd);
    expect(() => loadSkill(dir)).toThrow(error);
  });

  it("only accepts helper files the runtime can use", () => {
    const dir = writeSkill(tmp, "web", md("name: A\ndescription: B\nruntime: typescript"), {
      "index.html": "<script>",
    });
    expect(() => loadSkill(dir)).toThrow(SkillError);
    expect(() => loadSkill(dir)).toThrow(/only .js, .mjs, .json, .txt/);
  });

  it("skips a broken skill instead of failing the others", () => {
    writeSkill(tmp, "good", md("name: Good\ndescription: B\nruntime: python"));
    writeSkill(tmp, "broken", md("name: Broken\ndescription: B\nruntime: cobol"));
    expect(loadSkills(tmp).map(s => s.id)).toEqual(["good"]);
  });

  it("tells the model the block header, the output contract and each skill's helpers", () => {
    const prompt = buildSkillsPrompt(loadSkills(RESOURCES));
    expect(prompt).toContain("```python skill=<skill id> file=report.pptx");
    expect(prompt).toContain("save the file to /output/<file name>");
    expect(prompt).toContain('await output.save("<file name>", data)');
    expect(prompt).toContain("## Skill `pptx`: PowerPoint presentation");
    expect(prompt).toContain('Helper modules: "skill/deck.js"');
    expect(prompt).toContain("Helper modules: `xlsx_helpers`");
    expect(prompt).toContain("Block header: ```python skill=xlsx file=<file name>");
  });

  it("adds nothing when no skill is enabled", () => {
    expect(buildSkillsPrompt([])).toBe("");
  });

  it("adds enabled skills to the system prompt and lifts Max Tokens for them", () => {
    const settings = { systemPrompt: "Be brief.", maxTokens: 2048, temperature: 0.5 };
    const skill = { type: ToolType.SKILL, id: "pdf", name: "PDF document" };
    const withPdf = withSkills(settings, [skill]);
    expect(withPdf.systemPrompt).toMatch(/^Be brief\.\n\n# Skills\n/);
    expect(withPdf.systemPrompt).toContain("## Skill `pdf`");
    expect(withPdf.maxTokens).toBeUndefined();
    expect(withPdf.temperature).toBe(0.5);

    expect(withPdf.systemPrompt).toContain("There are no files in this chat yet.");

    const withFiles = withSkills(
      settings,
      [skill],
      [
        { fileName: "chat-1/msg-1/1-0.jpg", uploadFile: "IMG_2031.jpg", type: "image" },
        { fileName: "chat-1/msg-1/1-file-0.pptx", uploadFile: "Angular2.pptx", type: "document" },
        { fileName: "chat-1/msg-2/generated/2-deck.pptx", uploadFile: "deck.pptx", type: "generated" },
        { fileName: "chat-1/msg-3/3-0.png", type: "image" },
      ]
    );
    const prompt = withFiles.systemPrompt || "";
    expect(prompt).toContain('- `/files/chat-1/msg-1/1-0.jpg`: image sent by the user as "IMG_2031.jpg"');
    expect(prompt).toContain('- `/files/chat-1/msg-1/1-file-0.pptx`: document sent by the user as "Angular2.pptx"');
    expect(prompt).toContain('- `/files/chat-1/msg-2/generated/2-deck.pptx`: made by an earlier answer as "deck.pptx"');
    expect(prompt).toContain("- `/files/chat-1/msg-3/3-0.png`: generated image");
    expect(prompt).toContain('await files.load("/files/...")');
    expect(prompt).toContain('images.search("Eiffel Tower at night", { count: 3 })');

    // Python skills cannot use `images`, but can read the chat's files
    const withXlsx = withSkills(
      settings,
      [{ ...skill, id: "xlsx" }],
      [{ fileName: "chat-1/msg-1/1-0.xlsx", uploadFile: "a.xlsx", type: "document" }]
    );
    expect(withXlsx.systemPrompt).not.toContain("## Photos");
    expect(withXlsx.systemPrompt).toContain("## Files in this chat");

    expect(withSkills(settings, [{ type: ToolType.MCP, id: "x", name: "MCP" }])).toBe(settings);
    expect(withSkills(settings, [{ ...skill, id: "missing" }])).toBe(settings);
    expect(withSkills(settings, undefined)).toBe(settings);
  });
});
