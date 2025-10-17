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
