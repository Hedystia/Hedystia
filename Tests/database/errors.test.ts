import {
  CacheError,
  DatabaseError,
  DriverError,
  MigrationError,
  QueryError,
  SchemaError,
  SyncError,
} from "@hedystia/db";
import { describe, expect, it } from "vitest";

describe("Error classes", () => {
  it("should create DatabaseError", () => {
    const err = new DatabaseError("test");
    expect(err.message).toBe("test");
    expect(err.name).toBe("DatabaseError");
    expect(err).toBeInstanceOf(Error);
  });

  it("should create SchemaError", () => {
    const err = new SchemaError("schema error");
    expect(err.message).toBe("schema error");
    expect(err.name).toBe("SchemaError");
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it("should create DriverError", () => {
    const err = new DriverError("driver error");
    expect(err.name).toBe("DriverError");
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it("should create QueryError", () => {
    const err = new QueryError("query error");
    expect(err.name).toBe("QueryError");
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it("should create SyncError", () => {
    const err = new SyncError("sync error");
    expect(err.name).toBe("SyncError");
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it("should create MigrationError", () => {
    const err = new MigrationError("migration error");
    expect(err.name).toBe("MigrationError");
    expect(err).toBeInstanceOf(DatabaseError);
  });

  it("should create CacheError", () => {
    const err = new CacheError("cache error");
    expect(err.name).toBe("CacheError");
    expect(err).toBeInstanceOf(DatabaseError);
  });
});
