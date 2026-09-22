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

// DB_URL and the discrete DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME variables are both
// accepted, for every flavour. TypeORM merges them as Object.assign({}, options, parsedUrl) with
// the url's undefined parts dropped, so a url wins wherever it says something and the discrete
// variables fill in the rest. Each flavour used to read its own subset, which left the same .env
// working against one database and silently connecting as nobody against another.
const connection = {
  url: dbConfig.url,
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.username,
  password: dbConfig.password,
  database: dbConfig.name,
};

if (DB_TYPE === "mysql") {
  dbOptions = {
    ...connection,
    type: "mysql",
    charset: "UTF8_GENERAL_CI",
    // MySQL has no zone-aware type worth moving to here: datetime is naive and timestamp ends in
    // 2038. Pinning the session zone instead makes both sides agree, the CURRENT_TIMESTAMP default
    // included, whatever zone the server keeps.
    timezone: "Z",
  };
} else if (DB_TYPE === "postgres") {
  dbOptions = {
    ...connection,
    type: "postgres",
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
  };
} else if (DB_TYPE === "mssql") {
  dbOptions = {
    ...connection,
    type: "mssql",
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
  // The MSSQL search migration opts out of transactions, because a full-text catalog cannot be
  // created inside one, and TypeORM refuses any such override while the mode is "all". That is
  // why typeorm-local-mssql.ts already runs "each"; without the same here the API cannot apply
  // its own migrations on startup. Every other flavour keeps the stricter all-or-nothing mode.
  migrationsTransactionMode: DB_TYPE === "mssql" ? "each" : "all",
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
