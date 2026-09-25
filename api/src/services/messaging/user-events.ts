import "reflect-metadata";
import { Field, ObjectType } from "type-graphql";
import { Message } from "@/entities/Message";
import { MessageChatInfo } from "@/types/graphql/responses";
import { MessageRole, ResponseStatus } from "@/types/api";

export type UserChatEventKind = "completed" | "error" | "approval";

/**
 * Something in one of the user's chats that the browser tells them about when they look elsewhere:
 * an answer finished or failed, or a tool call waits for their approval.
 */
@ObjectType()
export class UserChatEvent {
  @Field()
  chatId: string;

  @Field()
  messageId: string;

  @Field(() => String)
  kind: UserChatEventKind;

  @Field({ nullable: true })
  chatTitle?: string;

  /** the tool call that waits, for "approval" */
  @Field({ nullable: true })
  callId?: string;

  /** the answer's text for "completed" and "error"; "<server>: <tool>" for "approval" */
  @Field({ nullable: true })
  text?: string;
}

/** What goes to the chat's subscribers on the chat messages channel (see SubscriptionsService) */
export interface ChatMessagePayload {
  chatId: string;
  data?: { message?: Message; chat?: MessageChatInfo; streaming?: boolean };
}

const TEXT_LENGTH = 300;

/** The event a chat message update means for the given user, if any */
export function userChatEventOf(payload: ChatMessagePayload, userId?: string): UserChatEvent | undefined {
  const message = payload?.data?.message;
  if (!userId || !message?.id || (message.userId ?? message.user?.id) !== userId) return undefined;
  // parallel answers of other models to the same question
  if (message.linkedToMessageId) return undefined;

  const event = { chatId: payload.chatId, messageId: message.id, chatTitle: payload.data?.chat?.title };

  if (message.status === ResponseStatus.TOOL_APPROVAL) {
    const pending = message.metadata?.toolApprovals?.filter(approval => approval.status === "pending") || [];
    const approval = pending[pending.length - 1];
    if (!approval) return undefined;
    return {
      ...event,
      kind: "approval",
      callId: approval.callId,
      text: `${approval.serverName}: ${approval.toolName}`,
    };
  }

  if (payload.data?.streaming || message.status !== ResponseStatus.COMPLETED) return undefined;
  const text = (message.content || "").slice(0, TEXT_LENGTH);
  if (message.role === MessageRole.ERROR) return { ...event, kind: "error", text };
  if (message.role === MessageRole.ASSISTANT) return { ...event, kind: "completed", text };
  return undefined;
}
