import { toStopReason } from "../ai.types";

describe("toStopReason", () => {
  it("normalizes the output-limit reason of every provider", () => {
    expect(toStopReason("length")).toBe("max_tokens");
    expect(toStopReason("max_output_tokens")).toBe("max_tokens");
    expect(toStopReason("max_tokens")).toBe("max_tokens");
  });

  it("normalizes a natural end and a filtered answer", () => {
    expect(toStopReason("stop")).toBe("end_turn");
    expect(toStopReason("completed")).toBe("end_turn");
    expect(toStopReason("end_turn")).toBe("end_turn");
    expect(toStopReason("content_filter")).toBe("content_filter");
    expect(toStopReason("guardrail_intervened")).toBe("content_filter");
    expect(toStopReason("stop_sequence")).toBe("stop_sequence");
  });

  it("leaves tool-call stops and unknown values undefined", () => {
    expect(toStopReason("tool_calls")).toBeUndefined();
    expect(toStopReason("tool_use")).toBeUndefined();
    expect(toStopReason(null)).toBeUndefined();
    expect(toStopReason(undefined)).toBeUndefined();
  });
});
