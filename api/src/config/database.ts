import { DataSource, DataSourceOptions, ObjectLiteral, QueryFailedError, Repository, Migration } from "typeorm";
import path from "path";
import { Chat, Message, Model, User, Document, ChatDocument } from "@/entities";
import { logger } from "@/utils/logger";
import { TypeORMPinoLogger } from "@/utils/logger/typeorm.logger";
import pgvector from "pgvector";

const logging = !!process.env.DB_LOGGING;
const DB_MIGRATIONS_PATH = process.env.DB_MIGRATIONS_PATH || path.join(__dirname, "../../../db-migrations/*.ts");

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
  const ssl = ["1", "true", "y", "yes"].includes(process.env.DB_SSL?.toLowerCase() || "");

  dbOptions = {
    type: "postgres",
    url: process.env.DB_URL,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: ssl ? { rejectUnauthorized: false } : false,
  };
} else if (process.env.DB_TYPE === "mssql") {
  dbOptions = {
    type: "mssql",
    url: process.env.DB_URL,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
} else if (process.env.DB_TYPE && process.env.DB_TYPE !== "sqlite") {
  throw new Error(`Unsupported DB_TYPE: ${process.env.DB_TYPE}`);
}

// Create TypeORM data source
export const AppDataSource = new DataSource({
  ...dbOptions,
  synchronize: false,
  migrationsRun: true,
  migrationsTableName: "migrations",
  logger: logging ? new TypeORMPinoLogger() : undefined,
  logging,
  entities: [User, Model, Chat, Message, Document, ChatDocument],
  migrations: [DB_MIGRATIONS_PATH],
});

// Helper function to get a repository from the data source
export function getRepository<T extends ObjectLiteral>(entityClass: new () => T): Repository<T> {
  return AppDataSource.getRepository(entityClass);
}

// Initialize the database connection
export async function initializeDatabase() {
  try {
    await AppDataSource.initialize();

    let migrations = "";
    try {
      const migrationsData = (await AppDataSource.query("SELECT * FROM migrations")) as Migration[];
      migrations = migrationsData.map(m => m.name).join(", ");
    } catch (err) {
      logger.warn("Migrations table does not exist yet. Skipping migrations list.");
    }
    logger.info({ logging, migrations, DB_MIGRATIONS_PATH }, "Database connection established");

    return true;
  } catch (error) {
    // retry in case of parallel run
    if (error instanceof QueryFailedError) {
      logger.error(error, "Error initializing database connection, retrying in 3s...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      return initializeDatabase();
    }

    logger.error(error, "Error connecting to database");
    return false;
  }
}

export const formatDateFloor =
  dbOptions.type === "sqlite"
    ? (date: Date) => {
        const d = new Date(date);
        d.setMilliseconds(d.getMilliseconds() - 1); // SQLite requires a small adjustment to avoid precision issues
        return d;
      }
    : (date: Date) => date;

export const formatDateCeil =
  dbOptions.type === "sqlite"
    ? (date: Date) => {
        const d = new Date(date);
        d.setMilliseconds(d.getMilliseconds() + 1); // SQLite requires a small adjustment to avoid precision issues
        return d;
      }
    : (date: Date) => date;

export function EmbeddingTransformer() {
  if (process.env.DB_TYPE === "postgres") {
    return {
      to: (value: number[]) => pgvector.toSql(value),
      from: (value: string | null | undefined) =>
        typeof value === "string" ? (pgvector.fromSql(value) as number[]) : value,
    };
  }

  return {
    to: (value: number[]) => value?.join(","),
    from: (value: string | null | undefined) =>
      typeof value === "string" ? (value.split(",").map(Number) as number[]) : undefined,
  };
}
