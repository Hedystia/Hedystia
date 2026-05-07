import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, Schema } from "../core/types";

export class DefaultSchema<I, O> extends BaseSchema<I, O> {
  private readonly innerSchema: Schema<I, O>;
  private readonly defaultValue: O | (() => O);

  constructor(innerSchema: Schema<I, O>, defaultValue: O | (() => O)) {
    super();
    this.innerSchema = innerSchema;
    this.defaultValue = defaultValue;
    this.jsonSchema = {
      ...innerSchema.jsonSchema,
      default: typeof defaultValue === "function" ? undefined : defaultValue,
    };
  }

  private getDefault(): O {
    return typeof this.defaultValue === "function"
      ? (this.defaultValue as () => O)()
      : this.defaultValue;
  }

  readonly "~standard": CombinedStandardProps<I, O> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (value === undefined || value === null) {
        return { value: this.getDefault() };
      }
      return this.innerSchema["~standard"].validate(value) as StandardSchemaV1.Result<O>;
    },
    types: {
      input: {} as I,
      output: {} as O,
    },
  };
}
