import { DriverError } from "../errors";
import type { ColumnMetadata, SQLiteConnectionConfig, TableMetadata } from "../types";
import { BaseDriver } from "./driver";
import { compileColumnDef, compileCreateTable } from "./sql-compiler";

/**
 * Interface for SQLite database adapters
 */
interface SQLiteAdapter {
  close(): void | Promise<void>;
  prepare(sql: string): SQLiteStatement;
  exec(sql: string): void | Promise<void>;
}

interface SQLiteStatement {
  run(...params: any[]): any | Promise<any>;
  all(...params: any[]): any[] | Promise<any[]>;
}

/**
 * SQLite database driver supporting multiple libraries (better-sqlite3, sqlite3, sql.js, bun:sqlite)
 */
export class SQLiteDriver extends BaseDriver {
  readonly dialect = "sqlite" as const;
  private db: SQLiteAdapter | null = null;
  private config: SQLiteConnectionConfig;
  private provider?: "better-sqlite3" | "sqlite3" | "sql.js" | "bun:sqlite";

  constructor(
    config: SQLiteConnectionConfig,
    provider?: "better-sqlite3" | "sqlite3" | "sql.js" | "bun:sqlite",
  ) {
    super();
    this.config = config;
    this.provider = provider;
  }

  /**
   * Connect to the SQLite database
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      const adapter = await this.getAdapter();
      this.db = adapter;
      await this.db.exec("PRAGMA journal_mode=WAL");
      await this.db.exec("PRAGMA foreign_keys=ON");
      this.connected = true;
    } catch (err: any) {
      throw new DriverError(`Failed to connect to SQLite database: ${err.message}`);
    }
  }

  private async getAdapter(): Promise<SQLiteAdapter> {
    const provider = this.provider;

    if (!provider || provider === "better-sqlite3") {
      try {
        const BetterSqlite3 = await import("better-sqlite3");
        const Database = BetterSqlite3.default || BetterSqlite3;
        return new Database(this.config.filename) as any;
      } catch (err) {
        if (provider === "better-sqlite3") {
          throw err;
        }
      }
    }

    if (!provider || provider === "sqlite3") {
      try {
        const sqlite3 = await import("sqlite3");
        const db = new sqlite3.Database(this.config.filename);

        return {
          close: () => new Promise<void>((res, rej) => db.close((err) => (err ? rej(err) : res()))),
          exec: (sql: string) =>
            new Promise<void>((res, rej) => db.exec(sql, (err) => (err ? rej(err) : res()))),
          prepare: (sql: string) => ({
            run: (...params: any[]) =>
              new Promise<{ lastInsertRowid: number; changes: number }>((res, rej) => {
                db.run(sql, params, function (this: any, err: Error | null) {
                  if (err) {
                    return rej(err);
                  }
                  res({ lastInsertRowid: this.lastID, changes: this.changes });
                });
              }),
            all: (...params: any[]) =>
              new Promise<any[]>((res, rej) => {
                db.all(sql, params, (err, rows) => (err ? rej(err) : res(rows)));
              }),
          }),
        } as any;
      } catch (err) {
        if (provider === "sqlite3") {
          throw err;
        }
      }
    }

    if (!provider || provider === "sql.js") {
      try {
        const initSqlJs = await import("sql.js");
        const SQL = await initSqlJs.default();
        const fs = await import("fs");
        let data: Buffer | undefined;
        if (fs.existsSync(this.config.filename)) {
          data = fs.readFileSync(this.config.filename);
        }
        const db = new SQL.Database(data);
        return {
          close: () => {
            const binaryArray = db.export();
            fs.writeFileSync(this.config.filename, Buffer.from(binaryArray));
            db.close();
          },
          exec: (sql: string) => db.run(sql),
          prepare: (sql: string) => {
            const stmt = db.prepare(sql);
            return {
              run: (...params: any[]) => {
                stmt.run(params);
                const result = db.exec("SELECT last_insert_rowid()");
                const lastInsertRowid = result[0]?.values[0]
                  ? (result[0].values[0][0] as number)
                  : 0;
                return { lastInsertRowid, changes: db.getRowsModified() };
              },
              all: (...params: any[]) => {
                const rows: any[] = [];
                stmt.bind(params);
                while (stmt.step()) {
                  rows.push(stmt.getAsObject());
                }
                return rows;
              },
            };
          },
        } as any;
      } catch (err) {
        if (provider === "sql.js") {
          throw err;
        }
      }
    }

    if (!provider || provider === "bun:sqlite") {
      try {
        const { Database } = await import("bun:sqlite");
        return new Database(this.config.filename) as any;
      } catch (err) {
        if (provider === "bun:sqlite") {
          throw err;
        }
      }
    }

    throw new Error(
      provider
        ? `SQLite provider "${provider}" not found.`
        : "No SQLite driver found. Please install better-sqlite3, sqlite3, sql.js or run with Bun.",
    );
  }

  /**
   * Disconnect from the SQLite database
   */
  async disconnect(): Promise<void> {
    if (this.db) {
      try {
        await this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch {}
      await this.db.close();
      this.db = null;
      this.connected = false;
    }
  }

  /**
   * Execute a SQL statement
   * @param {string} sql - SQL statement
   * @param {unknown[]} [params] - Query parameters
   * @returns {Promise<any>} Execution result with lastInsertRowid and changes
   */
  async execute(sql: string, params: unknown[] = []): Promise<any> {
    try {
      const formatted = this.formatParams(params);
      if (formatted.length === 0) {
        await this.db!.exec(sql);
        return { insertId: 0, affectedRows: 0 };
      }
      const stmt = this.db!.prepare(sql);
      const result = await stmt.run(...formatted);
      return {
        insertId: Number(result.lastInsertRowid),
        affectedRows: result.changes,
      };
    } catch (err: any) {
      throw new DriverError(`SQLite execute error: ${err.message}`);
    }
  }

  /**
   * Execute a SQL query
   * @param {string} sql - SQL query
   * @param {unknown[]} [params] - Query parameters
   * @returns {Promise<any[]>} Query results
   */
  async query(sql: string, params: unknown[] = []): Promise<any[]> {
    try {
      const stmt = this.db!.prepare(sql);
      const formatted = this.formatParams(params);

      if ((stmt as any).reader === false) {
        await stmt.run(...formatted);
        return [];
      }

      return await stmt.all(...formatted);
    } catch (err: any) {
      if (err.message?.includes("Use run() instead")) {
        const stmt = this.db!.prepare(sql);
        await stmt.run(...this.formatParams(params));
        return [];
      }
      throw new DriverError(`SQLite query error: ${err.message}`);
    }
  }

  private formatParams(params: unknown[]): any[] {
    return params.map((p) => {
      if (p instanceof Date) {
        return p.toISOString();
      }
      if (typeof p === "boolean") {
        return p ? 1 : 0;
      }
      return p;
    });
  }

  /**
   * Check if a table exists
   * @param {string} name - Table name
   * @returns {Promise<boolean>} Whether the table exists
   */
  async tableExists(name: string): Promise<boolean> {
    const rows = await this.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [
      name,
    ]);
    return rows.length > 0;
  }

