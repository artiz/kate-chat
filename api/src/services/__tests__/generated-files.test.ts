import {
  decodeGeneratedFile,
  GeneratedFileError,
  MAX_GENERATED_FILE_SIZE,
  normalizeGeneratedFileName,
} from "../generated-files.service";
import { withGeneratedFiles } from "../ai/ai.service";

describe("generated files", () => {
  it.each([
    ["report.pptx", "report.pptx"],
    ["Отчёт за Q3.xlsx", "Отчёт за Q3.xlsx"],
    ["../../etc/passwd.pdf", "passwd.pdf"],
    ["C:\\Users\\me\\deck.PPTX", "deck.PPTX"],
    ["plan: 2026?.pdf", "plan_ 2026_.pdf"],
  ])("keeps %s as %s", (input, expected) => {
    expect(normalizeGeneratedFileName(input)).toBe(expected);
  });

  it.each(["page.html", "icon.svg", "run.js", "noextension", ".pptx", ""])(
    "refuses %s, which would be served as active content or has no known type",
    name => {
      expect(() => normalizeGeneratedFileName(name)).toThrow(GeneratedFileError);
    }
  );

  it("decodes plain base64 and data URLs", () => {
    expect(decodeGeneratedFile(Buffer.from("hello").toString("base64")).toString()).toBe("hello");
    expect(
      decodeGeneratedFile(`data:application/pdf;base64,${Buffer.from("%PDF").toString("base64")}`).toString()
    ).toBe("%PDF");
  });

  it("refuses empty and oversized files before storing anything", () => {
    expect(() => decodeGeneratedFile("")).toThrow("The file is empty");
    const tooLarge = "A".repeat(Math.ceil(MAX_GENERATED_FILE_SIZE / 3) * 4 + 8);
    expect(() => decodeGeneratedFile(tooLarge)).toThrow(/larger than 25 MB/);
  });

  it("tells later turns which files an answer produced", () => {
    const files = [{ name: "deck.pptx", fileName: "c/m/generated/1-deck.pptx", mime: "x", size: 125_000 }];
    expect(withGeneratedFiles("Here is the deck.", files)).toBe(
      "Here is the deck.\n\n[The code in this answer ran in the user's browser and attached: deck.pptx (122 KB).]"
    );
    expect(withGeneratedFiles([{ contentType: "text", content: "Done" }], files)).toEqual([
      { contentType: "text", content: "Done" },
      { contentType: "text", content: expect.stringContaining("deck.pptx (122 KB)") },
    ]);
    expect(withGeneratedFiles("No files", undefined)).toBe("No files");
  });

  it("drops a note the model copied into its own answer", () => {
    const files = [{ name: "a.pdf", fileName: "c/m/generated/1-a.pdf", mime: "x", size: 2048 }];
    const copied = "Done.\n\n[The code in this answer ran in the user's browser and attached: old.pdf (9 KB).]";
    expect(withGeneratedFiles(copied, files)).toBe(
      "Done.\n\n[The code in this answer ran in the user's browser and attached: a.pdf (2 KB).]"
    );
    const fenced =
      "Done.\n\n```\n[The code in this answer ran in the user's browser and attached: old.pdf (9 KB).]\n```\n";
    expect(withGeneratedFiles(fenced, undefined)).toBe("Done.");
  });
});
