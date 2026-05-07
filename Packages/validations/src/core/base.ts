import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { CombinedStandardProps, Schema } from "./types";

export abstract class BaseSchema<I, O> implements Schema<I, O> {
  abstract readonly "~standard": CombinedStandardProps<I, O>;
  jsonSchema: any = {};
  get inferred(): O {
    return null as unknown as O;
  }
  schema: Schema<I, O> = this;
  protected _coerce = false;

  /**
   * Enable coercion for the schema.
   * @returns {this} The schema with coercion enabled.
   */
  coerce(): this {
    this._coerce = true;
    return this;
  }

  /**
   * Mark schema as optional (allows undefined / null on input).
   * @returns {OptionalSchema<I, O | undefined>} Optional schema wrapper.
   */
  optional(): OptionalSchema<I, O | undefined> {
    return new OptionalSchema<I, O>(this);
  }

  /**
   * Allow `null` in addition to the existing schema output.
   * @returns {UnionSchema<I, O | null>} Union with null.
   */
  null(): UnionSchema<I, O | null> {
    return new UnionSchema<I, O | null>(this, new NullSchemaType() as any);
  }

  /**
   * Alias for {@link BaseSchema.null}.
   * @returns {UnionSchema<I, O | null>} Union with null.
   */
  nullable(): UnionSchema<I, O | null> {
    return this.null();
  }

  /**
   * Build an enum schema from this schema's literal type.
   * @param {Values} values List of allowed literal values.
   * @returns {UnionSchema<I, Values[number]>} Union of literals.
   */
  enum<V extends O & (string | number | boolean), Values extends readonly [V, ...V[]]>(
    values: Values,
  ): UnionSchema<I, Values[number]> {
    const literalSchemas = values.map((value) => new LiteralSchema<I, V>(value));
    return new UnionSchema<I, Values[number]>(...literalSchemas);
  }

  /**
   * Wrap the schema in an array schema.
   * @returns {ArraySchema<I, O[]>} Array schema.
   */
  array(): ArraySchema<I, O[]> {
    return new ArraySchema<I, O[]>(this);
  }

  /**
   * Restrict to instances of the given constructor.
   * @param {C} constructor Class constructor.
   * @returns {InstanceOfSchema<I, InstanceType<C>>} Instance-of schema.
   */
  instanceOf<C extends new (...args: any[]) => any>(
    constructor: C,
  ): InstanceOfSchema<I, InstanceType<C>> {
    return new InstanceOfSchema<I, InstanceType<C>>(this, constructor);
  }
}

export class OptionalSchema<I, O> extends BaseSchema<I, O | undefined> {
  private readonly innerSchema: Schema<I, O>;

  constructor(schema: Schema<I, O>) {
    super();
    this.innerSchema = schema;
    this.jsonSchema = { ...schema.jsonSchema };
  }

  readonly "~standard": CombinedStandardProps<I, O | undefined> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (value === undefined || value === null) {
        return { value: undefined };
      }
      return this.innerSchema["~standard"].validate(value);
    },
    types: {
      input: {} as I,
      output: {} as O | undefined,
    },
  };
}

export class NullSchemaType extends BaseSchema<unknown, null> {
  readonly type = "null";
  constructor() {
    super();
    this.jsonSchema = { type: "null" };
  }

  readonly "~standard": CombinedStandardProps<unknown, null> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (value !== null) {
        return {
          issues: [
            {
              message: `Expected null, received ${value === undefined ? "undefined" : typeof value}`,
            },
          ],
        };
      }
      return { value: null };
    },
    types: {
      input: {} as unknown,
      output: {} as unknown as null,
    },
  };
}

export class LiteralSchema<I, T extends string | number | boolean> extends BaseSchema<I, T> {
  private readonly value: T;

  constructor(value: T) {
    super();
    this.value = value;
    this.jsonSchema = {
      const: value,
      type: typeof value as "string" | "number" | "boolean",
    };
  }

  readonly "~standard": CombinedStandardProps<I, T> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (value !== this.value) {
        return {
          issues: [{ message: `Expected literal value ${this.value}, received ${value}` }],
        };
      }
      return { value: value as T };
    },
    types: {
      input: {} as I,
      output: {} as T,
    },
  };
}

export class UnionSchema<I, O> extends BaseSchema<I, O> {
  readonly schemas: Schema<I, any>[];
  constructor(...schemas: Schema<I, any>[]) {
    super();
    this.schemas = schemas;
    this.jsonSchema = { anyOf: schemas.map((s) => s.jsonSchema) };
  }

