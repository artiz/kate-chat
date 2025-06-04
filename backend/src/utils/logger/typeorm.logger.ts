import { Logger, QueryRunner } from "typeorm";
import { logger } from "./index";

/**
 * Custom TypeORM logger implementation that uses pino
 */
export class TypeORMPinoLogger implements Logger {
  // Log queries
  logQuery(query: string, parameters?: unknown[], queryRunner?: QueryRunner) {
    logger.debug(
      {
        query,
        parameters,
      },
      "TypeORM: query"
    );
  }

  // Log query errors
  logQueryError(error: string | Error, query: string, parameters?: unknown[], queryRunner?: QueryRunner) {
    logger.error(
      {
        error: typeof error === "string" ? { message: error } : error,
        query,
        parameters,
      },
      "TypeORM: error"
    );
  }

  // Log query that is too slow
  logQuerySlow(time: number, query: string, parameters?: unknown[], queryRunner?: QueryRunner) {
    logger.warn(
      {
        query,
        parameters,
        time,
      },
      `TypeORM: slow (${time}ms)`
    );
  }

  // Log schema build
  logSchemaBuild(message: string, queryRunner?: QueryRunner) {
    logger.info({ message }, "TypeORM schema build");
  }

  // Log migration
  logMigration(message: string, queryRunner?: QueryRunner) {
    logger.info({ message }, "TypeORM migration");
  }

  // Log general database messages
  log(level: "log" | "info" | "warn", message: unknown, queryRunner?: QueryRunner) {
    switch (level) {
      case "log":
        logger.debug({ message }, "TypeORM log");
        break;
      case "info":
        logger.info({ message }, "TypeORM info");
        break;
      case "warn":
        logger.warn({ message }, "TypeORM warn");
        break;
    }
  }
}
