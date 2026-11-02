/**
 * Internal utilities for @hedystia/view
 */

/**
 * Equality comparison function for signals
 */
export function equalFn<T>(a: T, b: T): boolean {
  return a === b;
}

/**
 * Creates a shallow clone of an object
 */
export function shallowClone<T extends object>(obj: T): T {
  const target = {} as any;
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      target[key] = obj[key];
    }
  }
  return target;
}

/**
 * Merges two style objects, with the second taking precedence
 */
export function mergeStyles(
  base: Record<string, any>,
  override: Record<string, any>,
): Record<string, any> {
  const result = shallowClone(base);
  for (const key in override) {
    if (Object.hasOwn(override, key)) {
      const value = override[key];
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }
  return result;
}
