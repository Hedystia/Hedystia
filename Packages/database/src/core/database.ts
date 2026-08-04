import { CacheManager } from "../cache";
import { MIGRATIONS_TABLE } from "../constants";
import { createDriver } from "../drivers";
import { dialectName, placeholder, quoteIdentifier } from "../drivers/sql-compiler";
import { DatabaseError } from "../errors";
import { SchemaRegistry } from "../schema";
import type {
  AnyTableDef,
  ConnectionConfig,
  DatabaseConfig,
  DatabaseDriver,
  DeleteOptions,
  InferRow,
  MigrationDefinition,
  QueryOptions,
  RelationQueryMap,
  ResolveResult,
  TableMetadata,
  UpdateOptions,
  WhereClause,
} from "../types";
import { TableRepository } from "./repository";

type TypedTableRepository<S, T extends AnyTableDef> = {
  /**
   * Find all rows matching the given options
   * @param options - Filter, sort, paginate, and eagerly load relations
   * @returns Array of matching rows
   */
  find<O extends QueryOptions<InferRow<T>, RelationQueryMap<S, T>> = {}>(
    options?: O,
  ): Promise<ResolveResult<S, T, O>[]>;

  /**
   * Find all rows matching the given options (alias for {@link find})
   * @param options - Filter, sort, paginate, and eagerly load relations
   * @returns Array of matching rows
   */
  findMany<O extends QueryOptions<InferRow<T>, RelationQueryMap<S, T>> = {}>(
    options?: O,
  ): Promise<ResolveResult<S, T, O>[]>;

  /**
   * Find the first row matching the given options
   * @param options - Filter, sort, and eagerly load relations
   * @returns The first matching row, or `null` if none found
   */
  findFirst<O extends QueryOptions<InferRow<T>, RelationQueryMap<S, T>> = {}>(
    options?: O,
  ): Promise<ResolveResult<S, T, O> | null>;

  /**
   * Insert one or more rows into the table
   * @param data - Row data (or array of row data) to insert
   * @returns The inserted row
   */
  insert(data: Partial<InferRow<T>> | Partial<InferRow<T>>[]): Promise<InferRow<T>>;

  /**
   * Insert multiple rows into the table
   * @param data - Array of row data to insert
   * @returns Array of inserted rows
   */
  insertMany(data: Partial<InferRow<T>>[]): Promise<InferRow<T>[]>;

  /**
   * Update rows matching the where clause
   * @param options - Where clause and partial data to apply
   * @returns Array of updated rows
   */
  update(options: UpdateOptions<InferRow<T>>): Promise<InferRow<T>[]>;

  /**
   * Delete rows matching the where clause
   * @param options - Where clause to select rows for deletion
   * @returns Number of deleted rows
   */
  delete(options: DeleteOptions<InferRow<T>>): Promise<number>;

  /**
   * Count rows matching the where clause
   * @param options - Optional where clause to filter rows
   * @returns Number of matching rows
   */
  count(options?: Pick<QueryOptions<InferRow<T>>, "where">): Promise<number>;

  /**
   * Check whether at least one row matches the where clause
   * @param options - Where clause to check
   * @returns `true` if a matching row exists, `false` otherwise
   */
  exists(options: Pick<QueryOptions<InferRow<T>>, "where">): Promise<boolean>;

  /**
   * Insert a row if it doesn't exist, or update it if it does
   * @param options - Where clause to check, data to create, and data to update
   * @returns The created or updated row
   */
  upsert(options: {
    where: WhereClause<InferRow<T>>;
    create: Partial<InferRow<T>>;
    update: Partial<InferRow<T>>;
  }): Promise<InferRow<T>>;

  /**
   * Remove all rows from the table
   * @returns Resolves when the table has been truncated
   */
  truncate(): Promise<void>;
};

type ExtractRepos<S> = S extends readonly AnyTableDef[]
  ? { [T in S[number] as T["__name"]]: TypedTableRepository<S, T> }
  : S extends Record<string, any>
    ? {
        [K in keyof S as S[K] extends AnyTableDef ? K : never]: TypedTableRepository<
          S,
          Extract<S[K], AnyTableDef>
        >;
      }
    : never;

