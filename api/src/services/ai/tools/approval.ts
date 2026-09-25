import { CompleteChatRequest, IMCPServer } from "@/types/ai.types";
import { createLogger } from "@/utils/logger";

const logger = createLogger(__filename);

/** What the model gets instead of the tool's result when the user said no */
export const TOOL_CALL_DECLINED = (toolName: string) =>
  `The user declined this call of ${toolName}, so it did not run. Do not call it again with the same arguments: ` +
  `go on without it, or ask the user what to do instead.`;

/** What the model gets when nobody can approve the call, e.g. outside a streamed chat answer */
export const TOOL_CALL_UNAPPROVED = (toolName: string) =>
  `${toolName} needs the user's approval for each call, and it cannot be asked for here, so the call did not run.`;

/**
 * Asks the user to approve a call of a tool from an MCP server that requires approval, and waits for
 * the answer. Returns undefined when the call may run, or the text the model gets instead of a result.
 * Servers without requireApproval run their tools right away.
 */
export async function mcpCallRefusal(
  request: CompleteChatRequest | undefined,
  server: IMCPServer,
  toolName: string,
  args: Record<string, unknown>,
  callId: string
): Promise<string | undefined> {
  if (!server.requireApproval) return undefined;

  if (!request?.approveToolCall) {
    logger.warn({ toolName, server: server.name }, "MCP tool call needs approval, but nobody can approve it");
    return TOOL_CALL_UNAPPROVED(toolName);
  }

  const approved = await request.approveToolCall({
    callId,
    serverId: server.id,
    serverName: server.name,
    toolName,
    args,
  });
  return approved ? undefined : TOOL_CALL_DECLINED(toolName);
}
