import type { CacheManager } from "../cache";
import {
  compileBulkInsert,
  compileDelete,
  compileInsert,
  compileSelect,
  compileUpdate,
  compileWhere,
} from "../drivers/sql-compiler";
import { QueryError } from "../errors";
import type { SchemaRegistry } from "../schema";
import type {
  DatabaseDriver,
  DeleteOptions,
  QueryOptions,
  Repository,
  TableMetadata,
  UpdateOptions,
  WhereClause,
} from "../types";

/**
 * Repository implementation that provides CRUD operations for a table
 * @template T - The row type for this table
 */
export class TableRepository<T extends Record<string, any>> implements Repository<T> {
  private tableName: string;
  private driver: DatabaseDriver;
  private cache: CacheManager;
  private registry: SchemaRegistry;
  private meta: TableMetadata;
  private columnMap: Record<string, string>;
  private reverseColumnMap: Record<string, string>;
  private hasAliases: boolean;
  private tableCacheConfig?: { enabled: boolean; ttl?: number; maxTtl?: number };
  private jsonColumns: Set<string>;
  private jsonCodeKeys: Set<string>;
  private dateColumns: Set<string>;

  private get dialect(): string {
    return typeof this.driver.dialect === "string"
      ? this.driver.dialect
      : (this.driver.dialect as { name: string }).name;
  }

  constructor(
    tableName: string,
    driver: DatabaseDriver,
    cache: CacheManager,
    registry: SchemaRegistry,
    tableCacheConfig?: { enabled: boolean; ttl?: number; maxTtl?: number },
  ) {
    this.tableName = tableName;
    this.driver = driver;
    this.cache = cache;
    this.registry = registry;
    this.tableCacheConfig = tableCacheConfig;
    const meta = registry.getTable(tableName);
    if (!meta) {
      throw new QueryError(`Table "${tableName}" is not registered`);
    }
    this.meta = meta;
    this.columnMap = registry.getColumnMap(tableName);
    this.reverseColumnMap = registry.getReverseColumnMap(tableName);
    this.hasAliases = Object.entries(this.columnMap).some(
      ([codeKey, dbName]) => codeKey !== dbName,
    );
    this.jsonColumns = new Set(
      meta.columns.filter((c) => c.type === "json" || c.type === "array").map((c) => c.name),
    );
    this.jsonCodeKeys = new Set<string>();
    for (const col of meta.columns) {
      if (col.type === "json" || col.type === "array") {
        const codeKey = this.reverseColumnMap[col.name] ?? col.name;
        this.jsonCodeKeys.add(codeKey);
      }
    }
    this.dateColumns = new Set<string>();
    for (const col of meta.columns) {
      if (col.type === "datetime" || col.type === "timestamp") {
        const codeKey = this.reverseColumnMap[col.name] ?? col.name;
        this.dateColumns.add(codeKey);
      }
    }
  }

  /**
   * Find all rows matching the query options
   * @param {QueryOptions<T>} [options] - Query options
   * @returns {Promise<T[]>} Array of matching rows
   */
  async find(options?: QueryOptions<T>): Promise<T[]> {
    return this.cache.getOrSetWithTableConfig(
      this.tableName,
      "find",
      options,
      async () => {
        const dbOptions = this.mapOptionsToDb(options);
        const rows = this.mapRows(await this.findSQL(dbOptions as QueryOptions<T>));
        if (options?.with) {
          return this.loadRelations(rows, options.with);
        }
        this.cacheEntities(rows);
        return rows;
      },
      this.tableCacheConfig,
    );
  }

  /**
   * Find all rows matching the query options (alias for find)
   * @param {QueryOptions<T>} [options] - Query options
   * @returns {Promise<T[]>} Array of matching rows
   */
  async findMany(options?: QueryOptions<T>): Promise<T[]> {
    return this.find(options);
  }

