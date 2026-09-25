jest.mock("@katechat/ui", () => ({
  MessageRole: { ASSISTANT: "assistant", USER: "user" },
  ResponseStatus: { TOOL_APPROVAL: "tool_approval", COMPLETED: "completed" },
}));

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { MantineProvider } from "@mantine/core";
import { ANSWER_TOOL_APPROVAL_MUTATION } from "../store/services/graphql.queries";
import { ToolApprovals } from "../components/chat/plugins/ToolApprovals";
import { Message, ToolApproval } from "../types/graphql";

const approval = (status: ToolApproval["status"], callId = "c1"): ToolApproval => ({
  callId,
  serverName: "Gmail",
  toolName: "send_email",
  args: '{"to":"boss@example.com"}',
  status,
});

const message = (approvals: ToolApproval[], status = "tool_approval") =>
  ({
    id: "m1",
    chatId: "chat-1",
    role: "assistant",
    content: "",
    status,
    metadata: { toolApprovals: approvals },
  }) as unknown as Message;

const renderApprovals = (msg: Message, mocks: never[] = [], readOnly = false) =>
  render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <MantineProvider>
        <ToolApprovals message={msg} messagesCount={1} readOnly={readOnly} />
      </MantineProvider>
    </MockedProvider>
  );

describe("ToolApprovals", () => {
  it("shows a waiting call with its arguments and sends the user's answer", async () => {
    const answered = jest.fn(() => ({ data: { answerToolApproval: { id: "m1" } } }));
    renderApprovals(message([approval("pending")]), [
      {
        request: {
          query: ANSWER_TOOL_APPROVAL_MUTATION,
          variables: { messageId: "m1", callId: "c1", approved: true },
        },
        result: answered,
      },
    ] as never[]);

    expect(screen.getByText("toolApproval.title")).toBeTruthy();
    expect(screen.getByText(/boss@example\.com/)).toBeTruthy();

    fireEvent.click(screen.getByText("toolApproval.approve"));
    await waitFor(() => expect(answered).toHaveBeenCalled());
  });

  it("shows no buttons to a viewer who cannot answer", () => {
    renderApprovals(message([approval("pending")]), [], true);
    expect(screen.getByText("toolApproval.title")).toBeTruthy();
    expect(screen.queryByText("toolApproval.approve")).toBeNull();
  });

  it("lists calls that did not run once the answer is over", () => {
    renderApprovals(
      message([approval("approved", "c0"), approval("denied", "c1"), approval("pending", "c2")], "completed")
    );
    expect(screen.queryByText("toolApproval.title")).toBeNull();
    expect(screen.getByText("toolApproval.denied")).toBeTruthy();
    // the answer ended while this call waited
    expect(screen.getByText("toolApproval.expired")).toBeTruthy();
  });

  it("shows nothing for answers without approvals", () => {
    renderApprovals(message([], "completed"));
    expect(screen.queryByText(/toolApproval/)).toBeNull();
  });
});
