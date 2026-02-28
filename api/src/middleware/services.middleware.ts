import { Request, Response, NextFunction } from "express";
import { DocumentSqsService, RequestsSqsService, SubscriptionsService } from "@/services/messaging";
import { MessagesService } from "@/services/messages.service";

declare global {
  namespace Express {
    interface Request {
      subscriptionsService?: SubscriptionsService;
      documentSqsService?: DocumentSqsService;
      messagesService?: MessagesService;
    }
  }
}

// Export the middleware
export const servicesMiddleware =
  (
    subscriptionsService?: SubscriptionsService,
    documentSqsService?: DocumentSqsService,
    messagesService?: MessagesService
  ) =>
  (req: Request, res: Response, next: NextFunction) => {
    req.subscriptionsService = subscriptionsService;
    req.documentSqsService = documentSqsService;
    req.messagesService = messagesService;
    next();
  };
