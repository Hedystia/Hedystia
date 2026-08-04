import { CacheManager } from "./cache";
import { database } from "./core/database";
import { TableRepository } from "./core/repository";
import { createDriver } from "./drivers";
import {
  compileBulkInsert,
  compileColumnDef,
  compileCreateTable,
  compileDelete,
  compileInsert,
  compileSelect,
  compileUpdate,
  compileWhere,
} from "./drivers/sql-compiler";
import { migration } from "./migrations/definition";
import { generateMigrationTemplate, generateSchemaTemplate } from "./migrations/templates";
import { ColumnBuilder } from "./schema/column";
import * as columns from "./schema/columns";
import { SchemaRegistry } from "./schema/registry";
import { table } from "./schema/table";
import { Synchronizer } from "./sync/synchronizer";

export {
  CacheError,
  DatabaseError,
  DriverError,
  MigrationError,
  QueryError,
  SchemaError,
  SyncError,
} from "./errors";
export * from "./schema/columns";
export type {
  CacheConfig,
  ColumnDataType,
  ColumnMetadata,
  ConnectionConfig,
  DatabaseConfig,
  DatabaseDriver,
  DatabaseType,
  DeferredRefMeta,
  DeleteOptions,
  FileConnectionConfig,
  InferInsert,
  InferRow,
  InferUpdate,
  MigrationContext,
  MigrationDefinition,
  MySQLConnectionConfig,
  QueryOptions,
  ReferenceAction,
  RelationQueryMap,
  RelationsFor,
  Repository,
  ResolveResult,
  S3ConnectionConfig,
  SQLiteConnectionConfig,
  TableCacheConfig,
  TableDefinition,
  TableMetadata,
  UpdateOptions,
  WhereClause,
  WhereCondition,
} from "./types";
export {
  CacheManager,
  ColumnBuilder,
  columns,
  compileBulkInsert,
  compileColumnDef,
  compileCreateTable,
  compileDelete,
  compileInsert,
  compileSelect,
  compileUpdate,
  compileWhere,
  createDriver,
  database,
  generateMigrationTemplate,
  generateSchemaTemplate,
  migration,
  SchemaRegistry,
  Synchronizer,
  TableRepository,
  table,
};

export default database;
