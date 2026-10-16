/**
 * Boyutu sınırlı, en eski kullanılanı atan (LRU) bellek içi önbellek
 * (02.10.2026). `Map` ekleme sırasını korur: okunan anahtar sona taşınır,
 * dolunca baştaki (en eski) atılır. `maxEntries <= 0` önbelleği kapatır.
 */
export class BoundedCache<V> {
  private readonly entries = new Map<string, V>();

  constructor(private readonly maxEntries: number) {}

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    if (this.maxEntries <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
