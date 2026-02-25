export const DB_TYPE =
  process.env.DB_TYPE === "sqlite" || process.env.DB_TYPE === "better-sqlite3" || !process.env.DB_TYPE
    ? "sqlite"
    : process.env.DB_TYPE;

export const DB_SKIP_MIGRATIONS = ["true", "1", "yes"].includes(process.env.DB_SKIP_MIGRATIONS || "") || false;
