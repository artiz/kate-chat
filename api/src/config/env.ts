export const DB_TYPE =
  process.env.DB_TYPE === "sqlite" || process.env.DB_TYPE === "better-sqlite3" || !process.env.DB_TYPE
    ? "sqlite"
    : process.env.DB_TYPE;
