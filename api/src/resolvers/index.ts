import { ConnectionParams } from "@/middleware/auth.middleware";
import { MessagesService } from "@/services/messages.service";
import { SubscriptionsService, SQSService } from "@/services/messaging";
import { TokenPayload } from "@/utils/jwt";

export * from "./admin.resolver";
export * from "./chat.resolver";
export * from "./document.resolver";
export * from "./message.resolver";
export * from "./user.resolver";
export * from "./model.resolver";

export type GraphQLContext = {
  tokenPayload?: TokenPayload;
  connectionParams: ConnectionParams;
  subscriptionsService?: SubscriptionsService;
  sqsService?: SQSService;
  messagesService?: MessagesService;
};
