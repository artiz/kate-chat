import React from "react";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { SkillsUsed } from "../components/chat/message-details-plugins/SkillsUsed";
import { Message } from "../types/graphql";

const t = ((key: string) => key) as never;
const message = (content: string, toolCalls: { name: string; args?: string }[] = []) =>
  ({ id: "m1", content, metadata: { toolCalls } }) as unknown as Message;

describe("SkillsUsed", () => {
  it("lists the skills an answer loaded or used, with the files it made", () => {
    const answer = "Here:\n\n```python skill=office-edit file=deck-v2.pptx\nsave(prs, 'deck-v2.pptx')\n```";
    render(
      <MantineProvider>
        {SkillsUsed(
          message(answer, [
            { name: "use_skill", args: '{"skill":"office-edit"}' },
            { name: "use_skill", args: '{"skill":"pptx"}' },
            { name: "internal_web_search", args: '{"query":"x"}' },
          ]),
          t
        )}
      </MantineProvider>
    );
    expect(screen.getByText("messageDetails.skillsUsed")).toBeTruthy();
    expect(screen.getByText(/→ deck-v2\.pptx/).textContent).toBe("office-edit → deck-v2.pptx");
    expect(screen.getByText("pptx")).toBeTruthy();
    expect(screen.queryByText("internal_web_search")).toBeNull();
  });

  it("shows nothing for an answer without skills", () => {
    expect(SkillsUsed(message("Just text", [{ name: "internal_web_search" }]), t)).toBeNull();
  });
});
