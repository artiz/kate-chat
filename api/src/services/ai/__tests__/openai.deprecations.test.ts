import { isDeprecatedOpenAIModel } from "@/config/ai/openai";

// the models list of a test account on 2026-10-23
const LISTED = `babbage-002 chatgpt-image-latest chat-latest gpt-3.5-turbo gpt-3.5-turbo-0125 gpt-3.5-turbo-1106
gpt-3.5-turbo-16k gpt-4 gpt-4-0613 gpt-4.1 gpt-4.1-2025-04-14 gpt-4.1-mini gpt-4.1-nano gpt-4o gpt-4o-2024-05-13
gpt-4o-2024-08-06 gpt-4o-2024-11-20 gpt-4o-mini gpt-4o-mini-2024-07-18 gpt-4o-mini-search-preview
gpt-4o-mini-search-preview-2025-03-11 gpt-4o-mini-transcribe gpt-4o-mini-tts gpt-4o-search-preview
gpt-4o-search-preview-2025-03-11 gpt-4o-transcribe gpt-4-turbo gpt-4-turbo-2024-04-09 gpt-5 gpt-5.1
gpt-5.1-chat-latest gpt-5.1-codex gpt-5.2 gpt-5.2-chat-latest gpt-5-chat-latest gpt-5-codex gpt-5-mini gpt-5-pro
gpt-audio gpt-image-1 gpt-image-1.5 gpt-image-1-mini gpt-image-2 gpt-realtime gpt-realtime-mini o1 o1-2024-12-17
o1-pro o1-pro-2025-03-19 o3 o3-2025-04-16 o3-deep-research o3-deep-research-2025-06-26 o3-mini o3-pro o4-mini
o4-mini-deep-research omni-moderation-latest sora-2 text-embedding-3-large text-embedding-ada-002 whisper-1`
  .split(/\s+/)
  .filter(Boolean);

const TODAY = new Date("2026-10-23T09:00:00Z");

describe("isDeprecatedOpenAIModel", () => {
  it("leaves out the models OpenAI has shut down, with their dated snapshots", () => {
    expect(LISTED.filter(id => isDeprecatedOpenAIModel(id, TODAY))).toEqual([
      "babbage-002",
      "gpt-3.5-turbo",
      "gpt-3.5-turbo-0125",
      "gpt-3.5-turbo-1106",
      "gpt-3.5-turbo-16k",
      "gpt-4",
      "gpt-4-0613",
      "gpt-4o-2024-05-13",
      "gpt-4o-mini-search-preview",
      "gpt-4o-mini-search-preview-2025-03-11",
      "gpt-4o-search-preview",
      "gpt-4o-search-preview-2025-03-11",
      "gpt-4-turbo",
      "gpt-4-turbo-2024-04-09",
      "gpt-5.1-chat-latest",
      "gpt-5.2-chat-latest",
      "gpt-5-chat-latest",
      "gpt-image-1",
      "o1",
      "o1-2024-12-17",
      "o1-pro",
      "o1-pro-2025-03-19",
      "o3-deep-research",
      "o3-deep-research-2025-06-26",
    ]);
  });

  it("keeps models whose IDs only start like a shut-down one", () => {
    for (const id of ["gpt-4o", "gpt-4.1", "gpt-4o-2024-08-06", "gpt-image-1-mini", "gpt-image-1.5", "o1x", "o3"]) {
      expect(isDeprecatedOpenAIModel(id, TODAY)).toBe(false);
    }
  });

  it("keeps a model until its shutdown date", () => {
    expect(isDeprecatedOpenAIModel("tts-1", TODAY)).toBe(false);
    expect(isDeprecatedOpenAIModel("tts-1", new Date("2027-01-06T00:00:00Z"))).toBe(true);
    expect(isDeprecatedOpenAIModel("gpt-4", new Date("2026-10-22T23:59:59Z"))).toBe(false);
  });
});