  /**
   * Get column metadata for a table
   * @param {string} name - Table name
   * @returns {Promise<ColumnMetadata[]>} Column metadata
   */
  async getTableColumns(name: string): Promise<ColumnMetadata[]> {
    const rows = (await this.query(`PRAGMA table_info(\`${name}\`)`)) as any[];
    return rows.map((row: any) => ({
      name: row.name,
      type: this.mapSQLiteType(row.type),
      primaryKey: row.pk === 1,
      autoIncrement: row.pk === 1 && row.type.toUpperCase() === "INTEGER",
      notNull: row.notnull === 1,
      unique: false,
      defaultValue: row.dflt_value,
    }));
  }

  /**
   * Create a table from metadata
   * @param {TableMetadata} meta - Table metadata
   */
  async createTable(meta: TableMetadata): Promise<void> {
    const sql = compileCreateTable(meta, "sqlite");
    await this.execute(sql);
  }

  /**
   * Drop a table
   * @param {string} name - Table name
   */
  async dropTable(name: string): Promise<void> {
    await this.execute(`DROP TABLE IF EXISTS \`${name}\``);
  }

  /**
   * Add a column to a table
   * @param {string} table - Table name
   * @param {ColumnMetadata} column - Column metadata
   */
  async addColumn(table: string, column: ColumnMetadata): Promise<void> {
    const colDef = compileColumnDef(column, "sqlite");
    await this.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${colDef}`);
  }

  /**
   * Drop a column from a table
   * @param {string} table - Table name
   * @param {string} name - Column name
   */
  async dropColumn(table: string, name: string): Promise<void> {
    await this.execute(`ALTER TABLE \`${table}\` DROP COLUMN \`${name}\``);
  }

  /**
   * Rename a column
   * @param {string} table - Table name
   * @param {string} oldName - Current name
   * @param {string} newName - New name
   */
  async renameColumn(table: string, oldName: string, newName: string): Promise<void> {
    await this.execute(`ALTER TABLE \`${table}\` RENAME COLUMN \`${oldName}\` TO \`${newName}\``);
  }

  /**
   * Execute within a transaction
   * @param {() => Promise<T>} fn - Function to execute
   * @returns {Promise<T>} Result
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.execute("BEGIN TRANSACTION");
    try {
      const result = await fn();
      await this.execute("COMMIT");
      return result;
    } catch (err) {
      await this.execute("ROLLBACK");
      throw err;
    }
  }

  /**
   * Fetch all column metadata for all tables in the database
   * @returns {Promise<Record<string, ColumnMetadata[]>>} Columns grouped by table name
   */
  async getAllTableColumns(): Promise<Record<string, ColumnMetadata[]>> {
    try {
      const tables = await this.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      );
      const result: Record<string, ColumnMetadata[]> = {};

      for (const table of tables) {
        const tableName = table.name;
        result[tableName] = await this.getTableColumns(tableName);
      }
      return result;
    } catch (err: any) {
      throw new DriverError(`Failed to fetch all table columns: ${err.message}`);
    }
  }

  private mapSQLiteType(type: string): ColumnMetadata["type"] {
    const upper = type.toUpperCase();
    if (upper.includes("INT")) {
      return "integer";
    }
    if (upper.includes("CHAR") || upper.includes("TEXT") || upper.includes("CLOB")) {
      return "text";
    }
    if (upper.includes("REAL") || upper.includes("FLOAT") || upper.includes("DOUBLE")) {
      return "float";
    }
    if (upper.includes("BLOB")) {
      return "blob";
    }
    return "text";
  }
}