  /**
   * Find the first row matching the query options
   * @param {QueryOptions<T>} [options] - Query options
   * @returns {Promise<T | null>} The first matching row or null
   */
  async findFirst(options?: QueryOptions<T>): Promise<T | null> {
    return this.cache.getOrSetWithTableConfig(
      this.tableName,
      "findFirst",
      options,
      async () => {
        const dbOptions = this.mapOptionsToDb(options);
        const opts = { ...dbOptions, take: 1 };
        const rows = this.mapRows(await this.findSQL(opts as QueryOptions<T>));
        if (rows.length === 0) {
          return null;
        }
        if (options?.with) {
          const loaded = await this.loadRelations(rows, options.with);
          const row = loaded[0] ?? null;
          if (row) {
            this.cacheEntity(row);
          }
          return row;
        }
        const row = rows[0] ?? null;
        if (row) {
          this.cacheEntity(row);
        }
        return row;
      },
      this.tableCacheConfig,
    );
  }

  /**
   * Insert one or more rows
   * @param {Partial<T> | Partial<T>[]} data - Data to insert
   * @returns {Promise<T>} The inserted row
   */
  async insert(data: Partial<T> | Partial<T>[]): Promise<T> {
    const single = Array.isArray(data) ? data[0] : data;
    if (!single) {
      throw new QueryError("Insert data cannot be empty");
    }

    this.cache.invalidateTable(this.tableName);
    const cleaned = this.toDbKeys(this.cleanData(single));

    const params: unknown[] = [];
    const sql = compileInsert(this.tableName, cleaned, params, this.dialect);
    const result = await this.driver.execute(sql, params);

    const pk = this.registry.getPrimaryKey(this.tableName);
    if (pk && result.insertId) {
      cleaned[pk] = result.insertId;
    }

    const [mappedResult] = this.mapRows([cleaned]) as [T];
    this.cacheEntity(mappedResult);
    return mappedResult;
  }

  /**
   * Insert multiple rows
   * @param {Partial<T>[]} data - Array of data to insert
   * @returns {Promise<T[]>} The inserted rows
   */
  async insertMany(data: Partial<T>[]): Promise<T[]> {
    if (data.length === 0) {
      return [];
    }

    this.cache.invalidateTable(this.tableName);

    const cleanedData = data.map((item) => this.toDbKeys(this.cleanData(item)));
    const params: unknown[] = [];
    const sql = compileBulkInsert(this.tableName, cleanedData, params, this.dialect);
    const result = await this.driver.execute(sql, params);

    const pk = this.registry.getPrimaryKey(this.tableName);
    if (pk && result.insertId) {
      for (let i = 0; i < cleanedData.length; i++) {
        const row = cleanedData[i];
        if (row) {
          row[pk] = result.insertId + i;
        }
      }
    }

    const finalRows = this.mapRows(cleanedData);
    this.cacheEntities(finalRows);
    return finalRows;
  }

  /**
   * Update rows matching the where clause
   * @param {UpdateOptions<T>} options - Update options with where and data
   * @returns {Promise<T[]>} The updated rows
   */
  async update(options: UpdateOptions<T>): Promise<T[]> {
    if (!options.where || Object.keys(options.where).length === 0) {
      throw new QueryError("Update requires a where clause");
    }

    this.cache.invalidateTable(this.tableName);
    const cleaned = this.toDbKeys(this.cleanData(options.data));
    const dbWhere = this.mapWhereToDb(options.where as WhereClause);

    const params: unknown[] = [];
    const sql = compileUpdate(this.tableName, cleaned, dbWhere, params, this.dialect);
    await this.driver.execute(sql, params);

    return this.find({ where: options.where } as QueryOptions<T>);
  }

  /**
   * Delete rows matching the where clause
   * @param {DeleteOptions<T>} options - Delete options with where clause
   * @returns {Promise<number>} Number of deleted rows
   */
  async delete(options: DeleteOptions<T>): Promise<number> {
    if (!options.where || Object.keys(options.where).length === 0) {
      throw new QueryError("Delete requires a where clause");
    }

    this.cache.invalidateTable(this.tableName);
    const dbWhere = this.mapWhereToDb(options.where as WhereClause);

    const params: unknown[] = [];
    const sql = compileDelete(this.tableName, dbWhere, params, this.dialect);
    const result = await this.driver.execute(sql, params);
    return result.affectedRows;
  }

