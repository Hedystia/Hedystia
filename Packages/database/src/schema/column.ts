import type { ColumnDataType, ColumnMetadata, DeferredRefMeta, ReferenceAction } from "../types";

/**
 * Base column builder with chainable methods for defining column properties
 * @template T - The TypeScript type this column resolves to
 * @template TN - The table name this column belongs to (set by table())
 * @template CN - The column name (set by table())
 * @template Ref - The deferred reference metadata (set by references())
 * @template AutoIncrement - Whether this column is auto-incrementing
 */
export class ColumnBuilder<
  T = unknown,
  TN extends string = string,
  CN extends string = string,
  Ref extends DeferredRefMeta = never,
  AutoIncrement extends boolean = false,
> {
  declare readonly __type: T;
  declare readonly __tableName: TN;
  declare readonly __columnName: CN;
  declare readonly __ref: Ref;
  declare readonly __autoIncrement: AutoIncrement;
  private _type: ColumnDataType;
  private _primaryKey = false;
  private _autoIncrement = false;
  private _notNull = false;
  private _unique = false;
  private _defaultValue: unknown = undefined;
  private _length?: number;
  private _precision?: number;
  private _scale?: number;
  private _columnAlias?: string;
  private _references?: {
    resolve: () => { table: string; column: string };
    onDelete?: ReferenceAction;
    onUpdate?: ReferenceAction;
    relationName?: string;
  };

  constructor(type: ColumnDataType, length?: number, precision?: number, scale?: number) {
    this._type = type;
    this._length = length;
    this._precision = precision;
    this._scale = scale;
  }

  /**
   * Set a custom database column name different from the property key
   * @param {string} alias - The column name to use in the database
   * @returns {ColumnBuilder<T, TN, CN, Ref, AutoIncrement>} The column builder for chaining
   * @example
   * // In code: guildId, In database: guild_id
   * guildId: varchar(255).name("guild_id")
   */
  name(alias: string): ColumnBuilder<T, TN, CN, Ref, AutoIncrement> {
    this._columnAlias = alias;
    return this;
  }

  /**
   * Override the TypeScript type for this column with a custom type literal
   * @template U - The custom type to use
   * @returns {ColumnBuilder<U, TN, CN, Ref, AutoIncrement>} The column builder with the new type
   * @example
   * // Limits autocomplete to specific values
   * locale: varchar(25).type<"en_US" | "es_ES">()
   */
  type<U>(): ColumnBuilder<U, TN, CN, Ref, AutoIncrement> {
    return this as unknown as ColumnBuilder<U, TN, CN, Ref, AutoIncrement>;
  }

  /**
   * Mark this column as a primary key
   * @returns {ColumnBuilder<T, TN, CN, Ref, AutoIncrement>} The column builder for chaining
   */
  primaryKey(): ColumnBuilder<T, TN, CN, Ref, AutoIncrement> {
    this._primaryKey = true;
    return this;
  }

  /**
   * Mark this column as auto-incrementing
   * @returns {ColumnBuilder<T, TN, CN, Ref, true>} The column builder marked as auto-incrementing
   */
  autoIncrement(): ColumnBuilder<T, TN, CN, Ref, true> {
    this._autoIncrement = true;
    return this as unknown as ColumnBuilder<T, TN, CN, Ref, true>;
  }

  /**
   * Mark this column as NOT NULL
   * @returns {ColumnBuilder<NonNullable<T>, TN, CN, Ref, AutoIncrement>} The column builder for chaining
   */
  notNull(): ColumnBuilder<NonNullable<T>, TN, CN, Ref, AutoIncrement> {
    this._notNull = true;
    return this as unknown as ColumnBuilder<NonNullable<T>, TN, CN, Ref, AutoIncrement>;
  }

  /**
   * Mark this column as nullable
   * @returns {ColumnBuilder<T | null, TN, CN, Ref, AutoIncrement>} The column builder for chaining
   */
  nullable(): ColumnBuilder<T | null, TN, CN, Ref, AutoIncrement> {
    this._notNull = false;
    return this as unknown as ColumnBuilder<T | null, TN, CN, Ref, AutoIncrement>;
  }

  /**
   * Mark this column as nullable (alias for {@link nullable})
   * @returns {ColumnBuilder<T | null, TN, CN, Ref, AutoIncrement>} The column builder for chaining
   */
  null(): ColumnBuilder<T | null, TN, CN, Ref, AutoIncrement> {
    return this.nullable();
  }

  /**
   * Set a default value for this column
   * @param {T} value - The default value
   * @returns {ColumnBuilder<T, TN, CN, Ref, AutoIncrement>} The column builder for chaining
   */
  default(value: T): ColumnBuilder<T, TN, CN, Ref, AutoIncrement> {
    this._defaultValue = value;
    return this;
  }

  /**
   * Mark this column as having a unique constraint
   * @returns {ColumnBuilder<T, TN, CN, Ref, AutoIncrement>} The column builder for chaining
   */
  unique(): ColumnBuilder<T, TN, CN, Ref, AutoIncrement> {
    this._unique = true;
    return this;
  }

  /**
   * Add a foreign key reference to another table's column
   * @param {(() => ColumnBuilder<any>) | ColumnBuilder<any>} ref - A column reference or a function returning one
   * @param {object} [options] - Reference options
   * @param {ReferenceAction} [options.onDelete] - Action on delete
   * @param {ReferenceAction} [options.onUpdate] - Action on update
   * @param {string} [options.relationName] - Name for the relation
   * @returns {ColumnBuilder<T, TN, CN, DeferredRefMeta<CN, R["__tableName"], R["__columnName"], O extends { relationName: infer N extends string } ? N : undefined>, AutoIncrement>} The column builder with resolved reference metadata
   */
  references<
    R extends ColumnBuilder<any, string, string, any, boolean>,
    O extends {
      onDelete?: ReferenceAction;
      onUpdate?: ReferenceAction;
      relationName?: string;
    } = never,
  >(
    ref: (() => R) | R,
    options?: O,
  ): ColumnBuilder<
    T,
    TN,
    CN,
    DeferredRefMeta<
      CN,
      R["__tableName"],
      R["__columnName"],
      O extends { relationName: infer N extends string } ? N : undefined
    >,
    AutoIncrement
  > {
    this._references = {
      resolve: () => {
        const col = typeof ref === "function" ? ref() : ref;
        return {
          table: (col as any).__tableName ?? "",
          column: (col as any).__columnName ?? "",
        };
      },
      onDelete: options?.onDelete,
      onUpdate: options?.onUpdate,
      relationName: options?.relationName,
    };
    return this as any;
  }

  /**
   * Build the column metadata from the builder configuration
   * @param {string} name - The column name
   * @returns {ColumnMetadata} The built column metadata
   */
  __build(name: string): ColumnMetadata {
    return {
      name: this._columnAlias ?? name,
      type: this._type,
      primaryKey: this._primaryKey,
      autoIncrement: this._autoIncrement,
      notNull: this._notNull || this._primaryKey,
      unique: this._unique || this._primaryKey,
      defaultValue: this._defaultValue,
      length: this._length,
      precision: this._precision,
      scale: this._scale,
      columnAlias: this._columnAlias,
    };
  }

  /**
   * Get deferred reference data if this column has a foreign key reference
   * @returns {object | null} The deferred reference data or null
   */
  __getDeferredRef(): {
    resolve: () => { table: string; column: string };
    onDelete?: ReferenceAction;
    onUpdate?: ReferenceAction;
    relationName?: string;
  } | null {
    return this._references ?? null;
  }
}
