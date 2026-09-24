jest.mock("../lib/skills/sandbox", () => ({ runSkillCode: jest.fn() }));
jest.mock("../components/chat/ChatPluginsContext", () => ({ useChatPluginsContext: () => ({ mcpTokens: [] }) }));
jest.mock("@katechat/ui", () => ({
  MessageRole: { ASSISTANT: "ASSISTANT", USER: "USER" },
  assert: {
    ok: (value: unknown, message?: string) => {
      if (!value) throw new Error(message);
    },
  },
}));

import React from "react";
import { TextEncoder } from "util";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { gql, InMemoryCache } from "@apollo/client";
import { createFragmentRegistry } from "@apollo/client/cache";
import { print } from "graphql";
import { MantineProvider } from "@mantine/core";
import { BASE_MESSAGE_FRAGMENT, GET_SKILLS, SAVE_GENERATED_FILE } from "../store/services/graphql.queries";
import { runSkillCode } from "../lib/skills/sandbox";
import { SkillRuns } from "../components/chat/plugins/SkillRuns";
import { Message } from "../types/graphql";

Object.assign(global, { TextEncoder });
// Mantine reads these in jsdom
window.matchMedia ||= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;

const skill = {
  __typename: "GqlSkill",
  id: "pdf",
  name: "PDF document",
  description: "PDFs",
  runtime: "typescript",
  packages: ["pdfmake@0.2.20"],
  instructions: "…",
  files: [],
};

const message = {
  id: "m1",
  chatId: "c1",
  role: "ASSISTANT",
  streaming: false,
  content: 'Here it is.\n\n```typescript skill=pdf file=report.pdf\nawait output.save("report.pdf", "x");\n```',
  metadata: {},
} as unknown as Message;

describe("SkillRuns", () => {
  it("finishes under StrictMode, which mounts effects twice", async () => {
    let finish!: (value: unknown) => void;
    (runSkillCode as jest.Mock).mockReturnValue(new Promise(resolve => (finish = resolve)));
    const saved = {
      ...message,
      metadata: {
        generatedFiles: [
          { name: "report.pdf", fileName: "c1/m1/generated/1-report.pdf", mime: "application/pdf", size: 1 },
        ],
      },
    };
    const mocks = [
      // MockedProvider answers each mock once; the query may be asked again as the card re-renders
      ...Array.from({ length: 4 }, () => ({ request: { query: GET_SKILLS }, result: { data: { skills: [skill] } } })),
      {
        // the query as it goes out: the cache's fragment registry appends BaseMessage to it
        request: {
          query: gql`
            ${print(SAVE_GENERATED_FILE)}
            ${BASE_MESSAGE_FRAGMENT}
          `,
        },
        variableMatcher: () => true,
        result: { data: { saveGeneratedFile: saved } },
      },
    ];
    const onAddMessage = jest.fn();

    render(
      <React.StrictMode>
        <MantineProvider>
          <MockedProvider
            mocks={mocks}
            addTypename={false}
            // the app registers its fragments on the cache; SAVE_GENERATED_FILE spreads BaseMessage
            cache={
              new InMemoryCache({ addTypename: false, fragments: createFragmentRegistry(gql(BASE_MESSAGE_FRAGMENT)) })
            }
          >
            <SkillRuns message={message} isLast messagesCount={1} onAddMessage={onAddMessage} />
          </MockedProvider>
        </MantineProvider>
      </React.StrictMode>
    );

    await screen.findByText("skills.generating");
    expect(runSkillCode).toHaveBeenCalledTimes(1);

    await act(async () =>
      finish({ ok: true, files: [{ name: "report.pdf", bytes: new Uint8Array([120]) }], logs: "" })
    );

    await waitFor(() => expect(onAddMessage).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("skills.generating")).toBeNull());
    expect(screen.queryByText("skills.saving")).toBeNull();
  });
});
