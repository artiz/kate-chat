jest.mock("../components/chat/code-plugins/TypeScriptExecutorModal", () => ({ loadTypeScriptCompiler: jest.fn() }));

import { TextEncoder } from "util";
// browsers have it; jsdom does not
Object.assign(global, { TextEncoder });

import {
  findUnfinishedSkillBlock,
  normalizeFileName,
  parseSkillBlocks,
  skillBlockAt,
  stripGeneratedFilesNote,
  withSkillView,
} from "../lib/skills/parse";
import { buildSandboxDocument, IMAGE_HOSTS, npmImport, SANDBOX_CSP } from "../lib/skills/sandbox";
import { findChatImagePaths } from "../lib/skills/images";

describe("parseSkillBlocks", () => {
  const answer = [
    "Here is the deck:",
    "",
    "```typescript skill=pptx file=review.pptx",
    'import { createDeck } from "skill/deck.js";',
    "```",
    "",
    "A plain example that must not run:",
    "```python",
    "print('hi')",
    "```",
    "",
    '```python skill=xlsx file="Отчёт за Q3.xlsx"',
    "wb.save('/output/Отчёт за Q3.xlsx')",
    "```",
  ].join("\n");

  it("finds only blocks that name a skill and a file, numbering them in order", () => {
    expect(parseSkillBlocks(answer)).toEqual([
      {
        index: 0,
        language: "typescript",
        skillId: "pptx",
        fileName: "review.pptx",
        code: 'import { createDeck } from "skill/deck.js";',
      },
      {
        index: 1,
        language: "python",
        skillId: "xlsx",
        fileName: "Отчёт за Q3.xlsx",
        code: "wb.save('/output/Отчёт за Q3.xlsx')",
      },
    ]);
  });

  it("ignores a skill block without a file and an unfinished block", () => {
    expect(parseSkillBlocks("```python skill=xlsx\nx = 1\n```")).toEqual([]);
    expect(parseSkillBlocks("```python skill=xlsx file=a.xlsx\nx = 1\n")).toEqual([]);
    expect(parseSkillBlocks(undefined)).toEqual([]);
  });

  it("keeps a nested fence inside a longer outer fence", () => {
    const blocks = parseSkillBlocks("````python skill=pdf file=doc.pdf\ntext = '```'\n````");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe("text = '```'");
  });
});

describe("an answer cut off inside a skill block", () => {
  // what a content filter or the output limit leaves: the program's closing fence never arrives
  const cutOff = [
    "Report of the mentions:",
    "```python",
    "print('a plain block before it')",
    "```",
    "",
    "```typescript skill=pdf file=paris.pdf",
    'import { renderPdf } from "skill/pdf.js";',
    "const content = [",
  ].join("\n");

  it("offers no block to run", () => {
    expect(parseSkillBlocks(cutOff)).toEqual([]);
  });

  it("is reported with the file it would have made", () => {
    expect(findUnfinishedSkillBlock(cutOff)).toEqual({ skillId: "pdf", fileName: "paris.pdf" });
    expect(findUnfinishedSkillBlock(cutOff + "\n```")).toBeUndefined();
    expect(findUnfinishedSkillBlock("```python\nprint(1)")).toBeUndefined();
  });

  it("maps the code block's own Run button to the skill block, finished or not", () => {
    // block 0 is the plain python block, block 1 the unfinished skill block
    expect(skillBlockAt(cutOff, 0)).toBeUndefined();
    expect(skillBlockAt(cutOff, 1)).toEqual({ index: 0, fileName: "paris.pdf", closed: false });
    const complete = cutOff + "\n];\n```\n\n```python skill=xlsx file=b.xlsx\nx = 1\n```";
    expect(skillBlockAt(complete, 1)).toEqual({ index: 0, fileName: "paris.pdf", closed: true });
    expect(skillBlockAt(complete, 2)).toEqual({ index: 1, fileName: "b.xlsx", closed: true });
  });

  it("does not count unlabelled blocks, which the chat renders without a Run button", () => {
    const content = "```\nplain\n```\n```python skill=xlsx file=a.xlsx\nx = 1\n```";
    expect(skillBlockAt(content, 0)).toEqual({ index: 0, fileName: "a.xlsx", closed: true });
  });
});

describe("withSkillView", () => {
  const block = "```typescript skill=pdf file=a.pdf\nawait output.save('a.pdf', 'x');\n```";
  const note = "[The code in this answer ran in the user's browser and attached: a.pdf (23 KB).]";

  it("collapses the code of an answer with a skill block and drops a copied note", () => {
    const message = { content: `${block}\n\n${note}`, linkedMessages: [{ content: `Plain\n\n${note}` }] };
    expect(withSkillView(message)).toEqual({
      content: block,
      collapseCodeBlocks: true,
      linkedMessages: [{ content: "Plain", collapseCodeBlocks: false }],
    });
  });

  it("collapses a skill block that is still being streamed", () => {
    const message = {
      content: "Here it is:\n\n```typescript skill=pptx file=deck.pptx\nimport { createDeck",
      streaming: true,
    };
    expect(withSkillView(message).collapseCodeBlocks).toBe(true);
  });

  it("leaves other answers as they are", () => {
    const message = { content: "```python\nprint(1)\n```" };
    expect(withSkillView(message)).toBe(message);
  });

  it("drops the note inside a code fence too, and nothing else", () => {
    expect(stripGeneratedFilesNote(`Here it is.\n\n\`\`\`\n${note}\n\`\`\`\n`)).toBe("Here it is.");
    expect(stripGeneratedFilesNote(`Before ${note} after`)).toBe(`Before ${note} after`);
  });
});

