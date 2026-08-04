import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { DriverError } from "../errors";
import type { ColumnMetadata, FileConnectionConfig, TableMetadata } from "../types";
import { BaseDriver } from "./driver";

interface FileTableData {
  rows: Record<string, unknown>[];
  autoIncrementId: number;
  meta: {
    columns: ColumnMetadata[];
  };
}

/**
 * File-based database driver using JSON files for storage
 */
export class FileDriver extends BaseDriver {
  readonly dialect = "file" as const;
  private config: FileConnectionConfig;
  private data = new Map<string, FileTableData>();

  constructor(config: FileConnectionConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to the file database (ensures directory exists and loads data)
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    if (!existsSync(this.config.directory)) {
      mkdirSync(this.config.directory, { recursive: true });
    }
    this.loadAll();
    this.connected = true;
  }

  /**
   * Disconnect from the file database (flushes data to disk)
   */
  async disconnect(): Promise<void> {
    this.flushAll();
    this.data.clear();
    this.connected = false;
  }

  /**
   * Execute a SQL-like statement (parsed internally for file driver)
   * @param {string} sql - SQL statement
   * @param {unknown[]} [params] - Query parameters
   * @returns {Promise<any>} Execution result
   */
  async execute(sql: string, params: unknown[] = []): Promise<any> {
    return this.executeParsed(sql, params);
  }

  /**
   * Execute a SQL-like query
   * @param {string} sql - SQL query
   * @param {unknown[]} [params] - Query parameters
   * @returns {Promise<any[]>} Query results
   */
  async query(sql: string, params: unknown[] = []): Promise<any[]> {
    const result = this.executeParsed(sql, params);
    return Array.isArray(result) ? result : [];
  }

  /**
   * Check if a table exists
   * @param {string} name - Table name
   * @returns {Promise<boolean>} Whether the table exists
   */
  async tableExists(name: string): Promise<boolean> {
    return this.data.has(name);
  }

  /**
   * Get column metadata for a table
   * @param {string} name - Table name
   * @returns {Promise<ColumnMetadata[]>} Column metadata
   */
  async getTableColumns(name: string): Promise<ColumnMetadata[]> {
    const table = this.data.get(name);
    if (!table) {
      return [];
    }
    return Object.values(table.meta.columns);
  }

  /**
   * Create a table from metadata
   * @param {TableMetadata} meta - Table metadata
   */
  async createTable(meta: TableMetadata): Promise<void> {
    if (this.data.has(meta.name)) {
      return;
    }
    this.data.set(meta.name, {
      rows: [],
      autoIncrementId: 0,
      meta: { columns: [...meta.columns] },
    });
    this.flush(meta.name);
  }

