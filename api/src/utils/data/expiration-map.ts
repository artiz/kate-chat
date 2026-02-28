interface MapValue<V> {
  value: V;
  ts: NodeJS.Timeout;
}

export class ExpirationMap<K, V> {
  private store: Map<K, MapValue<V>> = new Map();
  private expirationMs: number;

  constructor(expitionMs: number = 5000) {
    this.expirationMs = expitionMs;
  }

  set(key: K, value: V): V {
    const item = this.store.get(key);
    if (item) {
      clearTimeout(item.ts);
    }
    const ts = setTimeout(() => this.store.delete(key), this.expirationMs);
    this.store.set(key, { value, ts });
    return value;
  }

  delete(key: K) {
    const item = this.store.get(key);
    if (item) {
      clearTimeout(item.ts);
      this.store.delete(key);
    }
  }

  get(key: K): V | undefined {
    const item = this.store.get(key);
    return item ? item.value : undefined;
  }
}
