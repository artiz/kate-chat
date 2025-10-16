// Pure assertion tests whether a value is truthy, as determined by !!value.
export function ok<T>(value: T, message?: string | Error): asserts value {
  if (!value) {
    if (message instanceof Error) {
      throw message;
    }

    throw new Error(message || "No value argument passed to `assert.ok()`");
  }
}

export function notEmpty<T>(value: T | undefined | null): value is T {
  return value != undefined;
}
