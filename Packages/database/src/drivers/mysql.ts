import { DriverError } from "../errors";
import type { ColumnMetadata, MySQLConnectionConfig, TableMetadata } from "../types";
import { BaseDriver } from "./driver";
import { compileColumnDef, compileCreateTable, quoteIdentifier } from "./sql-compiler";

interface MySQLPool {
  query(sql: string, params?: any[]): Promise<[any, any]>;
  execute(sql: string, params?: any[]): Promise<[any, any]>;
  getConnection(): Promise<MySQLConnection>;
  end(): Promise<void>;
}

interface MySQLConnection {
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
  query(sql: string, params?: any[]): Promise<[any, any]>;
  execute(sql: string, params?: any[]): Promise<[any, any]>;
}

/**
 * MySQL database driver supporting mysql2 and mysql
 */
export class MySQLDriver extends BaseDriver {
  readonly dialect = "mysql" as const;
  private pool: MySQLPool | null = null;
  private config: MySQLConnectionConfig;
  private provider?: "mysql" | "mysql2";

  constructor(config: MySQLConnectionConfig, provider?: "mysql" | "mysql2") {
    super();
    this.config = config;
    this.provider = provider;
  }

  /**
   * Connect to the MySQL/MariaDB database
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const provider = this.provider;

    try {
      if (!provider || provider === "mysql2") {
        try {
          const mysql2 = await import("mysql2/promise");
          this.pool = mysql2.createPool({
            host: this.config.host,
            port: this.config.port ?? 3306,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            waitForConnections: true,
            connectionLimit: 10,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            decimalNumbers: true,
          });
          this.connected = true;
          return;
        } catch (err) {
          if (provider === "mysql2") {
            throw err;
          }
        }
      }

      if (!provider || provider === "mysql") {
        try {
          const mysql = await import("mysql");
          const pool = mysql.createPool({
            host: this.config.host,
            port: this.config.port ?? 3306,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            connectionLimit: 10,
            waitForConnections: true,
            acquireTimeout: 10000,
          });

          this.pool = {
            execute: (sql: string, params: any[]) =>
              new Promise((resolve, reject) => {
                pool.query(sql, params, (err, results, fields) => {
                  if (err) {
                    return reject(err);
                  }
                  resolve([results, fields]);
                });
              }),
            query: (sql: string, params: any[]) =>
              new Promise((resolve, reject) => {
                pool.query(sql, params, (err, results, fields) => {
                  if (err) {
                    return reject(err);
                  }
                  resolve([results, fields]);
                });
              }),
            getConnection: () =>
              new Promise((resolve, reject) => {
                pool.getConnection((err, conn) => {
                  if (err) {
                    return reject(err);
                  }
                  const wrappedConn: MySQLConnection = {
                    beginTransaction: () =>
                      new Promise<void>((res, rej) =>
                        conn.beginTransaction((e) => (e ? rej(e) : res())),
                      ),
                    commit: () =>
                      new Promise<void>((res, rej) => conn.commit((e) => (e ? rej(e) : res()))),
                    rollback: () =>
                      new Promise<void>((res, rej) => conn.rollback((e) => (e ? rej(e) : res()))),
                    release: () => conn.release(),
                    query: (sql: string, params: any[]) =>
                      new Promise((res, rej) => {
                        conn.query(sql, params, (e, results, fields) =>
                          e ? rej(e) : res([results, fields]),
                        );
                      }),
                    execute: (sql: string, params: any[]) =>
                      new Promise((res, rej) => {
                        conn.query(sql, params, (e, results, fields) =>
                          e ? rej(e) : res([results, fields]),
                        );
                      }),
                  };
                  resolve(wrappedConn);
                });
              }),
            end: () => new Promise<void>((res, rej) => pool.end((e) => (e ? rej(e) : res()))),
          };
          this.connected = true;
        } catch (err) {
          if (provider === "mysql") {
            throw err;
          }
          throw new Error("No MySQL driver found. Please install mysql2 or mysql.");
        }
      }
    } catch (err: any) {
      throw new DriverError(`Failed to connect to MySQL database: ${err.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
    }
  }

  private getPool(): MySQLPool {
    if (!this.pool) {
      throw new DriverError("Database not connected");
    }
    return this.pool;
  }

  /**
   * Execute a SQL statement
   * @param {string} sql - SQL statement
   * @param {unknown[]} [params] - Query parameters
   * @returns {Promise<any>} Execution result
   */
  async execute(sql: string, params: unknown[] = []): Promise<any> {
    try {
      const [result] = await this.getPool().query(sql, this.formatParams(params));
      return {
        insertId: result.insertId,
        affectedRows: result.affectedRows,
      };
    } catch (err: any) {
      throw new DriverError(`MySQL execute error: ${err.message}`);
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
      const [rows] = await this.getPool().query(sql, this.formatParams(params));
      return rows as any[];
    } catch (err: any) {
      throw new DriverError(`MySQL query error: ${err.message}`);
    }
  }

