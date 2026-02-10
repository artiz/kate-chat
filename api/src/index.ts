process.setMaxListeners(0); // Disable max listeners limit for the process

import "reflect-metadata";
import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import cors from "cors";
import expressStaticGzip from "express-static-gzip";
import { config } from "dotenv";
import { buildSchema } from "type-graphql";
import passport from "passport";
import session from "cookie-session";
import { execute, GraphQLError, subscribe } from "graphql";

import { configurePassport } from "./config/passport";
import { router as authRoutes } from "./controllers/auth.controller";
import { router as healthRoutes } from "./controllers/health.controller";
import { router as filesRoutes } from "./controllers/files.controller";
import { initializeDatabase } from "./config/database";
import {
  ChatResolver,
  MessageResolver,
  UserResolver,
  ModelResolver,
  AdminResolver,
  DocumentResolver,
  CustomModelSettingsResolver,
  MCPServerResolver,
} from "./resolvers";
import { authMiddleware, getUserFromToken, graphQlAuthChecker } from "./middleware/auth.middleware";

import { createHandler } from "graphql-http/lib/use/express";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { createLogger } from "./utils/logger";
import { MAX_INPUT_JSON } from "./config/application";
import { MessagesService } from "@/services/messages.service";
import { HttpError } from "./types/exceptions";
import { SQSService, SubscriptionsService } from "./services/messaging";
import { servicesMiddleware } from "./middleware/services.middleware";

// Load environment variables
config();

const isProd = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";
const logger = createLogger("server");

