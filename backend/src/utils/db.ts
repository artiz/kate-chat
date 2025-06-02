export function JSONTransformer<T>() {
  return {
    to: (value: T) => JSON.stringify(value),
    from: (value: string) => JSON.parse(value) as T,
  };
}
