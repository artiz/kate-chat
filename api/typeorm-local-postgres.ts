import { DataSource } from "typeorm";
import { User, Model, Chat, Message, Document, ChatDocument, DocumentChunk } from "./src/entities";
// TypeORM data source
process.env.DB_TYPE = "postgres";

export default new DataSource({
  type: "postgres",
  url: "postgres://katechat:katechat@localhost:5432/katechat",
  username: "katechat",
  password: "katechat",
  migrationsRun: true,
  synchronize: false,
  entities: [User, Model, Chat, Message, Document, ChatDocument, DocumentChunk],
  migrations: ["../db-migrations/*-*.ts"],
});
