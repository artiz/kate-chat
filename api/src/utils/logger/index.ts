import path from "path";
import pino, { LoggerOptions } from "pino";

const isProd = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";
const level = process.env.LOG_LEVEL || (isProd ? "info" : "debug");

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
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "UTC:yyyy-mm-dd HH:MM:ss.l",
          ignore: "hostname",
        },
      },
};

export const createLogger = (fileName: string) => {
  const name = path.basename(fileName, ".ts");
  return pino({
    ...loggerConfig,
    formatters: {
      level: label => ({ level: label }),
      bindings: bindings => ({
        ...bindings,
        pid: process.pid,
      }),
    },
    name,
  });
};

export const logger = pino(loggerConfig);
