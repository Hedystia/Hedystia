import type { ColumnMetadata, DatabaseDriver, DatabaseType, TableMetadata } from "../types";

/**
 * Abstract base class for database drivers
 */
export abstract class BaseDriver implements DatabaseDriver {
  protected connected = false;
  abstract readonly dialect: DatabaseType;

  /**
   * Connect to the database
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the database
   */
  abstract disconnect(): Promise<void>;

  /**
   * Execute a SQL statement that does not return rows
   * @param {string} sql - SQL statement
   * @param {unknown[]} [params] - Query parameters
   * @returns {Promise<any>} Execution result
   */
  abstract execute(sql: string, params?: unknown[]): Promise<any>;

  /**
   * Execute a SQL query that returns rows
   * @param {string} sql - SQL query
   * @param {unknown[]} [params] - Query parameters
   * @returns {Promise<any[]>} Query results
   */
  abstract query(sql: string, params?: unknown[]): Promise<any[]>;

  /**
   * Check if a table exists in the database
   * @param {string} name - Table name
   * @returns {Promise<boolean>} Whether the table exists
   */
  abstract tableExists(name: string): Promise<boolean>;

  /**
   * Get column metadata for a table
   * @param {string} name - Table name
   * @returns {Promise<ColumnMetadata[]>} Column metadata array
   */
  abstract getTableColumns(name: string): Promise<ColumnMetadata[]>;

  /**
   * Create a table from metadata
   * @param {TableMetadata} meta - Table metadata
   */
  abstract createTable(meta: TableMetadata): Promise<void>;

  /**
   * Drop a table by name
   * @param {string} name - Table name
   */
  abstract dropTable(name: string): Promise<void>;

  /**
   * Add a column to a table
   * @param {string} table - Table name
   * @param {ColumnMetadata} column - Column metadata
   */
  abstract addColumn(table: string, column: ColumnMetadata): Promise<void>;

  /**
   * Drop a column from a table
   * @param {string} table - Table name
   * @param {string} name - Column name
   */
  abstract dropColumn(table: string, name: string): Promise<void>;

  /**
   * Rename a column in a table
   * @param {string} table - Table name
   * @param {string} oldName - Current column name
   * @param {string} newName - New column name
   */
  abstract renameColumn(table: string, oldName: string, newName: string): Promise<void>;

  /**
   * Create an index on one or more columns.
   * @param {string} table - Table name
   * @param {string[]} columns - Column names
   * @param {boolean} [unique] - Whether the index should enforce uniqueness
   */
  abstract addIndex(table: string, columns: string[], unique?: boolean): Promise<void>;

  /**
   * Drop an index by name.
   * @param {string} table - Table name
   * @param {string} indexName - Index name
   */
  abstract dropIndex(table: string, indexName: string): Promise<void>;

  /**
   * Execute a function within a transaction
   * @param {() => Promise<T>} fn - Function to execute within the transaction
   * @returns {Promise<T>} Function result
   */
  abstract transaction<T>(fn: () => Promise<T>): Promise<T>;
}