  /**
   * Drop a table
   * @param {string} name - Table name
   */
  async dropTable(name: string): Promise<void> {
    this.data.delete(name);
    const filePath = join(this.config.directory, `${name}.json`);
    try {
      const { unlinkSync } = await import("fs");
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {}
  }

  /**
   * Add a column to a table
   * @param {string} table - Table name
   * @param {ColumnMetadata} column - Column metadata
   */
  async addColumn(table: string, column: ColumnMetadata): Promise<void> {
    const tableData = this.data.get(table);
    if (!tableData) {
      throw new DriverError(`Table "${table}" does not exist`);
    }
    tableData.meta.columns.push(column);
    for (const row of tableData.rows) {
      row[column.name] = column.defaultValue ?? null;
    }
    this.flush(table);
  }

  /**
   * Drop a column from a table
   * @param {string} table - Table name
   * @param {string} name - Column name
   */
  async dropColumn(table: string, name: string): Promise<void> {
    const tableData = this.data.get(table);
    if (!tableData) {
      throw new DriverError(`Table "${table}" does not exist`);
    }
    tableData.meta.columns = tableData.meta.columns.filter((c) => c.name !== name);
    for (const row of tableData.rows) {
      delete row[name];
    }
    this.flush(table);
  }

  /**
   * Rename a column
   * @param {string} table - Table name
   * @param {string} oldName - Current name
   * @param {string} newName - New name
   */
  async renameColumn(table: string, oldName: string, newName: string): Promise<void> {
    const tableData = this.data.get(table);
    if (!tableData) {
      throw new DriverError(`Table "${table}" does not exist`);
    }
    const col = tableData.meta.columns.find((c) => c.name === oldName);
    if (col) {
      col.name = newName;
    }
    for (const row of tableData.rows) {
      row[newName] = row[oldName];
      delete row[oldName];
    }
    this.flush(table);
  }

  /**
   * Reject index creation because JSON file storage has no database index engine.
   *
   * @param {string} _table - Table name
   * @param {string[]} _columns - Column names requested for the index
   * @param {boolean} [_unique=false] - Whether uniqueness was requested
   * @returns {Promise<void>} Rejected promise because the operation is unsupported
   * @throws {DriverError} Always, because file storage does not support indexes
   */
  async addIndex(_table: string, _columns: string[], _unique = false): Promise<void> {
    throw new DriverError("Indexes are not supported by the file driver");
  }

  /**
   * Reject index removal because JSON file storage has no database index engine.
   *
   * @param {string} _table - Table name
   * @param {string} _indexName - Index name requested for removal
   * @returns {Promise<void>} Rejected promise because the operation is unsupported
   * @throws {DriverError} Always, because file storage does not support indexes
   */
  async dropIndex(_table: string, _indexName: string): Promise<void> {
    throw new DriverError("Indexes are not supported by the file driver");
  }

  /**
   * Execute within a transaction (pseudo-transaction for file driver)
   * @param {() => Promise<T>} fn - Function to execute
   * @returns {Promise<T>} Result
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const snapshot = new Map<string, string>();
    for (const [name, tableData] of this.data) {
      snapshot.set(name, JSON.stringify(tableData));
    }
    try {
      const result = await fn();
      this.flushAll();
      return result;
    } catch (err) {
      for (const [name, json] of snapshot) {
        this.data.set(name, JSON.parse(json));
      }
      throw err;
    }
  }

  /**
   * Batch fetch all table columns (already in memory for file driver)
   */
  async getAllTableColumns(): Promise<Record<string, ColumnMetadata[]>> {
    const result: Record<string, ColumnMetadata[]> = {};
    for (const [name, tableData] of this.data) {
      result[name] = [...tableData.meta.columns];
    }
    return result;
  }

  private loadAll(): void {
    if (!existsSync(this.config.directory)) {
      return;
    }
    const { readdirSync } = require("fs");
    const files = readdirSync(this.config.directory) as string[];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const name = file.replace(".json", "");
        try {
          const content = readFileSync(join(this.config.directory, file), "utf-8");
          this.data.set(name, JSON.parse(content));
        } catch {}
      }
    }
  }

  private flush(tableName: string): void {
    const tableData = this.data.get(tableName);
    if (!tableData) {
      return;
    }
    const filePath = join(this.config.directory, `${tableName}.json`);
    writeFileSync(filePath, JSON.stringify(tableData, null, 2), "utf-8");
  }

  private flushAll(): void {
    for (const [name] of this.data) {
      this.flush(name);
    }
  }

  private executeParsed(sql: string, params: unknown[]): any {
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith("CREATE TABLE")) {
      return { insertId: 0, affectedRows: 0 };
    }

    if (trimmed.startsWith("DROP TABLE")) {
      const match = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?`?(\w+)`?/i);
      if (match?.[1]) {
        this.data.delete(match[1]);
      }
      return { insertId: 0, affectedRows: 0 };
    }

    if (trimmed.startsWith("INSERT")) {
      return this.handleInsert(sql, params);
    }

    if (trimmed.startsWith("UPDATE")) {
      return this.handleUpdate(sql, params);
    }
    if (trimmed.startsWith("DELETE")) {
      return this.handleDelete(sql, params);
    }

    if (trimmed.startsWith("SELECT")) {
      return this.handleSelect(sql, params);
    }

    return { insertId: 0, affectedRows: 0 };
  }

  private handleInsert(sql: string, params: unknown[]): any {
    const tableMatch = sql.match(/INTO\s+`?(\w+)`?/i);
    if (!tableMatch?.[1]) {
      return { insertId: 0, affectedRows: 0 };
    }

    const tableName = tableMatch[1];
    const tableData = this.data.get(tableName);
    if (!tableData) {
      return { insertId: 0, affectedRows: 0 };
    }

    const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
    if (!colMatch?.[1]) {
      return { insertId: 0, affectedRows: 0 };
    }

    const cols = colMatch[1]
      .split(",")
      .map((c) => c.trim().replace(/`/g, ""))
      .filter(Boolean);

    const rowCount = Math.floor(params.length / cols.length);

    let insertId = 0;
    let pkCol: string | null = null;
    for (const col of tableData.meta.columns) {
      if (col.autoIncrement) {
        pkCol = col.name;
        break;
      }
    }

    for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
      const row: Record<string, unknown> = {};
      const rowParamStart = rowIdx * cols.length;

      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        if (col) {
          row[col] = params[rowParamStart + i];
        }
      }

      if (pkCol && row[pkCol] === undefined) {
        tableData.autoIncrementId++;
        row[pkCol] = tableData.autoIncrementId;
        if (rowIdx === 0) {
          insertId = tableData.autoIncrementId;
        }
      } else if (pkCol && row[pkCol]) {
        if (rowIdx === 0) {
          insertId = row[pkCol] as number;
        }
      }

      tableData.rows.push({ ...row });
    }

    this.flush(tableName);

    return { insertId, affectedRows: rowCount };
  }

  private handleUpdate(sql: string, params: unknown[]): any {
    const tableMatch = sql.match(/UPDATE\s+`?(\w+)`?/i);
    if (!tableMatch?.[1]) {
      return { affectedRows: 0 };
    }

    const tableName = tableMatch[1];
    const tableData = this.data.get(tableName);
    if (!tableData) {
      return { affectedRows: 0 };
    }

    const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i) || sql.match(/SET\s+(.+)$/i);
    if (!setMatch?.[1]) {
      return { affectedRows: 0 };
    }

    const setClauses = setMatch[1].split(",");
    const updates: Record<string, unknown> = {};
    let paramIndex = 0;

    for (const clause of setClauses) {
      const eqMatch = clause.match(/`?(\w+)`?\s*=\s*\?/);
      if (eqMatch?.[1]) {
        updates[eqMatch[1]] = params[paramIndex];
        paramIndex++;
      }
    }

    const whereMatch = sql.match(/WHERE\s+(.+)$/i);
    const whereConditions = whereMatch?.[1] || "";

    let affectedRows = 0;
    for (const row of tableData.rows) {
      if (this.matchesWhere(row, whereConditions, params, paramIndex)) {
        Object.assign(row, updates);
        affectedRows++;
      }
    }

    if (affectedRows > 0) {
      this.flush(tableName);
    }

    return { affectedRows };
  }

  private handleDelete(sql: string, params: unknown[]): any {
    const tableMatch = sql.match(/FROM\s+`?(\w+)`?/i);
    if (!tableMatch?.[1]) {
      return { affectedRows: 0 };
    }

    const tableName = tableMatch[1];
    const tableData = this.data.get(tableName);
    if (!tableData) {
      return { affectedRows: 0 };
    }

    const whereMatch = sql.match(/WHERE\s+(.+)$/i);
    if (!whereMatch?.[1]) {
      const affectedRows = tableData.rows.length;
      tableData.rows = [];
      if (affectedRows > 0) {
        this.flush(tableName);
      }
      return { affectedRows };
    }

    const whereConditions = whereMatch[1];
    const before = tableData.rows.length;

    tableData.rows = tableData.rows.filter(
      (row) => !this.matchesWhere(row, whereConditions, params, 0),
    );

    const affectedRows = before - tableData.rows.length;
    if (affectedRows > 0) {
      this.flush(tableName);
    }

    return { affectedRows };
  }

  private handleSelect(sql: string, params: unknown[]): any {
    const countMatch = sql.match(/SELECT\s+COUNT\s*\(\s*\*\s*\)\s+as\s+(\w+)/i);
    if (countMatch) {
      const tableMatch = sql.match(/FROM\s+`?(\w+)`?/i);
      if (!tableMatch?.[1]) {
        return [];
      }
      const tableName = tableMatch[1];
      const tableData = this.data.get(tableName);
      if (!tableData) {
        return [{ count: 0 }];
      }

      const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
      if (whereMatch?.[1]) {
        const filter = (row: Record<string, unknown>) =>
          this.matchesWhere(row, whereMatch[1]!, params, 0);
        const count = tableData.rows.filter(filter).length;
        return [{ count }];
      }

      return [{ count: tableData.rows.length }];
    }

    const tableMatch = sql.match(/FROM\s+`?(\w+)`?/i);
    if (!tableMatch?.[1]) {
      return [];
    }

    const tableName = tableMatch[1];
    const tableData = this.data.get(tableName);
    if (!tableData) {
      return [];
    }

    let rows = [...tableData.rows];

    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s*$)/i);
    if (whereMatch?.[1]) {
      rows = rows.filter((row) => this.matchesWhere(row, whereMatch[1]!, params, 0));
    }

    const orderMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s*$)/i);
    if (orderMatch?.[1]) {
      const orders = orderMatch[1].split(",");
      rows.sort((a, b) => {
        for (const orderClause of orders) {
          const [col, dir] = orderClause.trim().split(/\s+/);
          const colName = col?.replace(/`/g, "") ?? "";
          const aVal = (a as any)[colName];
          const bVal = (b as any)[colName];
          if (aVal < bVal) {
            return dir?.toUpperCase() === "DESC" ? 1 : -1;
          }
          if (aVal > bVal) {
            return dir?.toUpperCase() === "DESC" ? -1 : 1;
          }
        }
        return 0;
      });
    }

    const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+)|\s*,\s*(\d+))?/i);
    if (limitMatch) {
      const limit = Number.parseInt(limitMatch[1]!, 10);
      const offset = limitMatch[2]
        ? Number.parseInt(limitMatch[2], 10)
        : limitMatch[3]
          ? Number.parseInt(limitMatch[3], 10)
          : 0;
      rows = rows.slice(offset, offset + limit);
    }

    return rows.map((r) => ({ ...r }));
  }

  private matchesWhere(
    row: Record<string, unknown>,
    whereStr: string,
    params: unknown[],
    paramOffset: number,
  ): boolean {
    return this.evaluateWhereExpression(row, whereStr, params, paramOffset).matched;
  }

  private evaluateWhereExpression(
    row: Record<string, unknown>,
    expr: string,
    params: unknown[],
    startParamIdx: number,
  ): { matched: boolean; paramIdx: number } {
    let paramIdx = startParamIdx;
    expr = expr.trim();

    if (expr.startsWith("(") && expr.endsWith(")")) {
      const result = this.evaluateWhereExpression(row, expr.slice(1, -1), params, paramIdx);
      return result;
    }

    const orClauses = this.splitByTopLevel(expr, "OR");
    if (orClauses.length > 1) {
      for (const orClause of orClauses) {
        const result = this.evaluateWhereExpression(row, orClause.trim(), params, paramIdx);
        paramIdx = result.paramIdx;
        if (result.matched) {
          return { matched: true, paramIdx };
        }
      }
      return { matched: false, paramIdx };
    }

    const andClauses = this.splitByTopLevel(expr, "AND");
    if (andClauses.length > 1) {
      for (const andClause of andClauses) {
        const result = this.evaluateWhereExpression(row, andClause.trim(), params, paramIdx);
        paramIdx = result.paramIdx;
        if (!result.matched) {
          return { matched: false, paramIdx };
        }
      }
      return { matched: true, paramIdx };
    }

    return this.evaluateSingleCondition(row, expr, params, paramIdx);
  }

  private splitByTopLevel(expr: string, operator: string): string[] {
    const parts: string[] = [];
    let current = "";
    let parenDepth = 0;

    const opRegex = new RegExp(`\\s+${operator}\\s+`, "i");
    let i = 0;

    while (i < expr.length) {
      const char = expr[i];

      if (char === "(") {
        parenDepth++;
        current += char;
        i++;
      } else if (char === ")") {
        parenDepth--;
        current += char;
        i++;
      } else if (parenDepth === 0) {
        const remaining = expr.slice(i);
        const match = remaining.match(opRegex);

        if (match && match.index === 0) {
          if (current.trim()) {
            parts.push(current.trim());
          }
          i += match[0]!.length;
          current = "";
        } else {
          current += char;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts.length > 0 ? parts : [expr];
  }

  private evaluateSingleCondition(
    row: Record<string, unknown>,
    condition: string,
    params: unknown[],
    paramIdx: number,
  ): { matched: boolean; paramIdx: number } {
    condition = condition.trim();

    const notInMatch = condition.match(/`?(\w+)`?\s+NOT\s+IN\s+\(([^)]*)\)/i);
    if (notInMatch) {
      const col = notInMatch[1]!;
      const placeholders = notInMatch[2]!.split(",").map((p) => p.trim());
      const values: unknown[] = [];
      for (const placeholder of placeholders) {
        if (placeholder === "?") {
          values.push(params[paramIdx]);
          paramIdx++;
        }
      }
      const matched = !values.includes(row[col]);
      return { matched, paramIdx };
    }

    const inMatch = condition.match(/`?(\w+)`?\s+IN\s+\(([^)]*)\)/i);
    if (inMatch) {
      const col = inMatch[1]!;
      const placeholders = inMatch[2]!.split(",").map((p) => p.trim());
      const values: unknown[] = [];
      for (const placeholder of placeholders) {
        if (placeholder === "?") {
          values.push(params[paramIdx]);
          paramIdx++;
        }
      }
      const matched = values.includes(row[col]);
      return { matched, paramIdx };
    }

    const eqMatch = condition.match(/`?(\w+)`?\s*=\s*\?/);
    if (eqMatch) {
      const matched = row[eqMatch[1]!] === params[paramIdx];
      return { matched, paramIdx: paramIdx + 1 };
    }

    const neqMatch = condition.match(/`?(\w+)`?\s*!=\s*\?/);
    if (neqMatch) {
      const matched = row[neqMatch[1]!] !== params[paramIdx];
      return { matched, paramIdx: paramIdx + 1 };
    }

    const gtMatch = condition.match(/`?(\w+)`?\s*>\s*\?/);
    if (gtMatch) {
      const matched = (row[gtMatch[1]!] as any) > (params[paramIdx] as any);
      return { matched, paramIdx: paramIdx + 1 };
    }

    const gteMatch = condition.match(/`?(\w+)`?\s*>=\s*\?/);
    if (gteMatch) {
      const matched = (row[gteMatch[1]!] as any) >= (params[paramIdx] as any);
      return { matched, paramIdx: paramIdx + 1 };
    }

    const ltMatch = condition.match(/`?(\w+)`?\s*<\s*\?/);
    if (ltMatch) {
      const matched = (row[ltMatch[1]!] as any) < (params[paramIdx] as any);
      return { matched, paramIdx: paramIdx + 1 };
    }

    const lteMatch = condition.match(/`?(\w+)`?\s*<=\s*\?/);
    if (lteMatch) {
      const matched = (row[lteMatch[1]!] as any) <= (params[paramIdx] as any);
      return { matched, paramIdx: paramIdx + 1 };
    }

    const notLikeMatch = condition.match(/`?(\w+)`?\s+NOT\s+LIKE\s+\?/i);
    if (notLikeMatch) {
      const pattern = (params[paramIdx] as string).replace(/%/g, ".*");
      const matched = !new RegExp(`^${pattern}$`).test(String(row[notLikeMatch[1]!]));
      return { matched, paramIdx: paramIdx + 1 };
    }

    const likeMatch = condition.match(/`?(\w+)`?\s+LIKE\s+\?/i);
    if (likeMatch) {
      const pattern = (params[paramIdx] as string).replace(/%/g, ".*");
      const matched = new RegExp(`^${pattern}$`).test(String(row[likeMatch[1]!]));
      return { matched, paramIdx: paramIdx + 1 };
    }

    return { matched: true, paramIdx };
  }
}
