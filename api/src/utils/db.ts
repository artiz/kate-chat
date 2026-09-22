import pgvector from "pgvector";
import { ColumnOptions, ColumnType } from "typeorm";
import { DB_TYPE } from "../config/env";

export function JSONTransformer<T>() {
  return {
    to: (value: T) => JSON.stringify(value),
    from: (value: string) => (typeof value === "string" ? (JSON.parse(value) as T) : undefined),
  };
}

export function EnumTransformer<T>() {
  return {
    to: (value: T) => (value ? String(value).toUpperCase() : null),
    from: (value: string) => (typeof value === "string" ? (value.toUpperCase() as T) : undefined),
  };
}

export const formatDateFloor =
  DB_TYPE === "sqlite"
    ? (date: Date) => {
        const d = new Date(date);
        d.setMilliseconds(d.getMilliseconds() - 1); // SQLite requires a small adjustment to avoid precision issues
        return d;
      }
    : (date: Date) => date;

export const formatDateCeil =
  DB_TYPE === "sqlite"
    ? (date: Date) => {
        const d = new Date(date);
        d.setMilliseconds(d.getMilliseconds() + 1); // SQLite requires a small adjustment to avoid precision issues
        return d;
      }
    : (date: Date) => date;

export function EmbeddingTransformer(dimensions: number) {
  if (DB_TYPE === "postgres") {
    return {
      to: (value: number[]) =>
        pgvector.toSql(value.length === dimensions ? value : value.concat(Array(dimensions - value.length).fill(0))),
      from: (value: string | null | undefined) =>
        typeof value === "string" ? (pgvector.fromSql(value) as number[]) : value,
    };
  }

  if (DB_TYPE === "mssql") {
    return {
      to: (value: number[]) => JSON.stringify(value),
      from: (value: string | null | undefined) => (typeof value === "string" ? JSON.parse(value) : value),
    };
  }

  return {
    to: (value: number[]) => value?.join(","),
    from: (value: string | null | undefined) =>
      typeof value === "string" ? (value.split(",").map(Number) as number[]) : undefined,
  };
}

/**
 * Column type for the created/updated timestamps, per flavour.
 *
 * The naive types these columns had (`TIMESTAMP`, `datetime2`) store wall-clock time with no zone,
 * so their value depends on the zone of whoever wrote it: the database for a `now()` default, the
 * API process for a driver write. The two disagreeing shifts every stored date. The types below
 * carry the offset instead, so the instant survives the round trip whatever zone either side is in.
 *
 * SQLite and MySQL are left on their own defaults: SQLite already stores UTC from both sides
 * (`datetime('now')` and the driver's own UTC serialization), and MySQL is handled by pinning the
 * connection's session zone to UTC (see config/database.ts). Neither has a type that would help.
 */
export const TIMESTAMP_COLUMN_TYPE: ColumnType | undefined =
  DB_TYPE === "postgres" ? "timestamptz" : DB_TYPE === "mssql" ? "datetimeoffset" : undefined;

/** Passed to @CreateDateColumn/@UpdateDateColumn: an absent type leaves the driver default. */
export const TIMESTAMP_COLUMN_OPTIONS: ColumnOptions = TIMESTAMP_COLUMN_TYPE ? { type: TIMESTAMP_COLUMN_TYPE } : {};
