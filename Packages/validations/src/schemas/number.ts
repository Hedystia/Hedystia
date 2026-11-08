import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, SchemaPrimitive } from "../core/types";

export class NumberSchemaType extends BaseSchema<unknown, number> {
  readonly type: SchemaPrimitive = "number";
  private _min?: number;
  private _max?: number;
  private _int = false;
  private _positive = false;
  private _negative = false;
  private _nonnegative = false;
  private _nonpositive = false;
  private _multipleOf?: number;
  private _finite = false;
  private _safe = false;
  private _port = false;

  constructor() {
    super();
    this.jsonSchema = { type: "number" };
  }

  primitive(): SchemaPrimitive {
    return this.type;
  }

  /**
   * Require minimum numeric value.
   * @param {number} n Minimum value.
   * @returns {NumberSchemaType} New constrained schema.
   */
  min(n: number): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._min = n;
    schema.jsonSchema = { ...this.jsonSchema, minimum: n };
    return schema;
  }

  /**
   * Require maximum numeric value.
   * @param {number} n Maximum value.
   * @returns {NumberSchemaType} New constrained schema.
   */
  max(n: number): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._max = n;
    schema.jsonSchema = { ...this.jsonSchema, maximum: n };
    return schema;
  }

  /**
   * Require integer values only.
   * @returns {NumberSchemaType} New constrained schema.
   */
  int(): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._int = true;
    schema.jsonSchema = { ...this.jsonSchema, type: "integer" };
    return schema;
  }

  /**
   * Require strictly positive values.
   * @returns {NumberSchemaType} New constrained schema.
   */
  positive(): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._positive = true;
    schema.jsonSchema = { ...this.jsonSchema, exclusiveMinimum: 0 };
    return schema;
  }

  /**
   * Require strictly negative values.
   * @returns {NumberSchemaType} New constrained schema.
   */
  negative(): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._negative = true;
    schema.jsonSchema = { ...this.jsonSchema, exclusiveMaximum: 0 };
    return schema;
  }

  /**
   * Require values greater than or equal to zero.
   * @returns {NumberSchemaType} New constrained schema.
   */
  nonnegative(): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._nonnegative = true;
    schema.jsonSchema = { ...this.jsonSchema, minimum: 0 };
    return schema;
  }

  /**
   * Require values less than or equal to zero.
   * @returns {NumberSchemaType} New constrained schema.
   */
  nonpositive(): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._nonpositive = true;
    schema.jsonSchema = { ...this.jsonSchema, maximum: 0 };
    return schema;
  }

  /**
   * Require values divisible by a given factor.
   * @param {number} factor Divisor.
   * @returns {NumberSchemaType} New constrained schema.
   */
  multipleOf(factor: number): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._multipleOf = factor;
    schema.jsonSchema = { ...this.jsonSchema, multipleOf: factor };
    return schema;
  }

  /**
   * Require finite values.
   * @returns {NumberSchemaType} New constrained schema.
   */
  finite(): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._finite = true;
    return schema;
  }

  /**
   * Require safe integer values.
   * @returns {NumberSchemaType} New constrained schema.
   */
  safe(): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._safe = true;
    schema.jsonSchema = { ...this.jsonSchema, type: "integer" };
    return schema;
  }

  /**
   * Require a valid TCP/UDP port number.
   * @returns {NumberSchemaType} New constrained schema.
   */
  port(): NumberSchemaType {
    const schema = new NumberSchemaType();
    Object.assign(schema, this);
    schema._port = true;
    schema.jsonSchema = { ...this.jsonSchema, type: "integer", minimum: 1, maximum: 65535 };
    return schema;
  }

  get ["~standard"](): CombinedStandardProps<unknown, number> {
    return {
      version: 1,
      vendor: "h-schema",
      jsonSchema: {
        input: () => this.jsonSchema,
        output: () => this.jsonSchema,
      },
      validate: (value: unknown) => {
        if (this._coerce && typeof value !== "number") {
          const coerced = Number(value);
          if (!Number.isNaN(coerced)) {
            value = coerced;
          }
        }
        if (typeof value !== "number" || Number.isNaN(value)) {
          return { issues: [{ message: `Expected number, received ${typeof value}` }] };
        }
        if (this._int && !Number.isInteger(value)) {
          return { issues: [{ message: "Expected integer" }] };
        }
        if (this._min !== undefined && value < this._min) {
          return { issues: [{ message: `Number less than ${this._min}` }] };
        }
        if (this._max !== undefined && value > this._max) {
          return { issues: [{ message: `Number greater than ${this._max}` }] };
        }
        if (this._positive && value <= 0) {
          return { issues: [{ message: "Number must be positive" }] };
        }
        if (this._negative && value >= 0) {
          return { issues: [{ message: "Number must be negative" }] };
        }
        if (this._nonnegative && value < 0) {
          return { issues: [{ message: "Number must be greater than or equal to 0" }] };
        }
        if (this._nonpositive && value > 0) {
          return { issues: [{ message: "Number must be less than or equal to 0" }] };
        }
        if (this._multipleOf !== undefined) {
          const quotient = value / this._multipleOf;
          const nearest = Math.round(quotient);
          if (Math.abs(quotient - nearest) > 1e-9) {
            return { issues: [{ message: `Number must be a multiple of ${this._multipleOf}` }] };
          }
        }
        if (this._finite && !Number.isFinite(value)) {
          return { issues: [{ message: "Expected finite number" }] };
        }
        if (this._safe && !Number.isSafeInteger(value)) {
          return { issues: [{ message: "Expected safe integer" }] };
        }
        if (this._port && (!Number.isInteger(value) || value < 1 || value > 65535)) {
          return { issues: [{ message: "Expected port number between 1 and 65535" }] };
        }
        return { value };
      },
      types: {
        input: {} as unknown,
        output: {} as number,
      },
    };
  }
}
