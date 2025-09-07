// TypeORM data source
process.env.DB_TYPE = "mssql";

import { DataSource } from "typeorm";
import { ENTITIES } from "./src/entities";

export default new DataSource({
  type: "mssql",
  host: "localhost",
  database: "katechat",
  username: "sa",
  password: "Katechat@!",
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  migrationsRun: true,
  synchronize: false,
  entities: ENTITIES,
  migrations: ["../db-migrations/mssql/*-*.ts"],
});
