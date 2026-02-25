import { DataSource, DataSourceOptions, ObjectLiteral, QueryFailedError, Repository, Migration } from "typeorm";
import _ from "lodash";
import { load as sqliteVecLoad } from "sqlite-vec";
import { logger } from "../utils/logger";
import { TypeORMPinoLogger } from "../utils/logger/typeorm.logger";
import { globalConfig } from "../global-config";
import { ENTITIES } from "../entities";
import { DB_SKIP_MIGRATIONS, DB_TYPE } from "./env";

const dbConfig = globalConfig.db;

let dbOptions: DataSourceOptions = {
  type: "better-sqlite3",
  database: dbConfig.name || "katechat.sqlite",
  prepareDatabase: db => sqliteVecLoad(db),
};

if (DB_TYPE === "mysql") {
  dbOptions = {
    type: "mysql",
    charset: "UTF8_GENERAL_CI",
    url: dbConfig.url,
  };
} else if (DB_TYPE === "postgres") {
  dbOptions = {
    type: "postgres",
    url: dbConfig.url,
    username: dbConfig.username,
    password: dbConfig.password,
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
  };
} else if (DB_TYPE === "mssql") {
  dbOptions = {
    type: "mssql",
    host: dbConfig.host,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.name,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
  };
} else if (DB_TYPE && DB_TYPE !== "sqlite") {
  throw new Error(`Unsupported DB_TYPE: ${DB_TYPE}`);
}

logger.debug(_.pick(dbConfig, ["type", "host", "database"]), "Database connection options");

// Create TypeORM data source
export const AppDataSource = new DataSource({
  ...dbOptions,
  synchronize: false,
  migrationsRun: !DB_SKIP_MIGRATIONS,
  migrationsTableName: "migrations",
  logger: dbConfig.logging ? new TypeORMPinoLogger() : undefined,
  logging: dbConfig.logging ? ["error", "warn", "info"] : false,
  entities: ENTITIES,
  migrations: DB_SKIP_MIGRATIONS ? [] : [dbConfig.migrationsPath],
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
    logger.info(
      { logging: dbConfig.logging, migrations, migrationsPath: dbConfig.migrationsPath },
      "Database connection established"
    );

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
