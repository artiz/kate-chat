import path from "path";
import pino, { LoggerOptions } from "pino";

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");

const redactPaths = [
  "connectionParams",
  "password",
  "headers.Authorization",
  "*.headers.Authorization",
  "*.headers.authorization",
]
  .map(path => {
    if (path.startsWith("*.")) {
      return ["req", "request", "res", "response", "config", "ctx", "context"].map(prefix => [
        `${prefix}.${path.slice(2)}`,
        `*.${prefix}.${path.slice(2)}`,
      ]); // Convert to `req.password`, `request.password`, etc.;
    }

    return [path];
  })
  .flat(2);

const loggerConfig: LoggerOptions = {
  level,
  redact: {
    paths: redactPaths,
    censor: "*****",
  },
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "UTC:yyyy-mm-dd HH:MM:ss.l",
            ignore: "hostname",
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