  readonly "~standard": CombinedStandardProps<I, O> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      const issuesAccum: StandardSchemaV1.Issue[] = [];
      for (const schema of this.schemas) {
        const result = schema["~standard"].validate(value) as StandardSchemaV1.Result<any>;
        if (!("issues" in result)) {
          return { value: result.value };
        }
        if (result.issues) {
          issuesAccum.push(...result.issues);
        }
      }
      return { issues: issuesAccum };
    },
    types: {
      input: {} as I,
      output: {} as O,
    },
  };
}

export class ArraySchema<I, O extends any[]> extends BaseSchema<I, O> {
  private readonly innerSchema: Schema<I, O[number]>;
  private _minLength?: number;
  private _maxLength?: number;
  private _nonEmpty = false;

  constructor(schema: Schema<I, O[number]>) {
    super();
    this.innerSchema = schema;
    this.jsonSchema = { type: "array", items: schema.jsonSchema };
  }

  /**
   * Require minimum number of items.
   * @param {number} n Minimum length.
   * @returns {ArraySchema<I, O>} New constrained schema.
   */
  min(n: number): ArraySchema<I, O> {
    const schema = new ArraySchema<I, O>(this.innerSchema);
    Object.assign(schema, this);
    schema._minLength = n;
    schema.jsonSchema = { ...this.jsonSchema, minItems: n };
    return schema;
  }

  /**
   * Require maximum number of items.
   * @param {number} n Maximum length.
   * @returns {ArraySchema<I, O>} New constrained schema.
   */
  max(n: number): ArraySchema<I, O> {
    const schema = new ArraySchema<I, O>(this.innerSchema);
    Object.assign(schema, this);
    schema._maxLength = n;
    schema.jsonSchema = { ...this.jsonSchema, maxItems: n };
    return schema;
  }

  /**
   * Require array to contain at least one item.
   * @returns {ArraySchema<I, O>} New constrained schema.
   */
  nonEmpty(): ArraySchema<I, O> {
    const schema = new ArraySchema<I, O>(this.innerSchema);
    Object.assign(schema, this);
    schema._nonEmpty = true;
    schema._minLength = Math.max(this._minLength ?? 1, 1);
    schema.jsonSchema = { ...this.jsonSchema, minItems: schema._minLength };
    return schema;
  }

  readonly "~standard": CombinedStandardProps<I, O> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (!Array.isArray(value)) {
        return {
          issues: [{ message: `Expected array, received ${typeof value}` }],
        };
      }

      if (this._nonEmpty && value.length === 0) {
        return { issues: [{ message: "Array must be non-empty" }] };
      }
      if (this._minLength !== undefined && value.length < this._minLength) {
        return { issues: [{ message: `Array shorter than ${this._minLength}` }] };
      }
      if (this._maxLength !== undefined && value.length > this._maxLength) {
        return { issues: [{ message: `Array longer than ${this._maxLength}` }] };
      }

      const results = value.map((item, index) => {
        const result = this.innerSchema["~standard"].validate(item) as StandardSchemaV1.Result<
          O[number]
        >;
        if ("issues" in result) {
          return {
            index,
            issues: result.issues?.map((issue) => ({
              ...issue,
              path: issue.path ? [index, ...issue.path] : [index],
            })),
          };
        }
        return { index, value: result.value };
      });

      const errors = results.filter((r) => "issues" in r) as {
        index: number;
        issues: StandardSchemaV1.Issue[];
      }[];

      if (errors.length > 0) {
        return { issues: errors.flatMap((e) => e.issues) };
      }

      return { value: results.map((r) => ("value" in r ? r.value : null)) as O };
    },
    types: {
      input: {} as I,
      output: {} as O,
    },
  };
}

export class InstanceOfSchema<I, O> extends BaseSchema<I, O> {
  private readonly innerSchema: Schema<I, any>;
  private readonly classConstructor: new (
    ...args: any[]
  ) => any;

  constructor(schema: Schema<I, any>, classConstructor: new (...args: any[]) => any) {
    super();
    this.innerSchema = schema;
    this.classConstructor = classConstructor;
    this.jsonSchema = { ...schema.jsonSchema, instanceOf: classConstructor.name };
  }

  readonly "~standard": CombinedStandardProps<I, O> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (!(value instanceof this.classConstructor)) {
        return {
          issues: [{ message: `Expected instance of ${this.classConstructor.name}` }],
        };
      }
      const result = this.innerSchema["~standard"].validate(value);
      return result as StandardSchemaV1.Result<O>;
    },
    types: {
      input: {} as I,
      output: {} as O,
    },
  };
}

export function validatePrimitive(
  schema: "string" | "number" | "boolean" | "any",
  value: unknown,
): boolean {
  if (typeof value === "string" && schema === "string") {
    return true;
  }
  if (typeof value === "number" && schema === "number" && !Number.isNaN(value)) {
    return true;
  }
  if (typeof value === "boolean" && schema === "boolean") {
    return true;
  }
  return false;
}
