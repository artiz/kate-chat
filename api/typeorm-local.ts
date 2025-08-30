import { DataSource } from "typeorm";
import { load, Db } from "sqlite-vec";
import { User, Model, Chat, Message, Document, ChatDocument, DocumentChunk } from "./src/entities";

// TypeORM data source
export default new DataSource({
  type: "better-sqlite3",
  database: "katechat.sqlite",
  migrationsRun: true,
  synchronize: false,
  entities: [User, Model, Chat, Message, Document, ChatDocument, DocumentChunk],
  migrations: ["../db-migrations/*-*.ts"],
  prepareDatabase: (db: Db) => load(db),
});
