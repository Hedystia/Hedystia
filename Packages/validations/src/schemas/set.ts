import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, Schema } from "../core/types";

export class SetSchema<V> extends BaseSchema<unknown, Set<V>> {
  private readonly valueSchema: Schema<unknown, V>;

  constructor(valueSchema: Schema<unknown, V>) {
    super();
    this.valueSchema = valueSchema;
    this.jsonSchema = {
      type: "array",
      uniqueItems: true,
      items: valueSchema.jsonSchema,
    };
  }

  get ["~standard"](): CombinedStandardProps<unknown, Set<V>> {
    return {
      version: 1,
      vendor: "h-schema",
      jsonSchema: {
        input: () => this.jsonSchema,
        output: () => this.jsonSchema,
      },
      validate: (value: unknown) => {
        if (!(value instanceof Set)) {
          return { issues: [{ message: "Expected Set" }] };
        }
        const issues: StandardSchemaV1.Issue[] = [];
        const out = new Set<V>();
        let i = 0;
        for (const item of value.values()) {
          const r = this.valueSchema["~standard"].validate(item) as StandardSchemaV1.Result<V>;
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
            out.add(r.value);
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
        output: new Set() as Set<V>,
      },
    };
  }
}
