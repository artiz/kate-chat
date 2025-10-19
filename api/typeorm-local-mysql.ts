// TypeORM data source
process.env.DB_TYPE = "mysql";

import { DataSource } from "typeorm";
import { ENTITIES } from "./src/entities";

export default new DataSource({
  type: "mysql",
  host: "localhost",
  database: "katechat",
  username: "katechat",
  password: "katechat",
  migrationsRun: true,
  synchronize: false,
  entities: ENTITIES,
  migrations: ["../db-migrations/mysql/*-*.ts"],
});
