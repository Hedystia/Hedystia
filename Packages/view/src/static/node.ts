const brand = Symbol.for("hedystia.static-node");
export type StaticNode = {
  readonly [brand]: true;
  type: unknown;
  props: Record<string, any>;
  __isSSR: true;
  __isIsland?: boolean;
};

/** Create a server node that cannot be forged by ordinary JSON input. */
export function createStaticNode(type: unknown, props: Record<string, any>): StaticNode {
  return { [brand]: true, type, props, __isSSR: true };
}

/** Recognize only nodes produced by a View JSX runtime. */
export function isStaticNode(value: unknown): value is StaticNode {
  return typeof value === "object" && value !== null && (value as StaticNode)[brand] === true;
}
