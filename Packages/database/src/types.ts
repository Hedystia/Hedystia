/** Supported column data types for schema definitions */
export type ColumnDataType =
  | "integer"
  | "varchar"
  | "text"
  | "boolean"
  | "json"
  | "array"
  | "datetime"
  | "decimal"
  | "float"
  | "char"
  | "timestamp"
  | "bigint"
  | "blob";

/**
 * Database type identifier — can be a simple string shorthand or an object
 * specifying both the database name and the driver provider to use
 */
export type DatabaseType =
  | "mysql"
  | "mariadb"
  | "postgres"
  | "sqlite"
  | "file"
  | "s3"
  | { name: "mysql"; provider: "mysql" | "mysql2" }
  | { name: "mariadb"; provider: "mysql" | "mysql2" }
  | { name: "postgres"; provider: "pg" }
  | { name: "sqlite"; provider: "better-sqlite3" | "sqlite3" | "sql.js" | "bun:sqlite" }
  | { name: "file"; provider: string }
  | { name: "s3"; provider: string };

/** Metadata describing a single database column */
export interface ColumnMetadata {
  /** Column name in the database */
  name: string;
  /** Data type of the column */
  type: ColumnDataType;
  /** Whether this column is a primary key */
  primaryKey: boolean;
  /** Whether this column auto-increments */
  autoIncrement: boolean;
  /** Whether this column disallows NULL values */
  notNull: boolean;
  /** Whether this column has a UNIQUE constraint */
  unique: boolean;
  /** Default value for the column, or `undefined` if none */
  defaultValue: unknown;
  /** Maximum character length (for varchar/char types) */
  length?: number;
  /** Total number of digits (for decimal types) */
  precision?: number;
  /** Number of decimal digits (for decimal types) */
  scale?: number;
  /** Custom database column name alias, if different from the property key */
  columnAlias?: string;
  /** Foreign key reference metadata, resolved after registration */
  references?: {
    table: string;
    column: string;
    onDelete?: ReferenceAction;
    onUpdate?: ReferenceAction;
    relationName?: string;
  };
}

/** Action to take when a referenced row is deleted or updated */
export type ReferenceAction = "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";

/** Metadata describing a database table and its columns */
export interface TableMetadata {
  /** Table name in the database */
  name: string;
  /** Array of column metadata for this table */
  columns: ColumnMetadata[];
}

/** Deferred foreign key reference metadata, used internally for lazy resolution */
export type DeferredRefMeta<
  ColumnName extends string = string,
  TargetTable extends string = string,
  TargetColumn extends string = string,
  RelationName extends string | undefined = string | undefined,
> = {
  columnName: ColumnName;
  targetTable: TargetTable;
  targetColumn: TargetColumn;
  relationName?: RelationName;
  onDelete?: ReferenceAction;
  onUpdate?: ReferenceAction;
};

/**
 * Internal representation of a table schema, including column metadata,
 * deferred references, and optional per-table cache configuration
 */
export type TableDefinition<
  T extends Record<string, any> = Record<string, any>,
  C extends Record<string, any> = {},
  N extends string = string,
  Refs extends DeferredRefMeta = any,
> = {
  __table: true;
  __name: N;
  __row: T;
  __refs: Refs;
  __columns: ColumnMetadata[];
  __columnMap: Record<string, string>;
  __cache?: TableCacheConfig;
  __deferredRefs: Array<{
    columnName: string;
    resolve: () => { table: string; column: string };
    onDelete?: ReferenceAction;
    onUpdate?: ReferenceAction;
    relationName?: string;
  }>;
} & C;

/** Extract the row type from a table definition */
export type InferRow<T> = T extends { __row: infer R } ? R : never;

/** Extract the insertable type from a table definition (auto-increment keys become optional) */
export type InferInsert<T> =
  T extends TableDefinition<infer R, any, any>
    ? {
        [K in keyof R as K extends AutoIncrementKeys<T> ? never : K]: R[K];
      } & {
        [K in AutoIncrementKeys<T>]?: R[K];
      }
    : never;

type AutoIncrementKeys<T> = T extends TableDefinition<infer R, any, any> ? keyof R : never;

/** Extract the updatable type from a table definition (all fields become optional) */
export type InferUpdate<T> = T extends TableDefinition<infer R, any, any> ? Partial<R> : never;

/**
 * Condition operators for a single column in a WHERE clause.
 *
 * @example
 * ```ts
 * // Exact match
 * { age: { eq: 25 } }
 * // Range query
 * { age: { gte: 18, lte: 65 } }
 * // Pattern matching
 * { name: { like: "%alice%" } }
 * // Set membership
 * { status: { in: ["active", "pending"] } }
 * ```
 */
