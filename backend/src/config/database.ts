import { AbstractLogger, DataSource, LogLevel, LogMessage, QueryRunner } from "typeorm";
import { Chat } from "../entities/Chat";
import { Message } from "../entities/Message";
import { Model } from "../entities/Model";
import { ModelProvider } from "../entities/ModelProvider";
import { User } from "../entities/User";

const logging = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";

export class CustomLogger extends AbstractLogger {
    /**
     * Write log to specific output.
     */
    protected writeLog(
        level: LogLevel,
        logMessage: LogMessage | LogMessage[],
        queryRunner?: QueryRunner,
    ) {
        const messages = this.prepareLogMessages(logMessage, {
            highlightSql: false,
        })

        for (let message of messages) {
            switch (message.type ?? level) {
                case "log":
                case "schema-build":
                case "migration":
                    console.log(message.message)
                    break

                case "info":
                case "query":
                    if (message.prefix) {
                        console.info(message.prefix, message.message)
                    } else {
                        console.info(message.message)
                    }
                    break

                case "warn":
                case "query-slow":
                    if (message.prefix) {
                        console.warn(message.prefix, message.message)
                    } else {
                        console.warn(message.message)
                    }
                    break

                case "error":
                case "query-error":
                    if (message.prefix) {
                        console.error(message.prefix, message.message)
                    } else {
                        console.error(message.message)
                    }
                    break
            }
        }
    }
}


// Create TypeORM data source
export const AppDataSource = new DataSource({
  type: "mongodb",
  url: process.env.MONGODB_URI || "mongodb://localhost:27017/katechat",
  logger: new CustomLogger(),
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
