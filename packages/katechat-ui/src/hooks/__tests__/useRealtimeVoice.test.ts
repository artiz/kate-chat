import { answerToolCalls, realtimeToolCalls } from "../useRealtimeVoice";

describe("realtimeToolCalls", () => {
  it("finds the function calls of a finished response", () => {
    expect(
      realtimeToolCalls({
        type: "response.done",
        response: {
          output: [
            { type: "message" },
            { type: "function_call", call_id: "c1", name: "lookup", arguments: '{"q":"x"}' },
          ],
        },
      })
    ).toEqual([{ callId: "c1", name: "lookup", arguments: '{"q":"x"}' }]);
  });

  it("ignores other events and responses without calls", () => {
    expect(realtimeToolCalls({ type: "response.output_audio_transcript.done" })).toEqual([]);
    expect(realtimeToolCalls({ type: "response.done", response: { output: [{ type: "message" }] } })).toEqual([]);
    expect(realtimeToolCalls(undefined)).toEqual([]);
  });
});

describe("answerToolCalls", () => {
  it("sends one output per call, then one new response", async () => {
    const sent: unknown[] = [];
    await answerToolCalls(
      [
        { callId: "c1", name: "a", arguments: "{}" },
        { callId: "c2", name: "b", arguments: "{}" },
      ],
      async call => `${call.name} ok`,
      event => sent.push(event)
    );

    expect(sent).toEqual([
      { type: "conversation.item.create", item: { type: "function_call_output", call_id: "c1", output: "a ok" } },
      { type: "conversation.item.create", item: { type: "function_call_output", call_id: "c2", output: "b ok" } },
      { type: "response.create" },
    ]);
  });

  it("answers a failed call with its error", async () => {
    const sent: { item?: { output?: string } }[] = [];
    await answerToolCalls(
      [{ callId: "c1", name: "a", arguments: "{}" }],
      async () => {
        throw new Error("offline");
      },
      event => sent.push(event as never)
    );
    expect(sent[0].item?.output).toBe("Error calling a: offline");
  });

  it("sends nothing without calls", async () => {
    const send = jest.fn();
    await answerToolCalls([], jest.fn(), send);
    expect(send).not.toHaveBeenCalled();
  });
});
