import { ConnectionParams } from "@/middleware/auth.middleware";
import { MessagesService } from "@/services/messages.service";
import { SubscriptionsService, DocumentSqsService } from "@/services/messaging";
import { TokenPayload } from "@/utils/jwt";

export * from "./admin.resolver";
export * from "./chat.resolver";
export * from "./document.resolver";
export * from "./folder.resolver";
export * from "./message.resolver";
export * from "./user.resolver";
export * from "./model.resolver";
export * from "./mcp.resolver";

export type GraphQLContext = {
  tokenPayload?: TokenPayload;
  connectionParams: ConnectionParams;
  subscriptionsService?: SubscriptionsService;
  sqsService?: DocumentSqsService;
  messagesService?: MessagesService;
};
