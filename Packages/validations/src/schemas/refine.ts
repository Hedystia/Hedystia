import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, Schema } from "../core/types";

export type RefineCheck<O> = (value: O) => boolean | string | StandardSchemaV1.Issue[];

export class RefineSchema<I, O> extends BaseSchema<I, O> {
  private readonly innerSchema: Schema<I, O>;
  private readonly check: RefineCheck<O>;
  private readonly defaultMessage: string;

  constructor(innerSchema: Schema<I, O>, check: RefineCheck<O>, message = "Refinement failed") {
    super();
    this.innerSchema = innerSchema;
    this.check = check;
    this.defaultMessage = message;
    this.jsonSchema = { ...innerSchema.jsonSchema };
  }

  get ["~standard"](): CombinedStandardProps<I, O> {
    return {
      version: 1,
      vendor: "h-schema",
      jsonSchema: {
        input: () => this.jsonSchema,
        output: () => this.jsonSchema,
      },
      validate: (value: unknown) => {
        const r = this.innerSchema["~standard"].validate(value) as StandardSchemaV1.Result<O>;
        if ("issues" in r) {
          return r;
        }
        const out = this.check(r.value);
        if (out === true) {
          return { value: r.value };
        }
        if (out === false) {
          return { issues: [{ message: this.defaultMessage }] };
        }
        if (typeof out === "string") {
          return { issues: [{ message: out }] };
        }
        if (Array.isArray(out)) {
          return { issues: out };
        }
        return { value: r.value };
      },
      types: {
        input: {} as I,
        output: {} as O,
      },
    };
  }
}
