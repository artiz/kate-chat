process.setMaxListeners(0); // Disable max listeners limit for the process

import "reflect-metadata";
import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import path from "path";
import cors from "cors";
import { config } from "dotenv";
import { buildSchema } from "type-graphql";
import session from "express-session";
import passport from "passport";
import { configurePassport } from "./config/passport";
import authRoutes from "./controllers/auth.controller";
import healthRoutes from "./controllers/health.controller";
import filesRoutes from "./controllers/files.controller";
import { initializeDatabase } from "./config/database";
import { ChatResolver } from "./resolvers/chat.resolver";
import { MessageResolver, NEW_MESSAGE } from "./resolvers/message.resolver";
import { UserResolver } from "./resolvers/user.resolver";
import { ModelResolver } from "./resolvers/model.resolver";
import { AdminResolver } from "./resolvers/admin.resolver";
import { authMiddleware, getUserFromToken, graphQlAuthChecker } from "./middleware/auth.middleware";
import { execute, GraphQLError, subscribe } from "graphql";
import { createHandler } from "graphql-http/lib/use/express";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { createLogger } from "./utils/logger";
import { MAX_INPUT_JSON } from "./config/application";
import { MessagesService } from "@/services/messages.service";
import { HttpError } from "./types/exceptions";

// Load environment variables
config();

const logger = createLogger("server");

async function bootstrap() {
  // Initialize database connection
  const dbConnected = await initializeDatabase();
  if (!dbConnected) {
    process.exit(1);
  }

  const messagesService = new MessagesService();

  const schemaPubSub = {
    publish: (routingKey: string, ...args: unknown[]) => {
      messagesService.publishGraphQL(routingKey, args?.length === 1 ? args[0] : args);
    },
    subscribe: (routingKey: string, dynamicId?: unknown): AsyncIterable<unknown> => {
      return messagesService.subscribeGraphQL(routingKey, dynamicId);
    },
  };

  // Build GraphQL schema
  const schema = await buildSchema({
    resolvers: [ChatResolver, MessageResolver, UserResolver, ModelResolver, AdminResolver],
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
      resave: false,
      saveUninitialized: false,
      cookie: { secure: process.env.NODE_ENV === "production" },
    })
  );

  // Initialize and configure Passport
  app.use(passport.initialize());
  app.use(passport.session());
  configurePassport();

  // Set up JWT auth middleware for GraphQL
  app.use(authMiddleware);

  // Set up routes
  app.use("/health", healthRoutes);
  app.use("/auth", authRoutes);
  app.use("/files", filesRoutes);
  app.use("/api/files", filesRoutes);

  // Create HTTP server
  const httpServer = createServer(app);

  // Create and setup WebSocket server for GraphQL subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql/subscriptions",
  });

  // Set up GraphQL over WebSocket
  const serverCleanup = useServer(
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
          messagesService.connectClient(ctx.extra.socket, ctx.extra.request, chatId as string);
        }
      },
      onClose: ctx => {
        messagesService.disconnectClient(ctx.extra.socket);
      },
      onError: (ctx, error) => {
        logger.error({ ctx, error }, "GraphQL subscription error");
      },
    },
    wsServer
  );

  // Set up HTTP GraphQL endpoint
  app.use(
    "/graphql",
    createHandler({
      schema,
      context: req => {
        // Use the user from the request (set by authMiddleware)
        return {
          tokenPayload: req.raw.tokenPayload,
          connectionParams: req.raw.connectionParams || {},
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
          locations: error.stack ? error.stack.split("\n").map(line => {
            const match = line.match(/at (.+):(\d+):(\d+)/);
            return match ? { line: parseInt(match[2], 10), column: parseInt(match[3], 10) } : undefined;
          }) : undefined,
        };
      },
    })
  );

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

  // Start the server
  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}, origins: ${allowedOrigins.join(", ")}`);
    logger.info(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
    logger.info(`GraphQL subscriptions: ws://localhost:${PORT}/graphql/subscriptions`);
  });

  httpServer.on("close", () => serverCleanup.dispose());
}

// Start the application
bootstrap().catch(error => {
  logger.error(error, "Error starting server");
  process.exit(1);
});