describe("findChatImagePaths", () => {
  it("finds the images of this chat a program uses, once each", () => {
    const code = [
      'titleSlide(pptx, { image: "/files/chat-1/msg-1/1790-0.jpg" });',
      'imageSlide(pptx, { image: "/files/chat-1/msg-1/1790-0.jpg" });',
      'addImage(pptx, slide, "/files/chat-1/msg-2/1791-0.png", box);',
      'images.load("/files/other-chat/msg-9/1-0.png");',
      'images.load("/files/chat-1/msg-3/notes.pdf");',
    ].join("\n");
    expect(findChatImagePaths(code, "chat-1")).toEqual([
      "/files/chat-1/msg-1/1790-0.jpg",
      "/files/chat-1/msg-2/1791-0.png",
    ]);
  });
});

describe("normalizeFileName", () => {
  // the same cases as normalizeGeneratedFileName in the API, so a file is found again after a reload
  it.each([
    ["report.pptx", "report.pptx"],
    ["Отчёт за Q3.xlsx", "Отчёт за Q3.xlsx"],
    ["../../etc/passwd.pdf", "passwd.pdf"],
    ["C:\\Users\\me\\deck.PPTX", "deck.PPTX"],
    ["plan: 2026?.pdf", "plan_ 2026_.pdf"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeFileName(input)).toBe(expected);
  });
});

describe("sandbox document", () => {
  it("maps npm packages to jsDelivr ESM builds, scoped ones included", () => {
    expect(npmImport("pptxgenjs@3.12.0")).toEqual(["pptxgenjs", "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/+esm"]);
    expect(npmImport("@scope/pkg@1.2.3")).toEqual(["@scope/pkg", "https://cdn.jsdelivr.net/npm/@scope/pkg@1.2.3/+esm"]);
    expect(npmImport("exceljs")).toEqual(["exceljs", "https://cdn.jsdelivr.net/npm/exceljs/+esm"]);
  });

  it("limits the sandbox to the package CDNs", () => {
    expect(SANDBOX_CSP).toContain("default-src 'none'");
    expect(SANDBOX_CSP).toContain(
      "connect-src https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org"
    );
    const doc = buildSandboxDocument({ runtime: "typescript", packages: [], files: [] }, "");
    expect(doc).toContain(`<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`);
  });

  it("puts packages and helper modules in the import map", () => {
    const doc = buildSandboxDocument(
      {
        runtime: "typescript",
        packages: ["pptxgenjs@3.12.0"],
        files: [{ path: "deck.js", content: "export const a = 1;" }],
      },
      "await output.save('a.txt', 'x');"
    );
    const importMap = JSON.parse(doc.match(/<script type="importmap">(.*?)<\/script>/s)![1]);
    expect(importMap.imports.pptxgenjs).toBe("https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/+esm");
    expect(importMap.imports["skill/deck.js"]).toMatch(/^data:text\/javascript;base64,/);
    expect(atob(importMap.imports["skill/deck.js"].split(",")[1])).toBe(
      "export const a = 1;\n//# sourceURL=skill/deck.js"
    );
  });

  it("names the program in stack traces and makes helper exports available without an import", () => {
    const doc = buildSandboxDocument(
      { runtime: "typescript", packages: [], files: [{ path: "pdf.js", content: "export const table = 1;" }] },
      "table;"
    );
    const program = doc.match(/await import\("(data:text\/javascript;base64,[^"]+)"\)/)![1];
    expect(atob(program.split(",")[1])).toBe("table;\n//# sourceURL=program.js");
    expect(doc).toContain('for (const helper of ["skill/pdf.js"])');
    expect(doc).toContain('addEventListener("unhandledrejection"');
  });

  it("lets programs reach the photo hosts and embeds the chat images they use", () => {
    for (const host of IMAGE_HOSTS) expect(SANDBOX_CSP).toContain(host);
    const doc = buildSandboxDocument({ runtime: "typescript", packages: [], files: [] }, "", [
      { path: "/files/chat-1/msg-1/1-0.png", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) },
    ]);
    expect(doc).toContain(
      'const __chatImages = [{"path":"/files/chat-1/msg-1/1-0.png","mime":"image/png","base64":"AQID"}]'
    );
    expect(doc).toContain("window.images = {");
  });

  it('cannot be broken out of by "</script>" in the code or a helper', () => {
    const hostile = 'print("</script><script>parent.document.title=1</script>")';
    const doc = buildSandboxDocument(
      { runtime: "python", packages: ["openpyxl"], files: [{ path: "h.py", content: "x = '</script>'" }] },
      hostile
    );
    // the only closing tags are the document's own two scripts
    expect(doc.match(/<\/script>/g)).toHaveLength(2);
    expect(doc).toContain("\\u003c/script>");
  });
});
