import { converseDocumentFormat, isTextualMime, sanitizeDocumentName, saveFileFromBase64 } from "../file";
import type { S3Service } from "@/services/data/s3.service";

describe("file utils", () => {
  describe("isTextualMime", () => {
    it.each(["text/plain", "text/markdown", "text/csv; charset=utf-8", "application/json", "application/xml"])(
      "treats %s as textual",
      mime => {
        expect(isTextualMime(mime)).toBe(true);
      }
    );

    it.each(["application/pdf", "image/png", "application/octet-stream", undefined])(
      "treats %s as non-textual",
      mime => {
        expect(isTextualMime(mime)).toBe(false);
      }
    );
  });

  describe("converseDocumentFormat", () => {
    it("maps known mime types to Converse formats", () => {
      expect(converseDocumentFormat("application/pdf")).toBe("pdf");
      expect(converseDocumentFormat("text/csv")).toBe("csv");
      expect(converseDocumentFormat("text/html")).toBe("html");
      expect(converseDocumentFormat("text/markdown")).toBe("md");
    });

    it("falls back to txt for anything else", () => {
      expect(converseDocumentFormat("application/json")).toBe("txt");
      expect(converseDocumentFormat(undefined)).toBe("txt");
    });
  });

  describe("sanitizeDocumentName", () => {
    it("drops the extension and illegal characters", () => {
      expect(sanitizeDocumentName("Q3 report — final.pdf")).toBe("Q3 report final");
      expect(sanitizeDocumentName("notes(v2)[draft].txt")).toBe("notes(v2)[draft]");
    });

    it("collapses whitespace and falls back on empty input", () => {
      expect(sanitizeDocumentName("  a   b  .md")).toBe("a b");
      expect(sanitizeDocumentName("###.pdf")).toBe("document");
      expect(sanitizeDocumentName(undefined)).toBe("document");
    });
  });

  describe("saveFileFromBase64", () => {
    const uploadFile = jest.fn().mockResolvedValue(undefined);
    const s3 = { uploadFile } as unknown as S3Service;

    beforeEach(() => uploadFile.mockClear());

    it("parses the data URL mime, derives the extension and uploads", async () => {
      const data = `data:application/pdf;base64,${Buffer.from("PDFDATA").toString("base64")}`;
      const result = await saveFileFromBase64(s3, data, { chatId: "c1", messageId: "m1", id: "42-file-0" });

      expect(result.contentType).toBe("application/pdf");
      expect(result.fileName).toBe("c1/m1/42-file-0.pdf");
      expect(result.buffer.toString()).toBe("PDFDATA");
      expect(uploadFile).toHaveBeenCalledWith(expect.any(Buffer), "c1/m1/42-file-0.pdf", "application/pdf");
    });

    it("falls back to octet-stream/bin without a data URL prefix", async () => {
      const result = await saveFileFromBase64(s3, Buffer.from("x").toString("base64"), {
        chatId: "c1",
        messageId: "m1",
        id: "id",
      });

      expect(result.contentType).toBe("application/octet-stream");
      expect(result.fileName).toBe("c1/m1/id.bin");
    });
  });
});
