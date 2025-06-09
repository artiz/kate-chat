import "reflect-metadata";
import express from "express";
import { createServer } from "http";
import path from "path";
import cors from "cors";
import { config } from "dotenv";
import { buildSchema } from "type-graphql";
import session from "express-session";
import passport from "passport";
import { configurePassport } from "./config/passport";
import authRoutes from "./controllers/auth.controller";
import { initializeDatabase } from "./config/database";
import { ChatResolver } from "./resolvers/chat.resolver";
import { MessageResolver, NEW_MESSAGE } from "./resolvers/message.resolver";
import { UserResolver } from "./resolvers/user.resolver";
import { ModelResolver } from "./resolvers/model.resolver";
import { authMiddleware, getUserFromToken, graphQlAuthChecker } from "./middleware/auth.middleware";
import { execute, subscribe } from "graphql";
import { createHandler } from "graphql-http/lib/use/express";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { createLogger } from "./utils/logger";
import { MAX_INPUT_JSON } from "./config/application";
import { MessagesService } from "@/services/messages.service";

// Load environment variables
config();

const logger = createLogger("server");

const OUTPUT_FOLDER = process.env.OUTPUT_FOLDER || path.join(__dirname, "../output");

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
    resolvers: [ChatResolver, MessageResolver, UserResolver, ModelResolver],
    validate: false,
    emitSchemaFile: path.resolve(__dirname, "schema.graphql"),
    pubSub: schemaPubSub,
    authChecker: graphQlAuthChecker,
  });

  // Create Express application
  const app = express();
  app.use(
    cors({
      origin: true,
      credentials: true,
      maxAge: 86_400, // 24 hours in seconds without subsequent OPTIONS requests
    })
  );
  app.use(express.json({ limit: MAX_INPUT_JSON }));

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

  // Set up auth routes
  app.use("/api/auth", authRoutes);

  // Set up JWT auth middleware for GraphQL
  app.use(authMiddleware);
  app.use("/output", express.static(OUTPUT_FOLDER));

  logger.info({ output: OUTPUT_FOLDER }, "Express application initialized");

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
        const user = getUserFromToken(authHeader);

        if (user) {
          logger.trace({ email: user.email }, "Authenticated WebSocket connection");
        } else {
          logger.warn("WebSocket connection could not be authenticated");
        }

        return {
          user,
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
    })
  );

  // Start the server
  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
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
