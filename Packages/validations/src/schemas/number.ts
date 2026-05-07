import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, SchemaPrimitive } from "../core/types";

export class NumberSchemaType extends BaseSchema<unknown, number> {
  readonly type: SchemaPrimitive = "number";
  private _min?: number;
  private _max?: number;
  private _int = false;

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

  readonly "~standard": CombinedStandardProps<unknown, number> = {
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
      return { value };
    },
    types: {
      input: {} as unknown,
      output: {} as number,
    },
  };
}
