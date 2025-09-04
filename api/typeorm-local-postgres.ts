// TypeORM data source
process.env.DB_TYPE = "postgres";

import { DataSource } from "typeorm";
import { ENTITIES } from "./src/entities";

export default new DataSource({
  type: "postgres",
  url: "postgres://katechat:katechat@localhost:5432/katechat",
  username: "katechat",
  password: "katechat",
  migrationsRun: true,
  synchronize: false,
  entities: ENTITIES,
  migrations: ["../db-migrations/postgres/*-*.ts"],
});