type DatabaseInstance<S> = ExtractRepos<S> & {
  /**
   * Initialize the database connection, create tables and run migrations
   * @returns {Promise<void>}
   */
  initialize(): Promise<void>;
  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  close(): Promise<void>;
  /**
   * Get the underlying database driver
   * @returns {DatabaseDriver} The database driver
   */
  getDriver(): DatabaseDriver;
  /**
   * Get the schema registry
   * @returns {SchemaRegistry} The schema registry
   */
  getRegistry(): SchemaRegistry;
  /**
   * Get the cache manager
   * @returns {CacheManager} The cache manager
   */
  getCache(): CacheManager;
  /**
   * Execute a raw SQL query
   * @param {string} sql - SQL query
   * @param {unknown[]} [params] - Query parameters
   * @returns {Promise<any[]>} Query results
   */
  raw(sql: string, params?: unknown[]): Promise<any[]>;
  /**
   * Execute within a transaction
   * @param {() => Promise<T>} fn - Function to execute
   * @returns {Promise<T>} Result
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Run pending migrations manually
   * @returns {Promise<void>}
   */
  migrateUp(): Promise<void>;
  /**
   * Rollback migrations
   * @param {number} [steps=1] - Number of migrations to rollback
   * @returns {Promise<string[]>} Names of rolled back migrations
   */
  migrateDown(steps?: number): Promise<string[]>;
};

/**
 * Create a database instance with typed repositories for each schema
 * @param {DatabaseConfig} config - Database configuration
 * @returns {DatabaseInstance<S>} Database instance with table repositories
 */
function normalizeMigrations(
  migrations: MigrationDefinition[] | Record<string, unknown>,
): MigrationDefinition[] {
  if (Array.isArray(migrations)) {
    return migrations;
  }
  return Object.values(migrations).filter(
    (v): v is MigrationDefinition =>
      v != null && typeof v === "object" && "name" in v && "up" in v && "down" in v,
  );
}

function normalizeSchemas<S extends readonly AnyTableDef[]>(schemas: any): S {
  if (Array.isArray(schemas)) {
    return schemas as any as S;
  }
  return Object.values(schemas).filter(
    (v): v is AnyTableDef => v != null && typeof v === "object" && (v as any).__table === true,
  ) as any;
}

function buildSchemaKeyMap(rawSchemas: any): Map<string, string> {
  const map = new Map<string, string>();
  if (Array.isArray(rawSchemas)) {
    for (const schema of rawSchemas) {
      if (schema != null && typeof schema === "object" && schema.__table === true) {
        map.set(schema.__name, schema.__name);
      }
    }
    return map;
  }
  for (const [key, value] of Object.entries(rawSchemas)) {
    if (value != null && typeof value === "object" && (value as any).__table === true) {
      map.set((value as any).__name, key);
    }
  }
  return map;
}

