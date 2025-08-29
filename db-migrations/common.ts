export const DB_TYPE =
  process.env.DB_TYPE === "sqlite" || !process.env.DB_TYPE
    ? "better-sqlite3"
    : process.env.DB_TYPE;
export const TIMESTAMP =
  DB_TYPE === "better-sqlite3"
    ? "datetime NOT NULL DEFAULT (datetime('now'))"
    : "timestamp NOT NULL DEFAULT now()";
export const ID =
  DB_TYPE === "postgres"
    ? `"id" uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4()`
    : `"id" varchar PRIMARY KEY NOT NULL`;

export const ID_REF = DB_TYPE === "postgres" ? `uuid` : `varchar`;

export const BOOLEAN_TRUE = "true";
export const BOOLEAN_FALSE = "false";