let subscriptionsService: SubscriptionsService | undefined;
let sqsService: SQSService | undefined;
let messagesService: MessagesService | undefined;
async function bootstrap() {
  // Initialize database connection
  const dbConnected = await initializeDatabase();
  if (!dbConnected) {
    process.exit(1);
  }

  subscriptionsService = new SubscriptionsService();
  messagesService = new MessagesService(subscriptionsService);
  sqsService = new SQSService(subscriptionsService);
  await sqsService.startup();

  const schemaPubSub = {
    publish: (routingKey: string, ...args: unknown[]) => {
      messagesService!.publishGraphQL(routingKey, args?.length === 1 ? args[0] : args);
    },
    subscribe: (routingKey: string, dynamicId?: unknown): AsyncIterable<unknown> => {
      return messagesService!.subscribeGraphQL(routingKey, dynamicId);
    },
  };

  // Build GraphQL schema
  const schema = await buildSchema({
    resolvers: [
      ChatResolver,
      MessageResolver,
      UserResolver,
      ModelResolver,
      CustomModelSettingsResolver,
      AdminResolver,
      DocumentResolver,
      MCPServerResolver,
    ],
    validate: false,
    emitSchemaFile: path.resolve(__dirname, "schema.graphql"),
    pubSub: schemaPubSub,
    authChecker: graphQlAuthChecker,
  });

  // Create Express application
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim());

  const app = express();
  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
      maxAge: 86_400, // 24 hours in seconds without subsequent OPTIONS requests
    })
  );
  app.use(express.json({ limit: MAX_INPUT_JSON }));
  app.use(cookieParser());

  // Set up session and passport
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "katechat-secret",
      httpOnly: true,
      secure: isProd,
      name: "user-session",
    })
  );

  // Initialize and configure Passport
  app.use(passport.initialize());
  app.use(passport.session());
  configurePassport();

  // Set up JWT auth middleware for GraphQL
  app.use(authMiddleware);
  app.use(servicesMiddleware(subscriptionsService, sqsService));

  // Set up routes
  app.use("/health", healthRoutes);
  app.use("/auth", authRoutes);
  app.use("/files", filesRoutes);

  /**
   * Development-time endpoint for esbuild hot reloading to test Docker container locally.
   * This endpoint is used to enable live updates during development.
   */
  function esbuildStub(req: Request, res: Response) {
    const headers = {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    };
    res.writeHead(200, headers);
  }
  app.get("/esbuild", esbuildStub);

  // Set up HTTP GraphQL endpoint (must be before static handler)
  app.use(
    "/graphql",
    createHandler({
      schema,
      context: req => {
        // Use the user from the request (set by authMiddleware)
        return {
          tokenPayload: req.raw.tokenPayload,
          connectionParams: req.raw.connectionParams || {},
          subscriptionsService,
          sqsService,
          messagesService,
        };
      },
      formatError: (error: GraphQLError | Error) => {
        // logger.error(error, "GraphQL error");
        if (error instanceof GraphQLError) {
          return error;
        }

        return {
          message: error.message,
          name: error.name || "InternalServerError",
          extensions: {
            cause: error.cause,
          },
          locations: error.stack
            ? error.stack.split("\n").map(line => {
                const match = line.match(/at (.+):(\d+):(\d+)/);
                return match ? { line: parseInt(match[2], 10), column: parseInt(match[3], 10) } : undefined;
              })
            : undefined,
        };
      },
    })
  );

  const clientDir = fs.existsSync(path.join(__dirname, "client"))
    ? path.join(__dirname, "client")
    : path.join(__dirname, "..", "client");

  const staticHandler = expressStaticGzip(clientDir, {
    enableBrotli: true,
    orderPreference: ["br", "gz"],
    index: false,
    serveStatic: {
      etag: true,
    },
  });
  app.use("/", staticHandler);
  // SPA fallback: serve index.html for root and client-side routes
  const serveIndex = (req: Request, res: Response, next: NextFunction) => {
    const indexPath = path.join(clientDir, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  };
  app.get("/", serveIndex);
  app.use("/*path", serveIndex);

  // last one - error handler
  const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof HttpError) {
      logger.error(err, "HTTP error");
      res.status(err.statusCode).send({
        status: err.statusCode,
        message: err.message,
        details: err.details,
      });
    } else {
      logger.error(err, "Unhandled error in request");
      res.status(500).send({
        status: 500,
        name: err.name || "InternalServerError",
        message: "Something went wrong",
      });
    }
  };

  app.use(errorHandler);

  // Create HTTP server
  const httpServer = createServer(app);

  // Create and setup WebSocket server for GraphQL subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql/subscriptions",
  });

  // Set up GraphQL over WebSocket
  const wsServerCleanup = useServer(
    {
      schema,
      execute,
      subscribe,
      context: ctx => {
        // Extract user from the authorization token
        const { connectionParams } = ctx;

        // Extract the authorization header
        const authHeader = (connectionParams?.authorization as string) || "";
        const tokenPayload = getUserFromToken(authHeader);

        if (tokenPayload) {
          logger.trace({ email: tokenPayload.email }, "Authenticated WebSocket connection");
        } else {
          logger.warn("WebSocket connection could not be authenticated");
        }

        return {
          tokenPayload,
        };
      },
      onSubscribe: (ctx, msg) => {
        const chatId = msg.payload?.variables?.chatId;
        if (chatId) {
          messagesService!.connectClient(ctx.extra.socket, ctx.extra.request, chatId as string);
        }
      },
      onClose: async ctx => {
        messagesService!.disconnectClient(ctx.extra.socket);
      },
      onError: (ctx, error) => {
        logger.error({ ctx, error }, "GraphQL subscription error");
      },
    },
    wsServer
  );

  // Start the server
  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}, origins: ${allowedOrigins.join(", ")}`);
    logger.info(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
    logger.info(`GraphQL subscriptions: ws://localhost:${PORT}/graphql/subscriptions`);
  });

  httpServer.on("close", async () => {
    logger.info("Shutting down server...");
    wsServerCleanup.dispose();
  });
}

process.on("SIGINT", async () => {
  console.log("Gracefully shutting down from SIGINT (Ctrl-C)...");
  if (sqsService) {
    await sqsService.shutdown();
  }
  if (subscriptionsService) {
    await subscriptionsService.shutdown();
  }

  return process.exit(0);
});

// Start the application
bootstrap().catch(async error => {
  logger.error(error, "Error starting server");
  if (sqsService) {
    await sqsService.shutdown();
  }
  if (subscriptionsService) {
    await subscriptionsService.shutdown();
  }
  process.exit(1);
});
