import "reflect-metadata";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { config } from "dotenv";
import { buildSchema } from "type-graphql";
import { initializeDatabase } from "./config/database";
import { ChatResolver } from "./resolvers/chat.resolver";
import { MessageResolver } from "./resolvers/message.resolver";
import { UserResolver } from "./resolvers/user.resolver";
import { ModelResolver } from "./resolvers/model.resolver";
import path from "path";
import { authMiddleware, graphQlAuthChecker } from "./middleware/authMiddleware";
import { execute, subscribe } from "graphql";
import { createHandler } from "graphql-http/lib/use/express";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { PubSub } from "graphql-subscriptions";

// Load environment variables
config();

async function bootstrap() {
// Initialize database connection
    const dbConnected = await initializeDatabase();
    if (!dbConnected) {
      console.error("Failed to connect to the database. Exiting...");
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
            }
        }
    }

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

    // Create HTTP server
    const httpServer = createServer(app);

    // Set up Socket.IO
    const io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // Socket.IO connection handler
    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);

      socket.on("join_chat", (chatId) => {
        socket.join(`chat:${chatId}`);
        console.log(`Client ${socket.id} joined chat ${chatId}`);
      });

      socket.on("leave_chat", (chatId) => {
        socket.leave(`chat:${chatId}`);
        console.log(`Client ${socket.id} left chat ${chatId}`);
      });

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
      });
    });

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
        context: (ctx) => {
          // Extract user from the auth token
          const { connectionParams } = ctx;
          const user = connectionParams?.user || null;
          return { 
            user,
            pubSub // Add pubSub to the WebSocket context
          };
        },
      },
      wsServer
    );

    // Set up HTTP GraphQL endpoint
    app.use(
      "/graphql",
      createHandler({
        schema,
        context: (req) => {
          // Use the user from the request (set by authMiddleware)
          return { 
            user: req.raw.user,
            pubSub // Add pubSub to the context
          };
        },
      })
    );

    // Start the server
    const PORT = process.env.PORT || 4000;
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
      console.log(`GraphQL subscriptions: ws://localhost:${PORT}/graphql/subscriptions`);
    });

    httpServer.on("close", () => serverCleanup.dispose());
}

// Start the application
bootstrap().catch(e => {
    console.error("Error starting server:", e);
    process.exit(1);
});
