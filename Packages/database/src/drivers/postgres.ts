import { DriverError } from "../errors";
import type { ColumnMetadata, PostgreSQLConnectionConfig, TableMetadata } from "../types";
import { BaseDriver } from "./driver";
import { compileColumnDef, compileCreateTable } from "./sql-compiler";

interface PostgreSQLPool {
  query(sql: string, params?: any[]): Promise<any>;
  connect(): Promise<any>;
  end(): Promise<void>;
}

/**
 * PostgreSQL database driver using pg
 */
export class PostgreSQLDriver extends BaseDriver {
  readonly dialect = "postgres" as const;
  private pool: PostgreSQLPool | null = null;
  private config: PostgreSQLConnectionConfig;

  constructor(config: PostgreSQLConnectionConfig, _provider?: "pg") {
    super();
    this.config = config;
  }

  /**
   * Connect to the PostgreSQL database
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      const pg = await import("pg");
      const { Pool } = pg;

      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port ?? 5432,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      await this.pool?.query("SELECT 1");
      this.connected = true;
    } catch (err: any) {
      throw new DriverError(`Failed to connect to PostgreSQL database: ${err.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
    }
  }

  private getPool(): PostgreSQLPool {
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
      const result = await this.getPool().query(sql, this.formatParams(params));
      return {
        insertId: result.insertId,
        affectedRows: result.rowCount,
      };
    } catch (err: any) {
      throw new DriverError(`PostgreSQL execute error: ${err.message}`);
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
      const result = await this.getPool().query(sql, this.formatParams(params));
      return result.rows as any[];
    } catch (err: any) {
      throw new DriverError(`PostgreSQL query error: ${err.message}`);
    }
  }

  private formatParams(params: unknown[]): unknown[] {
    return params.map((p) => {
      if (p instanceof Date) {
        return p.toISOString();
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
      "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = $1 AND TABLE_NAME = $2",
      ["public", name],
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
      `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, c.character_maximum_length,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
        CASE WHEN c.column_default LIKE 'nextval%' THEN true ELSE false END as is_auto_increment
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_name = $1 AND c.table_schema = 'public'
      ORDER BY c.ordinal_position`,
      [name],
    );
    return rows.map((row: any) => ({
      name: row.column_name,
      type: this.mapPostgresType(row.data_type, row.character_maximum_length),
      primaryKey: row.is_primary_key,
      autoIncrement: row.is_auto_increment,
      notNull: row.is_nullable === "NO",
      unique: false,
      defaultValue: row.column_default,
    }));
  }

  /**
   * Create a table from metadata
   * @param {TableMetadata} meta - Table metadata
   */
  async createTable(meta: TableMetadata): Promise<void> {
    const sql = compileCreateTable(meta, "postgres");
    await this.execute(sql);
  }

  /**
   * Drop a table
   * @param {string} name - Table name
   */
  async dropTable(name: string): Promise<void> {
    await this.execute(`DROP TABLE IF EXISTS "${name}"`);
  }

  /**
   * Add a column to a table
   * @param {string} table - Table name
   * @param {ColumnMetadata} column - Column metadata
   */
  async addColumn(table: string, column: ColumnMetadata): Promise<void> {
    const colDef = compileColumnDef(column, "postgres");
    await this.execute(`ALTER TABLE "${table}" ADD COLUMN ${colDef}`);
  }

  /**
   * Drop a column from a table
   * @param {string} table - Table name
   * @param {string} name - Column name
   */
  async dropColumn(table: string, name: string): Promise<void> {
    await this.execute(`ALTER TABLE "${table}" DROP COLUMN "${name}"`);
  }

  /**
   * Rename a column
   * @param {string} table - Table name
   * @param {string} oldName - Current name
   * @param {string} newName - New name
   */
  async renameColumn(table: string, oldName: string, newName: string): Promise<void> {
    await this.execute(`ALTER TABLE "${table}" RENAME COLUMN "${oldName}" TO "${newName}"`);
  }

  /**
   * Execute within a transaction
   * @param {() => Promise<T>} fn - Function to execute
   * @returns {Promise<T>} Result
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn();
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Fetch all column metadata for all tables in the database in a single query
   * @returns {Promise<Record<string, ColumnMetadata[]>>} Columns grouped by table name
   */
  async getAllTableColumns(): Promise<Record<string, ColumnMetadata[]>> {
    try {
      const rows = await this.query(
        `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default, c.character_maximum_length,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
          CASE WHEN c.column_default LIKE 'nextval%' THEN true ELSE false END as is_auto_increment
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.table_name, kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
        WHERE c.table_schema = 'public'
        ORDER BY c.table_name, c.ordinal_position`,
      );

      const result: Record<string, ColumnMetadata[]> = {};
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as any;
        if (!row?.table_name) {
          continue;
        }
        const tableName = row.table_name;
        if (!result[tableName]) {
          result[tableName] = [];
        }
        result[tableName].push({
          name: row.column_name,
          type: this.mapPostgresType(row.data_type, row.character_maximum_length),
          primaryKey: row.is_primary_key,
          autoIncrement: row.is_auto_increment,
          notNull: row.is_nullable === "NO",
          unique: false,
          defaultValue: row.column_default,
        });
      }
      return result;
    } catch (err: any) {
      throw new DriverError(`Failed to fetch all table columns: ${err.message}`);
    }
  }

  private mapPostgresType(type: string, _maxLength?: number): ColumnMetadata["type"] {
    const lower = type.toLowerCase();
    if (lower === "integer" || lower === "int4") {
      return "integer";
    }
    if (lower === "bigint" || lower === "int8") {
      return "bigint";
    }
    if (lower === "smallint" || lower === "int2") {
      return "integer";
    }
    if (lower === "character varying" || lower === "varchar") {
      return "varchar";
    }
    if (lower === "character" || lower === "char") {
      return "char";
    }
    if (lower === "text") {
      return "text";
    }
    if (lower === "json" || lower === "jsonb") {
      return "json";
    }
    if (lower === "timestamp" || lower === "timestamp without time zone") {
      return "timestamp";
    }
    if (lower === "timestamptz" || lower === "timestamp with time zone") {
      return "timestamp";
    }
    if (lower === "date") {
      return "datetime";
    }
    if (lower === "time" || lower === "time without time zone") {
      return "datetime";
    }
    if (lower === "decimal" || lower === "numeric" || lower === "number") {
      return "decimal";
    }
    if (
      lower === "real" ||
      lower === "float4" ||
      lower === "double precision" ||
      lower === "float8"
    ) {
      return "float";
    }
    if (lower === "bytea") {
      return "blob";
    }
    if (lower === "boolean" || lower === "bool") {
      return "boolean";
    }
    if (lower === "array") {
      return "array";
    }
    return "text";
  }
}
