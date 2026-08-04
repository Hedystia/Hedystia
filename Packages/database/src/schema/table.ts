import type { ColumnMetadata, DeferredRefMeta, TableCacheConfig, TableDefinition } from "../types";
import type { ColumnBuilder } from "./column";

type BindColumn<C, TableName extends string, ColName extends string> =
  C extends ColumnBuilder<infer T, any, any, infer Ref, infer AutoIncrement extends boolean>
    ? ColumnBuilder<
        T,
        TableName,
        ColName,
        Ref extends DeferredRefMeta<any, infer ToTable, infer ToColumn, infer RelName>
          ? DeferredRefMeta<ColName, ToTable, ToColumn, RelName>
          : never,
        AutoIncrement
      >
    : never;

type BoundColumns<
  C extends Record<string, ColumnBuilder<any, any, any, any, boolean>>,
  N extends string,
> = {
  [K in keyof C]: BindColumn<C[K], N, Extract<K, string>>;
};

type ExtractDeferredRefs<C extends Record<string, ColumnBuilder<any, any, any, any, boolean>>> = {
  [K in keyof C]: C[K] extends ColumnBuilder<any, any, any, any, boolean> ? C[K]["__ref"] : never;
}[keyof C];

/**
 * Define a database table with its columns
 * @template N - Literal table name type
 * @template C - Column builder map
 * @param {string} name - The table name
 * @param {Record<string, ColumnBuilder<any>>} columns - Column definitions
 * @param {{ cache?: TableCacheConfig }} [options] - Optional table-level cache configuration
 * @returns {TableDefinition<{ [K in keyof C]: C[K]["__type"] }, BoundColumns<C, N>, N, ExtractDeferredRefs<BoundColumns<C, N>>>} The table definition object with column accessors
 */
export function table<
  N extends string,
  C extends Record<string, ColumnBuilder<any, any, any, any, boolean>>,
>(
  name: N,
  columns: C,
  options?: { cache?: TableCacheConfig },
): TableDefinition<
  { [K in keyof C]: C[K]["__type"] },
  BoundColumns<C, N>,
  N,
  ExtractDeferredRefs<BoundColumns<C, N>>
> {
  const columnsArray: ColumnMetadata[] = [];
  const deferredRefs: TableDefinition["__deferredRefs"] = [];
  const columnMap: Record<string, string> = {};

  for (const [key, builder] of Object.entries(columns)) {
    const meta = builder.__build(key);
    columnsArray.push(meta);
    columnMap[key] = meta.name;

    const ref = builder.__getDeferredRef();
    if (ref) {
      deferredRefs.push({
        columnName: key,
        resolve: ref.resolve,
        onDelete: ref.onDelete,
        onUpdate: ref.onUpdate,
        relationName: ref.relationName,
      });
    }

    (builder as any).__tableName = name;
    (builder as any).__columnName = key;
  }

  const def = {
    __table: true,
    __name: name,
    __columns: columnsArray,
    __columnMap: columnMap,
    __cache: options?.cache,
    __deferredRefs: deferredRefs,
    ...columns,
  };

  return def as any;
}
