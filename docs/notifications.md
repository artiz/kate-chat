# Browser notifications and tool call approvals

KateChat tells the user when something in one of their chats needs them while they look elsewhere: in another chat, another tab or another window.

- **An answer is ready**, or it failed.
- **A tool call waits for approval**: a tool of an MCP server that asks first wants to run.

## Browser notifications

- The browser asks for the permission once, when the user sends their first message. Afterwards the switch in **Profile → Browser notifications** turns notifications on and off, and asks again if needed. The setting is per browser, like the permission itself. A blocked permission is changed in the browser's site settings.
- No notification appears while the user looks at that chat: the page is visible, has the focus and shows that chat. A click on a notification brings the tab forward and opens the chat.
- A notification about a waiting tool call stays on screen until the user clicks it or closes it (`requireInteraction`). An answer that fails gets its own title.
- Without the permission, a waiting tool call in another chat still shows up as an in-app notification, as long as the page is active.
- Each event is shown once. Several tabs of the app show the same notification once, because they share its `tag`.
- The events come from the `userChatEvents` GraphQL subscription. It carries the messages of all the user's chats from the chat messages channel, which Redis relays between API instances. It keeps only:
  - answers that finished (`completed`) or failed (`error`);
  - answers whose status is `tool_approval` (`approval`).

  Parallel answers from **Call other model** are left out. `api/src/services/messaging/user-events.ts` decides what counts.

## MCP tool call approval

An MCP server can be marked **Ask before calling tools** (`requireApproval`) in its settings (the MCP servers page, or the admin page for system servers).

When the model calls a tool of such a server, the answer waits:

1. The call is saved in the answer's `metadata.toolApprovals` with the status `pending`, and the message status becomes `tool_approval`.
2. The chat shows the server, the tool and its arguments, with **Approve** and **Deny** buttons. A browser notification goes out as described above.
3. The user's answer goes through the `answerToolApproval(messageId, callId, approved)` mutation. Redis relays it to the API instance that runs the answer (the `chat:tool-approvals` channel, `TOOL_APPROVALS_CHANNEL`). Without Redis, it goes to the same process.
4. If approved, the tool runs and the answer goes on as usual. If denied, the tool does not run. The model gets a result telling it that the user declined the call and should not repeat it.

A call the user leaves unanswered counts as declined after `AI_TOOL_APPROVAL_TIMEOUT_SEC` seconds (900 by default), with the status `expired`. Stopping the answer declines the calls that wait. Only the owner of the answer can approve its calls, and a call answered once (in another tab, say) keeps that answer.

Notes:

- The approval gate is in the MCP tool callables of both protocols: Bedrock (`bedrock.tools.ts`) and OpenAI (`openai.tools.ts`), which covers Chat Completions and Responses. See `api/src/services/ai/tools/approval.ts`.
- On the Responses API, OpenAI calls hosted MCP servers itself. A server that asks first is therefore always called by the API, like a local one.
- Where nobody can answer, the call does not run. This is the case outside a streamed answer, and on the Rust API, which stores the setting but cannot ask yet.
- While a call waits, the API keeps renewing the lock of a queued (SQS) request, so the queue does not take the request over.