export interface WhereCondition {
  /** Equal to — matches rows where the column value equals the given value */
  eq?: unknown;
  /** Not equal to — matches rows where the column value differs from the given value */
  neq?: unknown;
  /** Greater than — matches rows where the column value is strictly greater */
  gt?: unknown;
  /** Greater than or equal to — matches rows where the column value is greater or equal */
  gte?: unknown;
  /** Less than — matches rows where the column value is strictly less */
  lt?: unknown;
  /** Less than or equal to — matches rows where the column value is less or equal */
  lte?: unknown;
  /** SQL LIKE — matches rows where the column value matches the pattern (use `%` as wildcard) */
  like?: string;
  /** SQL NOT LIKE — matches rows where the column value does not match the pattern */
  notLike?: string;
  /** IN — matches rows where the column value is one of the given values */
  in?: unknown[];
  /** NOT IN — matches rows where the column value is not one of the given values */
  notIn?: unknown[];
  /** IS NULL / IS NOT NULL — when `true`, matches rows where the column is NULL; when `false`, matches non-NULL */
  isNull?: boolean;
  /** BETWEEN — matches rows where the column value falls within the inclusive range `[min, max]` */
  between?: [unknown, unknown];
}

/** Flatten an intersection into a single object type for better autocomplete */
type Flat<T> = { [K in keyof T]: T[K] } & {};

/** Column-level filter conditions for a WHERE clause */
type WhereFields<T> = Flat<{
  [K in keyof T]?: T[K] | WhereCondition;
}>;

/**
 * Type-safe WHERE clause supporting equality, operators, and logical combinators (OR/AND).
 *
 * @example
 * ```ts
 * // Simple equality
 * { where: { name: "Alice" } }
 *
 * // Using operators
 * { where: { age: { gte: 18 } } }
 *
 * // OR — matches rows satisfying at least one condition
 * { where: { OR: [{ name: "Alice" }, { name: "Bob" }] } }
 *
 * // AND — matches rows satisfying all conditions
 * { where: { AND: [{ age: { gte: 18 } }, { active: true }] } }
 *
 * // Combined AND + OR
 * { where: { AND: [{ age: { gte: 18 } }], OR: [{ name: "Alice" }, { name: "Bob" }] } }
 * ```
 */
export type WhereClause<T = Record<string, any>> = Flat<
  {
    [K in keyof T]?: T[K] | WhereCondition;
  } & {
    /** Logical OR — matches rows satisfying **at least one** of the given conditions */
    OR?: WhereFields<T>[];
    /** Logical AND — matches rows satisfying **all** of the given conditions */
    AND?: WhereFields<T>[];
  }
>;

/** Options for querying rows — filtering, sorting, pagination, and relation loading */
export interface QueryOptions<T = Record<string, any>, Rel extends Record<string, any> = {}> {
  /** Filter conditions */
  where?: WhereClause<T>;
  /** Columns to include in the result */
  select?: Extract<keyof T, string>[];
  /** Sort order for results */
  orderBy?: Partial<Record<Extract<keyof T, string>, "asc" | "desc">>;
  /** Maximum number of rows to return */
  take?: number;
  /** Number of rows to skip (for pagination) */
  skip?: number;
  /** Related tables to eagerly load */
  with?: {
    [K in keyof Rel]?: boolean | QueryOptions<Rel[K] extends { row: infer R } ? R : Rel[K]>;
  };
}

/** Options for an UPDATE operation */
export interface UpdateOptions<T = Record<string, any>> {
  /** Filter to select which rows to update */
  where: WhereClause<T>;
  /** Partial data to apply to matching rows */
  data: Partial<T>;
}

/** Options for a DELETE operation */
export interface DeleteOptions<T = Record<string, any>> {
  /** Filter to select which rows to delete */
  where: WhereClause<T>;
}

export interface MySQLConnectionConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
}

export interface PostgreSQLConnectionConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
}

/** Connection configuration for SQLite databases */
export interface SQLiteConnectionConfig {
  /** Path to the SQLite database file */
  filename: string;
}

/** Connection configuration for file-based (JSON) storage */
export interface FileConnectionConfig {
  /** Directory where data files are stored */
  directory: string;
}

/** Connection configuration for S3-based storage */
export interface S3ConnectionConfig {
  /** S3 bucket name */
  bucket: string;
  /** S3 endpoint URL */
  endpoint?: string;
  /** AWS region */
  region?: string;
  /** S3 access key ID */
  accessKeyId?: string;
  /** S3 secret access key */
  secretAccessKey?: string;
  /** Key prefix for stored objects */
  prefix?: string;
}

