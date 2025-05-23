import path from "path";
import pino from "pino";

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");

const loggerConfig = {
  level,
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
};

export const createLogger = (fileName: string) => {
  const name = path.basename(fileName);
  return pino({
    ...loggerConfig,
    name,
  });
};

export const logger = pino(loggerConfig);
