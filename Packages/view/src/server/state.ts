let depth = 0;

/** Evaluate synchronous server rendering without scheduling browser lifecycle work. */
export function withServerRender<T>(fn: () => T): T {
  depth++;
  try {
    return fn();
  } finally {
    depth--;
  }
}

/** Report the active synchronous render mode to shared lifecycle primitives. */
export function isServerRendering(): boolean {
  return depth > 0;
}

let collector: ((source: string) => string) | undefined;
let islandDepth = 0;

/** Collect explicit island modules directly during synchronous static rendering. */
export function collectIslands<T>(collect: (source: string) => string, render: () => T): T {
  const previous = collector;
  collector = collect;
  try {
    return render();
  } finally {
    collector = previous;
  }
}

/** Assign a build-local module id without reparsing rendered HTML. */
export function islandSource(source: string): string {
  return collector ? collector(source) : source;
}

/** Reject unsupported nested standalone boundaries rather than silently losing activation. */
export function renderIsland<T>(render: () => T): T {
  if (islandDepth) {
    throw new TypeError(
      "Standalone Island boundaries must not be nested; use separate boundaries or Astro slots",
    );
  }
  islandDepth++;
  try {
    return render();
  } finally {
    islandDepth--;
  }
}
