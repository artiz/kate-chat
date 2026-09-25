import fs from "fs";
import os from "os";
import path from "path";
import {
  buildSkillsPrompt,
  loadSkill,
  loadSkills,
  SkillChatFile,
  SkillError,
  skillRestartPrompt,
  withSkills,
} from "../skills.service";
import { runSkillTool, skillOfCall, unloadedSkillBlock } from "../ai/tools/skills.tool";
import type { CompleteChatRequest } from "@/types/ai.types";

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

  describe("skills chosen by the model", () => {
    const settings = { systemPrompt: "Be brief.", maxTokens: 2048, temperature: 0.5 };
    const chatFiles: SkillChatFile[] = [
      { fileName: "chat-1/msg-1/1-0.jpg", uploadFile: "IMG_2031.jpg", type: "image" },
      { fileName: "chat-1/msg-1/1-file-0.pptx", uploadFile: "Angular2.pptx", type: "document" },
      { fileName: "chat-1/msg-2/generated/2-deck.pptx", uploadFile: "deck.pptx", type: "generated" },
      { fileName: "chat-1/msg-3/3-0.png", type: "image" },
    ];

    it("gives a model that calls tools the catalog, and the instructions through use_skill", async () => {
      const loadChatFiles = jest.fn(async () => chatFiles);
      const { settings: applied, skills } = await withSkills(settings, { toolCalls: true, loadChatFiles });

      const prompt = applied.systemPrompt || "";
      expect(prompt).toMatch(/^Be brief\.\n\n# Skills\n/);
      expect(prompt).toContain("- `pptx` (PowerPoint presentation; TypeScript): Slide decks");
      expect(prompt).toContain("- `office-edit` (Edit Office documents; Python):");
      expect(prompt).toContain("call the `use_skill` tool");
      expect(prompt).toContain(
        "to change a document that is already in this chat (attached or made earlier) and keep its design, pick `office-edit`"
      );
      expect(prompt).not.toContain("## Skill `pptx`"); // no instructions until the model asks
      expect(applied.maxTokens).toBe(2048); // lifted only once a skill is used
      expect(applied.temperature).toBe(0.5);
      expect(loadChatFiles).not.toHaveBeenCalled(); // files are read only when a skill is loaded

      expect(skills?.skills.map(s => s.id)).toEqual(["office-edit", "pdf", "pptx", "xlsx"]);
      const pdf = await skills!.load("pdf");
      expect(pdf).toContain("## Skill `pdf`");
      expect(pdf).toContain('- `/files/chat-1/msg-1/1-0.jpg`: image sent by the user as "IMG_2031.jpg"');
      expect(pdf).toContain('- `/files/chat-1/msg-1/1-file-0.pptx`: document sent by the user as "Angular2.pptx"');
      expect(pdf).toContain('- `/files/chat-1/msg-2/generated/2-deck.pptx`: made by an earlier answer as "deck.pptx"');
      expect(pdf).toContain("- `/files/chat-1/msg-3/3-0.png`: generated image");
      expect(pdf).toContain('await files.load("/files/...")');
      expect(pdf).toContain('images.search("Eiffel Tower at night", { count: 3 })');

      // Python skills cannot use `images`, but can read the chat's files
      const xlsx = await skills!.load("xlsx");
      expect(xlsx).not.toContain("## Photos");
      expect(xlsx).toContain("## Files in this chat");
    });

    it("gives a model that cannot call tools every skill in the prompt", async () => {
      const { settings: applied, skills } = await withSkills(settings, {
        toolCalls: false,
        loadChatFiles: async () => [],
      });
      expect(skills).toBeUndefined();
      expect(applied.systemPrompt).toContain("## Skill `pptx`");
      expect(applied.systemPrompt).toContain("## Skill `office-edit`");
      expect(applied.systemPrompt).toContain("There are no files in this chat yet.");
      expect(applied.maxTokens).toBe(2048);
    });

    it("use_skill returns the instructions and lifts Max Tokens for the rest of the answer", async () => {
      const request = {
        settings: { maxTokens: 2048 },
        skills: { skills: [{ id: "pdf", name: "PDF" }], load: async (id: string) => `instructions for ${id}` },
      } as unknown as CompleteChatRequest;
      expect(await runSkillTool(request, { skill: "docx" })).toBe('There is no skill "docx". Skills: pdf.');
      expect(request.settings?.maxTokens).toBe(2048);
      expect(await runSkillTool(request, { skill: "pdf" })).toBe("instructions for pdf");
      expect(request.settings?.maxTokens).toBeUndefined();
    });

    it("spots a skill block the model began without loading the skill", () => {
      const context = {
        skills: [
          { id: "pptx", name: "PPTX" },
          { id: "xlsx", name: "XLSX" },
        ],
        load: async () => "",
      };
      const loaded = new Set(["xlsx"]);
      expect(unloadedSkillBlock("Here:\n\n```typescript skill=pptx file=a.pptx", context, loaded)).toBeUndefined(); // line not complete yet
      expect(unloadedSkillBlock("Here:\n\n```typescript skill=pptx file=a.pptx\n", context, loaded)).toBe("pptx");
      expect(unloadedSkillBlock("```python skill=xlsx file=a.xlsx\nwb = 1\n", context, loaded)).toBeUndefined(); // loaded
      expect(unloadedSkillBlock("```python skill=docx file=a.docx\n", context, loaded)).toBeUndefined(); // no such skill
      expect(unloadedSkillBlock("Use `skill=pptx` in the header.\n", context, loaded)).toBeUndefined(); // not a fence
      expect(unloadedSkillBlock("```typescript skill=pptx file=a.pptx\n", undefined, loaded)).toBeUndefined();
    });

    it("restarts with the skill's instructions, and office-edit's when there is a document to change", async () => {
      const { skills } = await withSkills(settings, { toolCalls: true, loadChatFiles: async () => chatFiles });
      const withDeck = await skillRestartPrompt("pptx", skills!, chatFiles);
      expect(withDeck.loaded).toEqual(["pptx", "office-edit"]);
      expect(withDeck.prompt).toContain("Your answer started a `pptx` block without loading the skill's instructions");
      expect(withDeck.prompt).toContain("## Skill `pptx`");
      expect(withDeck.prompt).toContain("## Skill `office-edit`");
      expect(withDeck.prompt).toContain(
        "`office-edit` is a Python skill: its block starts with ```python skill=office-edit"
      );

      const imagesOnly = chatFiles.filter(file => file.type === "image");
      expect((await skillRestartPrompt("pptx", skills!, imagesOnly)).loaded).toEqual(["pptx"]);
      expect((await skillRestartPrompt("office-edit", skills!, chatFiles)).loaded).toEqual(["office-edit"]);
    });

    it("finds the skill a stored call asked for", () => {
      const calls = [
        { name: "internal_web_search", callId: "a", args: '{"query":"x"}' },
        { name: "use_skill", callId: "b", args: '{"skill":"pptx"}' },
      ];
      expect(skillOfCall(calls, "b")).toBe("pptx");
      expect(skillOfCall(calls, "a")).toBe("");
      expect(skillOfCall(undefined, "b")).toBe("");
    });
  });
});