export function database<const S extends readonly AnyTableDef[] | Record<string, any>>(
  config: DatabaseConfig & { schemas: S },
): DatabaseInstance<S> {
  const schemaKeyMap = buildSchemaKeyMap(config.schemas);
  const schemas = normalizeSchemas(config.schemas) as any;
  const registry = new SchemaRegistry();
  registry.register(schemas, schemaKeyMap);

  const dbName = typeof config.database === "string" ? config.database : config.database.name;

  let connectionConfig: ConnectionConfig | undefined;
  if (Array.isArray(config.connection)) {
    if (dbName === "sqlite") {
      connectionConfig = config.connection.find((c) => "filename" in c) ?? config.connection[0];
    } else if (dbName === "mysql" || dbName === "mariadb") {
      connectionConfig = config.connection.find((c) => "host" in c) ?? config.connection[0];
    } else if (dbName === "file") {
      connectionConfig = config.connection.find((c) => "directory" in c) ?? config.connection[0];
    } else if (dbName === "s3") {
      connectionConfig = config.connection.find((c) => "bucket" in c) ?? config.connection[0];
    } else {
      connectionConfig = config.connection[0];
    }
  } else {
    connectionConfig = config.connection;
  }

  if (!connectionConfig) {
    throw new DatabaseError("Connection config is required");
  }

  const driver = createDriver(config.database, connectionConfig as ConnectionConfig);
  const cache = new CacheManager(config.cache);

  let initialized = false;
  let initPromise: Promise<void> | null = null;

  const ensureInitialized = async () => {
    if (initialized) {
      return;
    }
    if (initPromise) {
      return initPromise;
    }
    initPromise = doInit();
    await initPromise;
    initialized = true;
  };

  const doInit = async () => {
    await driver.connect();

    if (config.syncSchemas) {
      const allMetadata = driver.getAllTableColumns ? await driver.getAllTableColumns() : null;

      const syncPromises = Array.from(registry.getAllTables()).map(async ([, tableMeta]) => {
        const existingCols = allMetadata ? allMetadata[tableMeta.name] : null;
        const exists = allMetadata ? !!existingCols : await driver.tableExists(tableMeta.name);

        if (!exists) {
          await driver.createTable(tableMeta);
        } else {
          const cols = existingCols || (await driver.getTableColumns(tableMeta.name));
          const existingNames = new Set(cols.map((c) => c.name));
          const addColumnPromises = tableMeta.columns
            .filter((colMeta) => !existingNames.has(colMeta.name))
            .map((colMeta) => driver.addColumn(tableMeta.name, colMeta));
          await Promise.all(addColumnPromises);
        }
      });
      await Promise.all(syncPromises);
    }

    if (config.runMigrations && config.migrations) {
      const migrations = normalizeMigrations(config.migrations);
      if (migrations.length > 0) {
        await runMigrations(driver, registry, migrations);
      }
    }
  };

  const repos = new Map<string, TableRepository<any>>();
  for (const schema of schemas) {
    const repo = new TableRepository(schema.__name, driver, cache, registry, schema.__cache);
    repos.set(schema.__name, repo);
  }

  const instance: any = {
    initialize: async () => {
      await ensureInitialized();
    },
    close: async () => {
      await driver.disconnect();
      cache.clear();
      initialized = false;
      initPromise = null;
    },
    getDriver: () => driver,
    getRegistry: () => registry,
    getCache: () => cache,
    raw: async (sql: string, params?: unknown[]) => {
      await ensureInitialized();
      return driver.query(sql, params);
    },
    transaction: async <T>(fn: () => Promise<T>) => {
      await ensureInitialized();
      return driver.transaction(fn);
    },
    migrateUp: async () => {
      await ensureInitialized();
      if (config.migrations) {
        const migrations = normalizeMigrations(config.migrations);
        if (migrations.length > 0) {
          await runMigrations(driver, registry, migrations);
        }
      }
    },
    migrateDown: async (steps = 1) => {
      await ensureInitialized();
      if (config.migrations) {
        const migrations = normalizeMigrations(config.migrations);
        return rollbackMigrations(driver, registry, migrations, steps);
      }
      return [];
    },
  };

  for (const schema of schemas) {
    const repo = repos.get(schema.__name)!;
    const proxy = new Proxy(repo, {
      get(target, prop, receiver) {
        const original = Reflect.get(target, prop, receiver);
        if (typeof original === "function") {
          return async (...args: any[]) => {
            await ensureInitialized();
            return original.apply(target, args);
          };
        }
        return original;
      },
    });
    const accessorKey = schemaKeyMap.get(schema.__name) ?? schema.__name;
    instance[accessorKey] = proxy;
  }

  return instance as any as DatabaseInstance<S>;
}

function getMigrationsTableMeta(): TableMetadata {
  return {
    name: MIGRATIONS_TABLE,
    columns: [
      {
        name: "id",
        type: "integer",
        primaryKey: true,
        autoIncrement: true,
        notNull: true,
        unique: true,
        defaultValue: undefined,
      },
      {
        name: "name",
        type: "varchar",
        primaryKey: false,
        autoIncrement: false,
        notNull: true,
        unique: true,
        defaultValue: undefined,
        length: 255,
      },
      {
        name: "executed_at",
        type: "datetime",
        primaryKey: false,
        autoIncrement: false,
        notNull: true,
        unique: false,
        defaultValue: undefined,
      },
    ],
  };
}

