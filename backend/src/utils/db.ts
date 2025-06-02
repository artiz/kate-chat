export function JSONTransformer<T>() {
  return {
    to: (value: T) => JSON.stringify(value),
    from: (value: string) => (typeof value === "string" ? (JSON.parse(value) as T) : undefined),
  };
}
