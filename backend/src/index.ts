import "reflect-metadata";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { config } from "dotenv";
import { buildSchema } from "type-graphql";
import { initializeDatabase } from "./config/database";
import { ChatResolver } from "./resolvers/chat.resolver";
import { MessageResolver, NEW_MESSAGE } from "./resolvers/message.resolver";
import { UserResolver } from "./resolvers/user.resolver";
import { ModelResolver } from "./resolvers/model.resolver";
import path from "path";
import { authMiddleware, graphQlAuthChecker } from "./middleware/authMiddleware";
import { execute, subscribe } from "graphql";
import { createHandler } from "graphql-http/lib/use/express";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { PubSub } from "graphql-subscriptions";
import { MessageType } from "./entities/Message";
import { logger } from "./utils/logger";

// Load environment variables
config();

const OUTPUT_FOLDER = process.env.OUTPUT_FOLDER || path.join(__dirname, "../output");

async function bootstrap() {
  // Initialize database connection
  const dbConnected = await initializeDatabase();
  if (!dbConnected) {
    process.exit(1);
  }

  // Create PubSub instance for subscriptions
  const pubSub = new PubSub();

  const schemaPubSub = {
    publish: (routingKey: string, ...args: unknown[]) => {
      pubSub.publish(routingKey, args?.length === 1 ? args[0] : args);
    },
    subscribe: (routingKey: string, dynamicId?: unknown): AsyncIterable<unknown> => {
      return {
        [Symbol.asyncIterator]: () => pubSub.asyncIterator(routingKey),
      };
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
  app.use(cors());
  app.use(express.json());

  // Set up auth middleware
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
        const { getUserFromToken } = require("./middleware/authMiddleware");
        const user = getUserFromToken(authHeader);

        if (user) {
          logger.trace({ email: user.email }, "Authenticated WebSocket connection");
        } else {
          logger.warn("WebSocket connection could not be authenticated");
        }

        return {
          user,
          pubSub, // Add pubSub to the WebSocket context
        };
      },
      onSubscribe: (ctx, msg) => {
        const chatId = msg.payload?.variables?.chatId;
        if (chatId) {
          setTimeout(() => {
            pubSub.publish(NEW_MESSAGE, { chatId, data: { type: MessageType.SYSTEM } });
          }, 500);
        }
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
          user: req.raw.user,
          pubSub, // Add pubSub to the context
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
  logger.error({ error }, "Error starting server");
  process.exit(1);
});
