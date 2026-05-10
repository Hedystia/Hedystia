import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, Schema } from "../core/types";

export class LazySchema<I, O> extends BaseSchema<I, O> {
  private readonly getter: () => Schema<I, O>;
  private cached?: Schema<I, O>;

  constructor(getter: () => Schema<I, O>) {
    super();
    this.getter = getter;
    this.jsonSchema = { $ref: "#/definitions/lazy" };
  }

  private resolve(): Schema<I, O> {
    if (!this.cached) {
      this.cached = this.getter();
    }
    return this.cached;
  }

  get ["~standard"](): CombinedStandardProps<I, O> {
    return {
      version: 1,
      vendor: "h-schema",
      jsonSchema: {
        input: () => this.resolve().jsonSchema ?? {},
        output: () => this.resolve().jsonSchema ?? {},
      },
      validate: (value: unknown) =>
        this.resolve()["~standard"].validate(value) as StandardSchemaV1.Result<O>,
      types: {
        input: {} as I,
        output: {} as O,
      },
    };
  }
}
