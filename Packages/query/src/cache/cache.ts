import { batch, peek, type Signal, set, sig } from "@hedystia/view";
import { encodeKey, type QueryKey } from "./key";

type Pending = { controller: AbortController; consumers: Set<symbol>; promise: Promise<unknown> };
export type Entry = {
  parts: string[];
  revision: Signal<number>;
  observers: number;
  valid: boolean;
  data: unknown;
  updatedAt: number;
  pending?: Pending;
};

export class QueryCache {
  private entries = new Map<string, Entry>();

  /** Resolve a canonical key and refresh its recency. */
  entry(key: QueryKey): Entry {
    const parts = encodeKey(key);
    const id = JSON.stringify(parts);
    const entry = this.entries.get(id) ?? {
      parts,
      revision: sig(0),
      observers: 0,
      valid: false,
      data: undefined,
      updatedAt: 0,
    };
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry;
  }

  /** Bound retained entries while preserving mounted observers and active requests. */
  trim(): void {
    for (const [id, entry] of this.entries) {
      if (this.entries.size <= 128) {
        break;
      }
      if (entry.observers === 0 && !entry.pending) {
        this.entries.delete(id);
      }
    }
  }

  /** Invalidate structurally matching key prefixes and notify mounted resources. */
  invalidate(prefix: QueryKey = []): void {
    const parts = encodeKey(prefix);
    batch(() => {
      for (const entry of this.entries.values()) {
        if (!parts.every((part, index) => entry.parts[index] === part)) {
          continue;
        }
        entry.valid = false;
        entry.pending?.controller.abort();
        entry.pending = undefined;
        set(entry.revision, peek(entry.revision) + 1);
      }
    });
  }

  /** Share work while allowing each consumer to cancel independently. */
  async fetch<T>(
    entry: Entry,
    fetcher: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    staleTime = Number.POSITIVE_INFINITY,
  ): Promise<T> {
    signal?.throwIfAborted();
    if (
      !entry.pending &&
      entry.valid &&
      (staleTime === Number.POSITIVE_INFINITY || Date.now() - entry.updatedAt < staleTime)
    ) {
      return entry.data as T;
    }
    if (!entry.pending) {
      const controller = new AbortController();
      const pending: Pending = {
        controller,
        consumers: new Set(),
        promise: Promise.resolve()
          .then(() => {
            controller.signal.throwIfAborted();
            return fetcher(controller.signal);
          })
          .then((data) => {
            if (!controller.signal.aborted && entry.pending === pending) {
              entry.data = data;
              entry.valid = true;
              entry.updatedAt = Date.now();
            }
            return data;
          })
          .finally(() => {
            if (entry.pending === pending) {
              entry.pending = undefined;
            }
            this.trim();
          }),
      };
      entry.pending = pending;
    }
    const pending = entry.pending;
    const token = Symbol();
    pending.consumers.add(token);
    return new Promise<T>((resolve, reject) => {
      const release = () => {
        signal?.removeEventListener("abort", abort);
        pending.consumers.delete(token);
      };
      const abort = () => {
        release();
        if (pending.consumers.size === 0) {
          pending.controller.abort();
          if (entry.pending === pending) {
            entry.pending = undefined;
          }
          this.trim();
        }
        reject(signal?.reason);
      };
      signal?.addEventListener("abort", abort, { once: true });
      pending.promise.then(
        (data) => {
          release();
          resolve(data as T);
        },
        (error) => {
          release();
          reject(error);
        },
      );
    });
  }
}
