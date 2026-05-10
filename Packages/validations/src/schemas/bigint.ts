import { BaseSchema } from "../core/base";
import type { CombinedStandardProps } from "../core/types";

export class BigIntSchemaType extends BaseSchema<unknown, bigint> {
  private _min?: bigint;
  private _max?: bigint;

  constructor() {
    super();
    this.jsonSchema = { type: "integer", format: "bigint" };
  }

  /**
   * Require minimum bigint value.
   * @param {bigint} n Minimum value.
   * @returns {BigIntSchemaType} New constrained schema.
   */
  min(n: bigint): BigIntSchemaType {
    const schema = new BigIntSchemaType();
    Object.assign(schema, this);
    schema._min = n;
    schema.jsonSchema = { ...this.jsonSchema, minimum: n.toString() };
    return schema;
  }

  /**
   * Require maximum bigint value.
   * @param {bigint} n Maximum value.
   * @returns {BigIntSchemaType} New constrained schema.
   */
  max(n: bigint): BigIntSchemaType {
    const schema = new BigIntSchemaType();
    Object.assign(schema, this);
    schema._max = n;
    schema.jsonSchema = { ...this.jsonSchema, maximum: n.toString() };
    return schema;
  }

  get ["~standard"](): CombinedStandardProps<unknown, bigint> {
    return {
      version: 1,
      vendor: "h-schema",
      jsonSchema: {
        input: () => this.jsonSchema,
        output: () => this.jsonSchema,
      },
      validate: (value: unknown) => {
        if (this._coerce && typeof value !== "bigint") {
          try {
            if (
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
            ) {
              value = BigInt(value);
            }
          } catch {
            // fallthrough
          }
        }
        if (typeof value !== "bigint") {
          return { issues: [{ message: `Expected bigint, received ${typeof value}` }] };
        }
        if (this._min !== undefined && value < this._min) {
          return { issues: [{ message: `BigInt less than ${this._min}` }] };
        }
        if (this._max !== undefined && value > this._max) {
          return { issues: [{ message: `BigInt greater than ${this._max}` }] };
        }
        return { value };
      },
      types: {
        input: {} as unknown,
        output: 0n as bigint,
      },
    };
  }
}