  /**
   * Count rows matching the where clause
   * @param {Pick<QueryOptions<T>, "where">} [options] - Count options
   * @returns {Promise<number>} Row count
   */
  async count(options?: Pick<QueryOptions<T>, "where">): Promise<number> {
    return this.cache.getOrSetWithTableConfig(
      this.tableName,
      "count",
      options,
      async () => {
        const dbWhere = options?.where
          ? this.mapWhereToDb(options.where as WhereClause)
          : undefined;

        const params: unknown[] = [];
        let sql = `SELECT COUNT(*) as count FROM \`${this.tableName}\``;
        if (dbWhere && Object.keys(dbWhere).length > 0) {
          sql += ` WHERE ${compileWhere(dbWhere, params)}`;
        }
        const rows = await this.driver.query(sql, params);
        return rows[0]?.count ?? 0;
      },
      this.tableCacheConfig,
    );
  }

  /**
   * Check if any row exists matching the where clause
   * @param {Pick<QueryOptions<T>, "where">} options - Exists options
   * @returns {Promise<boolean>} Whether a matching row exists
   */
  async exists(options: Pick<QueryOptions<T>, "where">): Promise<boolean> {
    const c = await this.count(options);
    return c > 0;
  }

  /**
   * Insert or update a row based on the where clause
   * @param {object} options - Upsert options
   * @param {WhereClause<T>} options.where - Condition to check
   * @param {Partial<T>} options.create - Data to insert if not found
   * @param {Partial<T>} options.update - Data to update if found
   * @returns {Promise<T>} The upserted row
   */
  async upsert(options: {
    where: WhereClause<T>;
    create: Partial<T>;
    update: Partial<T>;
  }): Promise<T> {
    const existing = await this.findFirst({ where: options.where } as QueryOptions<T>);
    if (existing) {
      const updated = await this.update({ where: options.where, data: options.update });
      return updated[0] ?? existing;
    }
    return this.insert(options.create);
  }

  /**
   * Remove all rows from the table
   */
  async truncate(): Promise<void> {
    this.cache.invalidateTable(this.tableName);
    const quote = (s: string) => (this.dialect === "postgres" ? `"${s}"` : `\`${s}\``);
    await this.driver.execute(`DELETE FROM ${quote(this.tableName)}`);
  }

  private async findSQL(options?: QueryOptions<T>): Promise<T[]> {
    const params: unknown[] = [];
    const sql = compileSelect(
      this.tableName,
      {
        select: options?.select as string[] | undefined,
        where: options?.where as WhereClause | undefined,
        orderBy: options?.orderBy as Record<string, "asc" | "desc"> | undefined,
        take: options?.take,
        skip: options?.skip,
      },
      params,
      this.dialect,
    );
    return this.driver.query(sql, params);
  }

