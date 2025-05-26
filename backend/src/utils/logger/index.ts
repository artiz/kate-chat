import { ContentBlockStart } from "@aws-sdk/client-bedrock-runtime";
import path from "path";
import pino from "pino";

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");

const redactPaths = ["password", "headers.Authorization", "*.headers.Authorization", "*.headers.authorization"]
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

const loggerConfig = {
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