  private formatParams(params: unknown[]): unknown[] {
    return params.map((p) => {
      if (p instanceof Date) {
        return p.toISOString().slice(0, 19).replace("T", " ");
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
    const rows = await this.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [this.config.database, name],
    );
    return rows.length > 0;
  }

  /**
   * Get column metadata for a table
   * @param {string} name - Table name
   * @returns {Promise<ColumnMetadata[]>} Column metadata
   */
  async getTableColumns(name: string): Promise<ColumnMetadata[]> {
    const rows = await this.query(
      "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
      [this.config.database, name],
    );
    return rows.map((row: any) => ({
      name: row.COLUMN_NAME,
      type: this.mapMySQLType(row.DATA_TYPE),
      primaryKey: row.COLUMN_KEY === "PRI",
      autoIncrement: row.EXTRA?.includes("auto_increment") ?? false,
      notNull: row.IS_NULLABLE === "NO",
      unique: row.COLUMN_KEY === "UNI",
      defaultValue: row.COLUMN_DEFAULT,
    }));
  }

  /**
   * Create a table from metadata
   * @param {TableMetadata} meta - Table metadata
   */
  async createTable(meta: TableMetadata): Promise<void> {
    const sql = compileCreateTable(meta, "mysql");
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
    const colDef = compileColumnDef(column, "mysql");
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
   * Create an index on one or more columns.
   *
   * The generated index name follows `${table}_${columns.join("_")}_index`.
   *
   * @param {string} table - Table name
   * @param {string[]} columns - Column names included in the index
   * @param {boolean} [unique=false] - Whether the index should enforce uniqueness
   * @returns {Promise<void>} Resolves after the index is created
   * @throws {DriverError} If no columns are provided or the database rejects the statement
   */
  async addIndex(table: string, columns: string[], unique = false): Promise<void> {
    if (columns.length === 0) {
      throw new DriverError("Index must contain at least one column");
    }
    const indexName = `${table}_${columns.join("_")}_index`;
    const uniqueKeyword = unique ? "UNIQUE " : "";
    const columnList = columns.map((column) => quoteIdentifier(column, "mysql")).join(", ");
    await this.execute(
      `CREATE ${uniqueKeyword}INDEX ${quoteIdentifier(indexName, "mysql")} ON ${quoteIdentifier(table, "mysql")} (${columnList})`,
    );
  }

  /**
   * Drop an index by name.
   *
   * @param {string} _table - Table containing the index
   * @param {string} indexName - Index name to drop
   * @returns {Promise<void>} Resolves after the index is dropped
   * @throws {DriverError} If the database rejects the statement
   */
  async dropIndex(_table: string, indexName: string): Promise<void> {
    await this.execute(
      `DROP INDEX ${quoteIdentifier(indexName, "mysql")} ON ${quoteIdentifier(_table, "mysql")}`,
    );
  }

  /**
   * Execute within a transaction
   * @param {() => Promise<T>} fn - Function to execute
   * @returns {Promise<T>} Result
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const conn = await this.getPool().getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn();
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Fetch all column metadata for all tables in the database in a single query
   * @returns {Promise<Record<string, ColumnMetadata[]>>} Columns grouped by table name
   */
  async getAllTableColumns(): Promise<Record<string, ColumnMetadata[]>> {
    try {
      const rows = await this.query(
        "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION",
        [this.config.database],
      );

      const result: Record<string, ColumnMetadata[]> = {};
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as any;
        if (!row?.TABLE_NAME) {
          continue;
        }
        const tableName = row.TABLE_NAME;
        if (!result[tableName]) {
          result[tableName] = [];
        }
        result[tableName].push({
          name: row.COLUMN_NAME,
          type: this.mapMySQLType(row.DATA_TYPE),
          primaryKey: row.COLUMN_KEY === "PRI",
          autoIncrement: row.EXTRA?.includes("auto_increment") ?? false,
          notNull: row.IS_NULLABLE === "NO",
          unique: row.COLUMN_KEY === "UNI",
          defaultValue: row.COLUMN_DEFAULT,
        });
      }
      return result;
    } catch (err: any) {
      throw new DriverError(`Failed to fetch all table columns: ${err.message}`);
    }
  }

  private mapMySQLType(type: string): ColumnMetadata["type"] {
    const lower = type.toLowerCase();
    if (
      lower === "int" ||
      lower === "integer" ||
      lower === "tinyint" ||
      lower === "smallint" ||
      lower === "mediumint"
    ) {
      return "integer";
    }
    if (lower === "bigint") {
      return "bigint";
    }
    if (lower === "varchar") {
      return "varchar";
    }
    if (lower === "char") {
      return "char";
    }
    if (lower === "text" || lower === "mediumtext" || lower === "longtext") {
      return "text";
    }
    if (lower === "json") {
      return "json";
    }
    if (lower === "datetime") {
      return "datetime";
    }
    if (lower === "timestamp") {
      return "timestamp";
    }
    if (lower === "decimal" || lower === "numeric") {
      return "decimal";
    }
    if (lower === "float" || lower === "double" || lower === "real") {
      return "float";
    }
    if (lower === "blob" || lower === "mediumblob" || lower === "longblob") {
      return "blob";
    }
    return "text";
  }
}
