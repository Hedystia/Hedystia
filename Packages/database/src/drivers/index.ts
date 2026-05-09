import { DriverError } from "../errors";
import type { ConnectionConfig, DatabaseDriver, DatabaseType } from "../types";
import { FileDriver } from "./file";
import { MySQLDriver } from "./mysql";
import { PostgreSQLDriver } from "./postgres";
import { S3Driver } from "./s3";
import { SQLiteDriver } from "./sqlite";

export { BaseDriver } from "./driver";
export { FileDriver } from "./file";
export { MySQLDriver } from "./mysql";
export { PostgreSQLDriver } from "./postgres";
export { S3Driver } from "./s3";
export * from "./sql-compiler";
export { SQLiteDriver } from "./sqlite";

/**
 * Create a database driver instance based on the database type
 * @param {DatabaseType} type - Database type
 * @param {ConnectionConfig} config - Connection configuration
 * @returns {DatabaseDriver} The created driver
 */
export function createDriver(type: DatabaseType, config: ConnectionConfig): DatabaseDriver {
  const name = typeof type === "string" ? type : type.name;
  const provider = typeof type === "string" ? undefined : type.provider;

  switch (name) {
    case "sqlite":
      return new SQLiteDriver(config as any, provider as any);
    case "mysql":
    case "mariadb":
      return new MySQLDriver(config as any, provider as any);
    case "postgres":
      return new PostgreSQLDriver(config as any, provider as any);
    case "file":
      return new FileDriver(config as any);
    case "s3":
      return new S3Driver(config as any);
    default:
      throw new DriverError(`Unsupported database type: ${name}`);
  }
}
