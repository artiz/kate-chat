import { AbstractLogger, DataSource, DataSourceOptions, LogLevel, LogMessage, QueryRunner } from "typeorm";
import { Chat } from "../entities/Chat";
import { Message } from "../entities/Message";
import { Model } from "../entities/Model";
import { ModelProvider } from "../entities/ModelProvider";
import { User } from "../entities/User";

const logging = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";

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
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
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
} else if (process.env.DB_TYPE !== "sqlite") {
    throw new Error(`Unsupported DB_TYPE: ${process.env.DB_TYPE}`);
}

// Create TypeORM data source
export const AppDataSource = new DataSource({
  ...dbOptions,
  synchronize: true,
  migrationsRun: true,
  logger: "advanced-console",
  logging,
  entities: [User, Chat, Message, Model, ModelProvider],
});

// Helper function to get a repository from the data source
export function getMongoRepository<T>(entityClass: any): any {
  return AppDataSource.getRepository(entityClass);
}

// Initialize the database connection
export async function initializeDatabase() {
  try {
    await AppDataSource.initialize();
    console.log(`Database connection established, logging: ${logging}`);
    return true;
  } catch (error) {
    console.error("Error connecting to database:", error);
    return false;
  }
}
