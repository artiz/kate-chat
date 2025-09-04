process.env.DB_TYPE = "sqlite";

import { DataSource } from "typeorm";
import { load, Db } from "sqlite-vec";
import { ENTITIES } from "./src/entities";

// TypeORM data source
export default new DataSource({
  type: "better-sqlite3",
  database: "katechat.sqlite",
  migrationsRun: true,
  synchronize: false,
  entities: ENTITIES,
  migrations: ["../db-migrations/sqlite/*-*.ts"],
  prepareDatabase: (db: Db) => load(db),
});
