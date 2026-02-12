import pgvector from "pgvector";
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
