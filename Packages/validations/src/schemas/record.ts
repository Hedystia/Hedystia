import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, Schema } from "../core/types";

export class RecordSchema<K extends string | number, V> extends BaseSchema<unknown, Record<K, V>> {
  private readonly keySchema?: Schema<unknown, K>;
  private readonly valueSchema: Schema<unknown, V>;

  constructor(keySchema: Schema<unknown, K> | undefined, valueSchema: Schema<unknown, V>) {
    super();
    this.keySchema = keySchema;
    this.valueSchema = valueSchema;
    this.jsonSchema = {
      type: "object",
      additionalProperties: valueSchema.jsonSchema,
    };
  }

  readonly "~standard": CombinedStandardProps<unknown, Record<K, V>> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { issues: [{ message: `Expected record, received ${typeof value}` }] };
      }

      const out: Record<string | number, any> = {};
      const issues: StandardSchemaV1.Issue[] = [];
      const obj = value as Record<string, unknown>;

      for (const k of Object.keys(obj)) {
        let key: any = k;
        if (this.keySchema) {
          const kr = this.keySchema["~standard"].validate(k) as StandardSchemaV1.Result<K>;
          if ("issues" in kr) {
            if (kr.issues) {
              issues.push(
                ...kr.issues.map((i) => ({
                  ...i,
                  path: i.path ? [k, ...i.path] : [k],
                })),
              );
            }
            continue;
          }
          key = kr.value;
        }

        const vr = this.valueSchema["~standard"].validate(obj[k]) as StandardSchemaV1.Result<V>;
        if ("issues" in vr) {
          if (vr.issues) {
            issues.push(
              ...vr.issues.map((i) => ({
                ...i,
                path: i.path ? [k, ...i.path] : [k],
              })),
            );
          }
        } else {
          out[key] = vr.value;
        }
      }

      if (issues.length > 0) {
        return { issues };
      }
      return { value: out as Record<K, V> };
    },
    types: {
      input: {} as unknown,
      output: {} as Record<K, V>,
    },
  };
}