/** Union of all supported connection configurations */
export type ConnectionConfig =
  | MySQLConnectionConfig
  | PostgreSQLConnectionConfig
  | SQLiteConnectionConfig
  | FileConnectionConfig
  | S3ConnectionConfig;

/**
 * Global cache configuration for the database instance.
 * Controls query result caching and entity caching behavior.
 */
export interface CacheConfig {
  /** Whether caching is enabled */
  enabled: boolean;
  /** Base time-to-live in milliseconds (default: 60000) */
  ttl?: number;
  /** Maximum TTL in milliseconds — limits adaptive TTL scaling (default: 300000) */
  maxTtl?: number;
  /** Maximum number of cache entries before eviction (default: 10000) */
  maxEntries?: number;
}

/**
 * Per-table cache configuration. Set on individual table definitions to override
 * or enable caching for specific tables independently of the global setting.
 * Useful for frequently accessed tables like user sessions or login data.
 */
export interface TableCacheConfig {
  /** Whether caching is enabled for this table */
  enabled: boolean;
  /** Base time-to-live in milliseconds for this table's cache entries */
  ttl?: number;
  /** Maximum TTL in milliseconds for this table's cache entries */
  maxTtl?: number;
}

/**
 * Top-level configuration for creating a database instance.
 * Defines schemas, database type, connection, and optional features like
 * schema sync, migrations, and caching.
 */
export interface DatabaseConfig {
  /**
   * Table definitions — either an array of tables or a module namespace object.
   * @example
   * // Array form
   * schemas: [users, posts]
   * // Module namespace form (import * as schemas from "./schemas")
   * schemas: schemas
   */
  schemas: readonly AnyTableDef[] | Record<string, unknown>;
  /**
   * Migration definitions — either an array of migrations or a module namespace object.
   * @example
   * // Array form
   * migrations: [createUsers, addAge]
   * // Module namespace form (import * as migrations from "./migrations")
   * migrations: migrations
   */
  migrations?: MigrationDefinition[] | Record<string, unknown>;
  /** Database type and optional driver provider */
  database: DatabaseType;
  /** Connection configuration (or array for future multi-connection support) */
  connection: ConnectionConfig | ConnectionConfig[];
  /** Whether to run pending migrations on initialization */
  runMigrations?: boolean;
  /** Whether to auto-create tables and add missing columns on initialization */
  syncSchemas?: boolean;
  /** Enable caching — `true` for defaults, or a {@link CacheConfig} object for fine-tuning */
  cache?: boolean | CacheConfig;
}

/** Context object passed to migration up/down functions */
export interface MigrationContext {
  schema: {
    createTable: (table: TableDefinition) => Promise<void>;
    dropTable: (name: string) => Promise<void>;
    addColumn: (table: string, name: string, column: ColumnMetadata) => Promise<void>;
    dropColumn: (table: string, name: string) => Promise<void>;
    renameColumn: (table: string, oldName: string, newName: string) => Promise<void>;
    addIndex: (table: string, columns: string[], unique?: boolean) => Promise<void>;
    dropIndex: (table: string, indexName: string) => Promise<void>;
  };
  sql: (query: string, params?: unknown[]) => Promise<unknown>;
}

/** A named migration with up (apply) and down (rollback) functions */
export interface MigrationDefinition {
  /** Unique migration name (used for tracking executed migrations) */
  name: string;
  /** Function to apply the migration */
  up: (ctx: MigrationContext) => Promise<void>;
  /** Function to rollback the migration */
  down: (ctx: MigrationContext) => Promise<void>;
}

