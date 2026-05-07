import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, Schema } from "../core/types";

export class TupleSchema<I, T extends any[]> extends BaseSchema<I, T> {
  private readonly items: Schema<I, any>[];
  private readonly rest?: Schema<I, any>;

  constructor(items: Schema<I, any>[], rest?: Schema<I, any>) {
    super();
    this.items = items;
    this.rest = rest;
    this.jsonSchema = {
      type: "array",
      prefixItems: items.map((s) => s.jsonSchema),
      items: rest ? rest.jsonSchema : false,
      minItems: items.length,
      maxItems: rest ? undefined : items.length,
    };
  }

  /**
   * Allow additional trailing items of a given schema.
   * @param {Schema<I, any>} restSchema Schema for trailing items.
   * @returns {TupleSchema<I, T>} Tuple with rest items allowed.
   */
  rest_(restSchema: Schema<I, any>): TupleSchema<I, T> {
    return new TupleSchema<I, T>(this.items, restSchema);
  }

  readonly "~standard": CombinedStandardProps<I, T> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (!Array.isArray(value)) {
        return { issues: [{ message: `Expected tuple/array, received ${typeof value}` }] };
      }
      if (!this.rest && value.length !== this.items.length) {
        return {
          issues: [
            { message: `Expected tuple of length ${this.items.length}, got ${value.length}` },
          ],
        };
      }
      if (value.length < this.items.length) {
        return {
          issues: [{ message: `Tuple too short: expected at least ${this.items.length}` }],
        };
      }

      const out: any[] = [];
      const issues: StandardSchemaV1.Issue[] = [];

      for (let i = 0; i < value.length; i++) {
        const schema = i < this.items.length ? this.items[i]! : this.rest!;
        const r = schema["~standard"].validate(value[i]) as StandardSchemaV1.Result<any>;
        if ("issues" in r) {
          if (r.issues) {
            issues.push(
              ...r.issues.map((iss) => ({
                ...iss,
                path: iss.path ? [i, ...iss.path] : [i],
              })),
            );
          }
        } else {
          out.push(r.value);
        }
      }

      if (issues.length > 0) {
        return { issues };
      }
      return { value: out as T };
    },
    types: {
      input: {} as I,
      output: {} as T,
    },
  };
}
