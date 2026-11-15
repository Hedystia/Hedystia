interface CacheEntry {
  value: unknown;
  expiresAt: number;
  hitCount: number;
  lastAccess: number;
}

/**
 * In-memory cache store with TTL and hit-count tracking
 */
export class MemoryStore {
  private store = new Map<string, CacheEntry>();
  private maxEntries: number;

  constructor(maxEntries = 10_000) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError("maxEntries must be a positive integer");
    }
    this.maxEntries = maxEntries;
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {unknown | undefined} Cached value or undefined
   */
  get(key: string): unknown | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    entry.hitCount++;
    entry.lastAccess = Date.now();
    return entry.value;
  }

  /**
   * Set a value in cache with TTL
   * @param {string} key - Cache key
   * @param {unknown} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  set(key: string, value: unknown, ttl: number): void {
    if (!Number.isFinite(ttl) || ttl <= 0) {
      this.store.delete(key);
      return;
    }
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      this.evict();
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      hitCount: 1,
      lastAccess: Date.now(),
    });
  }

  /**
   * Check if a key exists in cache and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} Whether the key exists
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Invalidate all cache entries matching a prefix
   * @param {string} prefix - Key prefix
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get the number of cached entries
   * @returns {number} Number of entries
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Get hit count for a cache key
   * @param {string} key - Cache key
   * @returns {number} Number of hits
   */
  getHitCount(key: string): number {
    return this.store.get(key)?.hitCount ?? 0;
  }

  /**
   * Extend the TTL of a cache entry based on hit count
   * @param {string} key - Cache key
   * @param {number} baseTtl - Base TTL in milliseconds
   * @param {number} maxTtl - Maximum TTL in milliseconds
   */
  extendTtl(key: string, baseTtl: number, maxTtl: number): void {
    const entry = this.store.get(key);
    if (!entry) {
      return;
    }
    const adaptiveTtl = Math.min(maxTtl, baseTtl * (1 + Math.log2(entry.hitCount + 1)));
    entry.expiresAt = Date.now() + adaptiveTtl;
  }

  private evict(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.store) {
      if (Date.now() >= entry.expiresAt) {
        this.store.delete(key);
        return;
      }
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) {
      this.store.delete(oldestKey);
    }
  }
}
