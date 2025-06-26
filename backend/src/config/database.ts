import {
  AbstractLogger,
  DataSource,
  DataSourceOptions,
  LogLevel,
  LogMessage,
  ObjectLiteral,
  QueryFailedError,
  QueryRunner,
  Repository,
} from "typeorm";
import { Chat } from "../entities/Chat";
import { Message } from "../entities/Message";
import { Model } from "../entities/Model";
import { User } from "../entities/User";
import { logger } from "../utils/logger";
import { TypeORMPinoLogger } from "../utils/logger/typeorm.logger";

const logging = !!process.env.DB_LOGGING;

let dbOptions: DataSourceOptions = {
  type: "sqlite",
  database: process.env.DB_NAME || "katechat.sqlite",
};

if (process.env.DB_TYPE === "mysql") {
  dbOptions = {
    type: "mysql",
    url: process.env.DB_URL,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
} else if (process.env.DB_TYPE === "postgres") {
  dbOptions = {
    type: "postgres",
    url: process.env.DB_URL,
  };
} else if (process.env.DB_TYPE === "mssql") {
  dbOptions = {
    type: "mssql",
    url: process.env.DB_URL,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
} else if (process.env.DB_TYPE === "mongodb") {
  dbOptions = {
    type: "mongodb",
    url: process.env.DB_URL,
  };
} else if (process.env.DB_TYPE && process.env.DB_TYPE !== "sqlite") {
  throw new Error(`Unsupported DB_TYPE: ${process.env.DB_TYPE}`);
}

// Create TypeORM data source
export const AppDataSource = new DataSource({
  ...dbOptions,
  synchronize: true,
  migrationsRun: true,
  logger: logging ? new TypeORMPinoLogger() : undefined,
  logging,
  entities: [User, Chat, Message, Model],
});

// Helper function to get a repository from the data source
export function getRepository<T extends ObjectLiteral>(entityClass: new () => T): Repository<T> {
  return AppDataSource.getRepository(entityClass);
}

// Initialize the database connection
export async function initializeDatabase() {
  try {
    await AppDataSource.initialize();
    logger.info({ logging }, "Database connection established");
    return true;
  } catch (error) {
    // retry in case of parallel run
    if (error instanceof QueryFailedError) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return initializeDatabase();
    }

    logger.error(error, "Error connecting to database");
    return false;
  }
}
