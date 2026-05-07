import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, Schema } from "../core/types";

function deepMerge(a: any, b: any): any {
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    Array.isArray(a) ||
    Array.isArray(b)
  ) {
    return b;
  }
  const out: Record<string, any> = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = k in a ? deepMerge(a[k], b[k]) : b[k];
  }
  return out;
}

export class IntersectionSchema<I, O> extends BaseSchema<I, O> {
  private readonly schemas: Schema<I, any>[];

  constructor(...schemas: Schema<I, any>[]) {
    super();
    this.schemas = schemas;
    this.jsonSchema = { allOf: schemas.map((s) => s.jsonSchema) };
  }

  readonly "~standard": CombinedStandardProps<I, O> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      let merged: any;
      const issues: StandardSchemaV1.Issue[] = [];
      for (const s of this.schemas) {
        const r = s["~standard"].validate(value) as StandardSchemaV1.Result<any>;
        if ("issues" in r) {
          if (r.issues) {
            issues.push(...r.issues);
          }
        } else {
          merged = merged === undefined ? r.value : deepMerge(merged, r.value);
        }
      }
      if (issues.length > 0) {
        return { issues };
      }
      return { value: merged as O };
    },
    types: {
      input: {} as I,
      output: {} as O,
    },
  };
}