function createMigrationContext(
  driver: DatabaseDriver,
  registry: SchemaRegistry,
): MigrationDefinition["up"] extends (ctx: infer C) => any ? C : never {
  return {
    schema: {
      createTable: async (tableDef: AnyTableDef) => {
        const meta = registry.getTable(tableDef.__name) ?? {
          name: tableDef.__name,
          columns: [...tableDef.__columns],
        };
        await driver.createTable(meta);
      },
      dropTable: async (name: string) => {
        await driver.dropTable(name);
      },
      addColumn: async (table: string, _name: string, column: any) => {
        await driver.addColumn(table, column);
      },
      dropColumn: async (table: string, name: string) => {
        await driver.dropColumn(table, name);
      },
      renameColumn: async (table: string, oldName: string, newName: string) => {
        await driver.renameColumn(table, oldName, newName);
      },
      addIndex: async (table: string, columns: string[], unique?: boolean) => {
        await driver.addIndex(table, columns, unique);
      },
      dropIndex: async (table: string, indexName: string) => {
        await driver.dropIndex(table, indexName);
      },
    },
    sql: async (query: string, params?: unknown[]) => {
      return driver.execute(query, params);
    },
  };
}

async function ensureMigrationsTable(driver: DatabaseDriver): Promise<void> {
  const exists = await driver.tableExists(MIGRATIONS_TABLE);
  if (!exists) {
    await driver.createTable(getMigrationsTableMeta());
  }
}

async function runMigrations(
  driver: DatabaseDriver,
  registry: SchemaRegistry,
  migrations: MigrationDefinition[],
): Promise<void> {
  await ensureMigrationsTable(driver);

  const dialect = dialectName(driver.dialect);
  const migrationsTable = quoteIdentifier(MIGRATIONS_TABLE, dialect);
  const executed = await driver.query(
    `SELECT ${quoteIdentifier("name", dialect)} FROM ${migrationsTable}`,
  );
  const executedNames = new Set(executed.map((r: any) => r.name));

  const ctx = createMigrationContext(driver, registry);

  for (const migration of migrations) {
    if (executedNames.has(migration.name)) {
      continue;
    }

    await migration.up(ctx);

    await driver.execute(
      `INSERT INTO ${migrationsTable} (${quoteIdentifier("name", dialect)}, ${quoteIdentifier("executed_at", dialect)}) VALUES (${placeholder(1, dialect)}, ${placeholder(2, dialect)})`,
      [migration.name, new Date()],
    );
  }
}

async function rollbackMigrations(
  driver: DatabaseDriver,
  registry: SchemaRegistry,
  migrations: MigrationDefinition[],
  steps = 1,
): Promise<string[]> {
  await ensureMigrationsTable(driver);

  const dialect = dialectName(driver.dialect);
  const migrationsTable = quoteIdentifier(MIGRATIONS_TABLE, dialect);
  const executed = await driver.query(
    `SELECT ${quoteIdentifier("name", dialect)} FROM ${migrationsTable} ORDER BY ${quoteIdentifier("id", dialect)} DESC`,
  );
  const executedNames = executed.map((r: any) => r.name as string);

  const ctx = createMigrationContext(driver, registry);
  const migrationMap = new Map(migrations.map((m) => [m.name, m]));
  const rolledBack: string[] = [];

  const toRollback = executedNames.slice(0, steps);

  for (const name of toRollback) {
    const migration = migrationMap.get(name);
    if (!migration) {
      continue;
    }

    await migration.down(ctx);

    await driver.execute(
      `DELETE FROM ${migrationsTable} WHERE ${quoteIdentifier("name", dialect)} = ${placeholder(1, dialect)}`,
      [name],
    );
    rolledBack.push(name);
  }

  return rolledBack;
}