  private matchWhere(row: Record<string, unknown>, where: WhereClause): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (key === "OR" && Array.isArray(value)) {
        const any = (value as WhereClause[]).some((sub) => this.matchWhere(row, sub));
        if (!any) {
          return false;
        }
        continue;
      }
      if (key === "AND" && Array.isArray(value)) {
        const all = (value as WhereClause[]).every((sub) => this.matchWhere(row, sub));
        if (!all) {
          return false;
        }
        continue;
      }

      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const cond = value as any;
        const rowVal = row[key];
        if (cond.eq !== undefined && rowVal !== cond.eq) {
          return false;
        }
        if (cond.neq !== undefined && rowVal === cond.neq) {
          return false;
        }
        if (cond.gt !== undefined && !((rowVal as any) > cond.gt)) {
          return false;
        }
        if (cond.gte !== undefined && !((rowVal as any) >= cond.gte)) {
          return false;
        }
        if (cond.lt !== undefined && !((rowVal as any) < cond.lt)) {
          return false;
        }
        if (cond.lte !== undefined && !((rowVal as any) <= cond.lte)) {
          return false;
        }
        if (
          cond.like !== undefined &&
          !String(rowVal).match(new RegExp(cond.like.replace(/%/g, ".*"), "i"))
        ) {
          return false;
        }
        if (
          cond.notLike !== undefined &&
          String(rowVal).match(new RegExp(cond.notLike.replace(/%/g, ".*"), "i"))
        ) {
          return false;
        }
        if (cond.in !== undefined && !cond.in.includes(rowVal)) {
          return false;
        }
        if (cond.notIn?.includes(rowVal)) {
          return false;
        }
        if (cond.isNull === true && rowVal !== null && rowVal !== undefined) {
          return false;
        }
        if (cond.isNull === false && (rowVal === null || rowVal === undefined)) {
          return false;
        }
        if (cond.between !== undefined) {
          if ((rowVal as any) < cond.between[0] || (rowVal as any) > cond.between[1]) {
            return false;
          }
        }
      } else {
        if (row[key] !== value) {
          return false;
        }
      }
    }
    return true;
  }

  private async loadRelations(
    rows: T[],
    withOpts: Record<string, boolean | QueryOptions>,
  ): Promise<T[]> {
    if (rows.length === 0) {
      return rows;
    }
    const relations = this.registry.getRelations(this.tableName);

    for (const [relationName, opts] of Object.entries(withOpts)) {
      if (!opts) {
        continue;
      }
      const relation = relations.find((r) => r.relationName === relationName);
      if (!relation) {
        continue;
      }

      const isParent = relation.from.table === this.tableName;
      if (isParent) {
        const ids = rows.map((r) => r[relation.from.column]).filter((v) => v != null);
        if (ids.length === 0) {
          continue;
        }
        const uniqueIds = [...new Set(ids)];
        const relatedOpts: QueryOptions = typeof opts === "object" ? opts : {};
        const related = await this.findRelated(
          relation.to.table,
          relation.to.column,
          uniqueIds,
          relatedOpts,
        );
        const relatedMap = new Map<unknown, unknown[]>();
        for (const r of related) {
          const key = (r as any)[relation.to.column];
          if (!relatedMap.has(key)) {
            relatedMap.set(key, []);
          }
          relatedMap.get(key)!.push(r);
        }
        for (const row of rows) {
          const key = row[relation.from.column];
          const relRows = relatedMap.get(key);
          (row as any)[relationName] = relRows ?? [];
        }
      } else {
        const pk = this.registry.getPrimaryKey(this.tableName);
        if (!pk) {
          continue;
        }
        const ids = rows.map((r) => r[pk]).filter((v) => v != null);
        if (ids.length === 0) {
          continue;
        }
        const uniqueIds = [...new Set(ids)];
        const relatedOpts: QueryOptions = typeof opts === "object" ? opts : {};
        const related = await this.findRelated(
          relation.to.table,
          relation.to.column,
          uniqueIds,
          relatedOpts,
        );
        const relatedMap = new Map<unknown, unknown[]>();
        for (const r of related) {
          const key = (r as any)[relation.to.column];
          if (!relatedMap.has(key)) {
            relatedMap.set(key, []);
          }
          relatedMap.get(key)!.push(r);
        }
        for (const row of rows) {
          const key = row[pk];
          (row as any)[relationName] = relatedMap.get(key) ?? [];
        }
      }
    }

    return rows;
  }

  private async findRelated(
    tableName: string,
    column: string,
    ids: unknown[],
    options: QueryOptions,
  ): Promise<any[]> {
    const params: unknown[] = [];
    const placeholders = ids.map(() => "?").join(", ");
    params.push(...ids);

    let sql = `SELECT * FROM \`${tableName}\` WHERE \`${column}\` IN (${placeholders})`;
    if (options.orderBy) {
      const orderParts = Object.entries(options.orderBy).map(
        ([col, dir]) => `\`${col}\` ${(dir as string).toUpperCase()}`,
      );
      if (orderParts.length > 0) {
        sql += ` ORDER BY ${orderParts.join(", ")}`;
      }
    }
    if (options.take) {
      sql += ` LIMIT ${options.take}`;
    }

    return this.driver.query(sql, params);
  }

  private cleanData(data: Partial<T>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};
    const dbColumnNames = new Set(this.meta.columns.map((c) => c.name));
    const codeKeys = new Set(Object.keys(this.columnMap));
    const shouldSerialize = true;
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (codeKeys.has(key) || dbColumnNames.has(key)) {
        if (
          shouldSerialize &&
          (this.jsonCodeKeys.has(key) || this.jsonColumns.has(key)) &&
          value != null &&
          typeof value === "object"
        ) {
          cleaned[key] = JSON.stringify(value);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }

  private cacheEntities(rows: T[]): void {
    const pk = this.registry.getPrimaryKey(this.tableName);
    if (!pk) {
      return;
    }
    for (const row of rows) {
      if (row[pk] != null) {
        this.cache.setEntity(this.tableName, row[pk], row);
      }
    }
  }

  private cacheEntity(row: T): void {
    const pk = this.registry.getPrimaryKey(this.tableName);
    if (!pk || row[pk] == null) {
      return;
    }
    this.cache.setEntity(this.tableName, row[pk], row);
  }

  private toDbKeys(data: Record<string, unknown>): Record<string, unknown> {
    if (!this.hasAliases) {
      return data;
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[this.columnMap[key] ?? key] = value;
    }
    return result;
  }

  private toCodeKeys(row: Record<string, unknown>): Record<string, unknown> {
    if (!this.hasAliases) {
      return row;
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      result[this.reverseColumnMap[key] ?? key] = value;
    }
    return result;
  }

  private mapWhereToDb(where: WhereClause): WhereClause {
    if (!this.hasAliases) {
      return where;
    }
    const result: WhereClause = {};
    for (const [key, value] of Object.entries(where)) {
      if (key === "OR" || key === "AND") {
        (result as any)[key] = (value as WhereClause[]).map((sub) => this.mapWhereToDb(sub));
      } else {
        result[this.columnMap[key] ?? key] = value;
      }
    }
    return result;
  }

  private mapSelectToDb(select: string[]): string[] {
    if (!this.hasAliases) {
      return select;
    }
    return select.map((key) => this.columnMap[key] ?? key);
  }

  private mapOrderByToDb(orderBy: Record<string, "asc" | "desc">): Record<string, "asc" | "desc"> {
    if (!this.hasAliases) {
      return orderBy;
    }
    const result: Record<string, "asc" | "desc"> = {};
    for (const [key, value] of Object.entries(orderBy)) {
      result[this.columnMap[key] ?? key] = value;
    }
    return result;
  }

  private mapOptionsToDb(options?: QueryOptions<T>): QueryOptions | undefined {
    if (!options || !this.hasAliases) {
      return options as QueryOptions | undefined;
    }
    const mapped: QueryOptions = { ...options } as any;
    if (options.where) {
      mapped.where = this.mapWhereToDb(options.where as WhereClause);
    }
    if (options.select) {
      mapped.select = this.mapSelectToDb(options.select);
    }
    if (options.orderBy) {
      mapped.orderBy = this.mapOrderByToDb(options.orderBy as Record<string, "asc" | "desc">);
    }
    return mapped;
  }

  private mapRows(rows: Record<string, unknown>[]): T[] {
    const shouldDeserialize = this.jsonCodeKeys.size > 0 || this.dateColumns.size > 0;
    if (!this.hasAliases && !shouldDeserialize) {
      return rows as T[];
    }
    return rows.map((row) => {
      const mapped = this.hasAliases ? this.toCodeKeys(row) : { ...row };
      if (shouldDeserialize) {
        for (const key of this.jsonCodeKeys) {
          const val = mapped[key];
          if (typeof val === "string") {
            try {
              mapped[key] = JSON.parse(val);
            } catch {}
          }
        }
        for (const key of this.dateColumns) {
          const val = mapped[key];
          if (typeof val === "string") {
            mapped[key] = new Date(val);
          } else if (typeof val === "number") {
            mapped[key] = new Date(val);
          }
        }
      }
      return mapped as T;
    });
  }
}
