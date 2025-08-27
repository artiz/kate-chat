import { DataSource } from "typeorm";
import { Chat, Message, Model, User } from "./src/entities";
// TypeORM data source
export default new DataSource({
  type: "sqlite",
  database: "katechat.sqlite",
  migrationsRun: true,
  synchronize: false,
  entities: [User, Chat, Message, Model],
  migrations: ["../db-migrations/*.ts"],
});
