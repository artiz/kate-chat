import { DataSource, DataSourceOptions, ObjectLiteral, QueryFailedError, Repository, Migration } from "typeorm";
import path from "path";
import pgvector from "pgvector";
import { load as sqliteVecLoad } from "sqlite-vec";
import { ENTITIES } from "../entities";
import { logger } from "../utils/logger";
import { TypeORMPinoLogger } from "../utils/logger/typeorm.logger";

const logging = !!process.env.DB_LOGGING;

export const DB_TYPE =
  process.env.DB_TYPE === "sqlite" || process.env.DB_TYPE === "better-sqlite3" || !process.env.DB_TYPE
    ? "sqlite"
    : process.env.DB_TYPE;

export const DB_MIGRATIONS_PATH =
  process.env.DB_MIGRATIONS_PATH || path.join(__dirname, `../../../db-migrations/${DB_TYPE}/*-*.ts`);

let dbOptions: DataSourceOptions = {
  type: "better-sqlite3",
  database: process.env.DB_NAME || "katechat.sqlite",
  prepareDatabase: db => sqliteVecLoad(db),
};

if (DB_TYPE === "mysql") {
  dbOptions = {
    type: "mysql",
    charset: "UTF8_GENERAL_CI",
    url: process.env.DB_URL,
  };
} else if (DB_TYPE === "postgres") {
  const ssl = ["1", "true", "y", "yes"].includes(process.env.DB_SSL?.toLowerCase() || "");

  dbOptions = {
    type: "postgres",
    url: process.env.DB_URL,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: ssl ? { rejectUnauthorized: false } : false,
  };
} else if (DB_TYPE === "mssql") {
  dbOptions = {
    type: "mssql",
    host: process.env.DB_HOST,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
  };
} else if (DB_TYPE && DB_TYPE !== "sqlite") {
  throw new Error(`Unsupported DB_TYPE: ${DB_TYPE}`);
}

logger.debug({ ...dbOptions, DB_MIGRATIONS_PATH }, "Database connection options");

// Create TypeORM data source
export const AppDataSource = new DataSource({
  ...dbOptions,
  synchronize: false,
  migrationsRun: true,
  migrationsTableName: "migrations",
  logger: logging ? new TypeORMPinoLogger() : undefined,
  logging,
  entities: ENTITIES,
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
    if (dbOptions.type === "postgres") {
      await AppDataSource.query("CREATE EXTENSION IF NOT EXISTS vector");
    }

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
  DB_TYPE === "sqlite"
    ? (date: Date) => {
        const d = new Date(date);
        d.setMilliseconds(d.getMilliseconds() - 1); // SQLite requires a small adjustment to avoid precision issues
        return d;
      }
    : (date: Date) => date;

export const formatDateCeil =
  DB_TYPE === "sqlite"
    ? (date: Date) => {
        const d = new Date(date);
        d.setMilliseconds(d.getMilliseconds() + 1); // SQLite requires a small adjustment to avoid precision issues
        return d;
      }
    : (date: Date) => date;

export function EmbeddingTransformer(dimensions: number) {
  if (process.env.DB_TYPE === "postgres") {
    return {
      to: (value: number[]) =>
        pgvector.toSql(value.length === dimensions ? value : value.concat(Array(dimensions - value.length).fill(0))),
      from: (value: string | null | undefined) =>
        typeof value === "string" ? (pgvector.fromSql(value) as number[]) : value,
    };
  }

  if (process.env.DB_TYPE === "mssql") {
    return {
      to: (value: number[]) => JSON.stringify(value),
      from: (value: string | null | undefined) => (typeof value === "string" ? JSON.parse(value) : value),
    };
  }

  return {
    to: (value: number[]) => value?.join(","),
    from: (value: string | null | undefined) =>
      typeof value === "string" ? (value.split(",").map(Number) as number[]) : undefined,
  };
}
