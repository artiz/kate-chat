import express from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { buildSchema } from "graphql";
import cors from "cors";
import { config } from "dotenv";
import path from "path";

// Load environment variables
config();

// Define GraphQL schema
const schema = buildSchema(`
  type Query {
    hello: String
  }
`);

// Define resolvers
const rootValue = {
  hello: () => "Hello, world!",
};

// Create Express server
const app = express();
app.use(cors());
app.use(express.json());

// Set up GraphQL endpoint
app.use(
  "/graphql",
  createHandler({
    schema,
    rootValue,
  })
);

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
});
