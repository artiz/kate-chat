import { Request, Response, NextFunction } from "express";
import { SQSService, SubscriptionsService } from "@/services/messaging";
import { MessagesService } from "@/services/messages.service";

declare global {
  namespace Express {
    interface Request {
      subscriptionsService?: SubscriptionsService;
      sqsService?: SQSService;
      messagesService?: MessagesService;
    }
  }
}

// Export the middleware
export const servicesMiddleware =
  (subscriptionsService?: SubscriptionsService, sqsService?: SQSService, messagesService?: MessagesService) =>
  (req: Request, res: Response, next: NextFunction) => {
    req.subscriptionsService = subscriptionsService;
    req.sqsService = sqsService;
    req.messagesService = messagesService;
    next();
  };
