export type KeyValue =
  | null
  | boolean
  | number
  | string
  | readonly KeyValue[]
  | { readonly [key: string]: KeyValue };
export type QueryKey = readonly KeyValue[];

/** Encode JSON query keys deterministically and reject ambiguous or cyclic values. */
export function encodeKey(key: QueryKey): string[] {
  const ancestors = new Set<object>();
  const encode = (value: KeyValue): string => {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return JSON.stringify(value);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return JSON.stringify(value);
    }
    if (typeof value !== "object" || value === null || ancestors.has(value)) {
      throw new TypeError("Query keys must contain finite, acyclic JSON values");
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        const parts: string[] = [];
        for (let index = 0; index < value.length; index++) {
          if (!Object.hasOwn(value, index)) {
            throw new TypeError("Query keys cannot contain sparse arrays");
          }
          parts.push(encode(value[index]!));
        }
        return `[${parts.join(",")}]`;
      }
      if (
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      ) {
        throw new TypeError("Query key objects must be plain JSON objects");
      }
      const object = value as { readonly [key: string]: KeyValue };
      if (Object.getOwnPropertySymbols(object).length) {
        throw new TypeError("Query keys cannot contain symbol properties");
      }
      return `{${Object.keys(object)
        .sort()
        .map((name) => `${JSON.stringify(name)}:${encode(object[name]!)}`)
        .join(",")}}`;
    } finally {
      ancestors.delete(value);
    }
  };
  if (!Array.isArray(key)) {
    throw new TypeError("A query key must be an array");
  }
  const parts: string[] = [];
  for (let index = 0; index < key.length; index++) {
    if (!Object.hasOwn(key, index)) {
      throw new TypeError("Query keys cannot contain sparse arrays");
    }
    parts.push(encode(key[index]!));
  }
  return parts;
}

/** Return the same canonical identity used by query caches across dependent Hedystia packages. */
export function hashQueryKey(key: QueryKey): string {
  return JSON.stringify(encodeKey(key));
}