/** Low-level database driver interface — implemented per database backend */
export interface DatabaseDriver {
  /** Database dialect identifier */
  readonly dialect: DatabaseType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  execute(sql: string, params?: unknown[]): Promise<any>;
  query(sql: string, params?: unknown[]): Promise<any[]>;
  tableExists(name: string): Promise<boolean>;
  getTableColumns(name: string): Promise<ColumnMetadata[]>;
  createTable(meta: TableMetadata): Promise<void>;
  dropTable(name: string): Promise<void>;
  addColumn(table: string, column: ColumnMetadata): Promise<void>;
  dropColumn(table: string, name: string): Promise<void>;
  renameColumn(table: string, oldName: string, newName: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  getAllTableColumns?(): Promise<Record<string, ColumnMetadata[]>>;
}

/** Generic repository interface providing CRUD operations for a table */
export interface Repository<T extends Record<string, any>> {
  /** Find all rows matching the given options */
  find(options?: QueryOptions<T>): Promise<T[]>;
  /** Find all rows matching the given options (alias for {@link find}) */
  findMany(options?: QueryOptions<T>): Promise<T[]>;
  /** Find the first row matching the given options, or `null` if none found */
  findFirst(options?: QueryOptions<T>): Promise<T | null>;
  /** Insert one or more rows into the table */
  insert(data: Partial<T> | Partial<T>[]): Promise<T>;
  /** Insert multiple rows into the table */
  insertMany(data: Partial<T>[]): Promise<T[]>;
  /** Update rows matching the where clause */
  update(options: UpdateOptions<T>): Promise<T[]>;
  /** Delete rows matching the where clause */
  delete(options: DeleteOptions<T>): Promise<number>;
  /** Count rows matching the where clause */
  count(options?: Pick<QueryOptions<T>, "where">): Promise<number>;
  /** Check whether at least one row matches the where clause */
  exists(options: Pick<QueryOptions<T>, "where">): Promise<boolean>;
  /** Insert a row if it doesn't exist, or update it if it does */
  upsert(options: { where: WhereClause<T>; create: Partial<T>; update: Partial<T> }): Promise<T>;
  /** Remove all rows from the table */
  truncate(): Promise<void>;
}

export type AnyTableDef = TableDefinition<any, any, any, any>;

type TableRefs<T> = T extends { __refs: infer R } ? R : never;

type TableName<T> = T extends { __name: infer N extends string } ? N : never;

type SchemaByName<S extends readonly AnyTableDef[], N extends string> = Extract<
  S[number],
  { __name: N }
>;

type StripIdSuffix<S extends string> = S extends `${infer Base}Id`
  ? Base
  : S extends `${infer Base}_id`
    ? Base
    : S;

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type IsArray<T> = T extends readonly any[] ? true : false;
type SchemaKey<S, T extends AnyTableDef> =
  IsArray<S> extends true ? TableName<T> : { [K in keyof S]: S[K] extends T ? K : never }[keyof S];

type ForwardRelationEntries<S, T extends AnyTableDef> =
  TableRefs<T> extends infer R
    ? R extends DeferredRefMeta<infer Col, infer ToTable, any, infer Name>
      ? {
          [K in Name extends string ? Name : StripIdSuffix<Col>]: {
            table: SchemaByName<InferSchemas<S>, ToTable>;
            many: false;
          };
        }
      : never
    : never;

type ReverseRelationEntry<S, U extends AnyTableDef, TargetName extends string> =
  TableRefs<U> extends infer R
    ? R extends DeferredRefMeta<any, TargetName, any, any>
      ? { [K in SchemaKey<S, U> & string]: { table: U; many: true } }
      : never
    : never;

type ReverseRelationEntries<S, T extends AnyTableDef> = ReverseRelationEntry<
  S,
  InferSchemas<S>[number],
  TableName<T>
>;

export type RelationsFor<S, T extends AnyTableDef> = Simplify<
  UnionToIntersection<ForwardRelationEntries<S, T> | ReverseRelationEntries<S, T>>
>;

export type InferSchemas<T> = T extends readonly AnyTableDef[]
  ? T
  : T extends Record<string, any>
    ? Array<{ [K in keyof T]: T[K] extends AnyTableDef ? T[K] : never }[keyof T]>
    : readonly AnyTableDef[];

type DepthPrev = [never, 0, 1, 2, 3];

type ExtractRelationRow<Rel> = Rel extends { table: infer R } ? InferRow<R> : never;
type ExtractRelationMany<Rel> = Rel extends { many: true } ? true : false;

export type RelationQueryMap<S, T extends AnyTableDef, D extends number = 3> = [D] extends [never]
  ? {}
  : {
      [K in keyof RelationsFor<S, T>]: {
        row: ExtractRelationRow<RelationsFor<S, T>[K]>;
        many: ExtractRelationMany<RelationsFor<S, T>[K]>;
        relations: RelationsFor<S, T>[K] extends { table: infer R extends AnyTableDef }
          ? RelationQueryMap<S, R, DepthPrev[D]>
          : {};
      };
    };

type ResolveWith<S, T extends AnyTableDef, W> = [W] extends [undefined]
  ? {}
  : W extends Record<string, any>
    ? {
        [K in keyof W & keyof RelationsFor<S, T>]: ExtractRelationMany<
          RelationsFor<S, T>[K]
        > extends true
          ? ExtractRelationRow<RelationsFor<S, T>[K]>[]
          : ExtractRelationRow<RelationsFor<S, T>[K]> | null;
      }
    : {};

export type ResolveResult<S, T extends AnyTableDef, O> = InferRow<T> &
  ResolveWith<S, T, O extends { with: infer W } ? W : undefined>;
