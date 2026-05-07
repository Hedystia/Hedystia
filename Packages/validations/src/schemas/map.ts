import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, Schema } from "../core/types";

export class MapSchema<K, V> extends BaseSchema<unknown, Map<K, V>> {
  private readonly keySchema: Schema<unknown, K>;
  private readonly valueSchema: Schema<unknown, V>;

  constructor(keySchema: Schema<unknown, K>, valueSchema: Schema<unknown, V>) {
    super();
    this.keySchema = keySchema;
    this.valueSchema = valueSchema;
    this.jsonSchema = {
      type: "object",
      format: "map",
      additionalProperties: valueSchema.jsonSchema,
    };
  }

  readonly "~standard": CombinedStandardProps<unknown, Map<K, V>> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (!(value instanceof Map)) {
        return { issues: [{ message: "Expected Map" }] };
      }
      const issues: StandardSchemaV1.Issue[] = [];
      const out = new Map<K, V>();
      let i = 0;
      for (const [k, v] of value.entries()) {
        const kr = this.keySchema["~standard"].validate(k) as StandardSchemaV1.Result<K>;
        const vr = this.valueSchema["~standard"].validate(v) as StandardSchemaV1.Result<V>;
        if ("issues" in kr) {
          if (kr.issues) {
            issues.push(
              ...kr.issues.map((iss) => ({
                ...iss,
                path: iss.path ? [i, "key", ...iss.path] : [i, "key"],
              })),
            );
          }
        }
        if ("issues" in vr) {
          if (vr.issues) {
            issues.push(
              ...vr.issues.map((iss) => ({
                ...iss,
                path: iss.path ? [i, "value", ...iss.path] : [i, "value"],
              })),
            );
          }
        }
        if (!("issues" in kr) && !("issues" in vr)) {
          out.set(kr.value, vr.value);
        }
        i++;
      }
      if (issues.length > 0) {
        return { issues };
      }
      return { value: out };
    },
    types: {
      input: {} as unknown,
      output: new Map() as Map<K, V>,
    },
  };
}
