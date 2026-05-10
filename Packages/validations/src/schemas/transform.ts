import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, Schema } from "../core/types";

export class TransformSchema<I, In, Out> extends BaseSchema<I, Out> {
  private readonly innerSchema: Schema<I, In>;
  private readonly fn: (value: In) => Out;

  constructor(innerSchema: Schema<I, In>, fn: (value: In) => Out) {
    super();
    this.innerSchema = innerSchema;
    this.fn = fn;
    this.jsonSchema = { ...innerSchema.jsonSchema };
  }

  get ["~standard"](): CombinedStandardProps<I, Out> {
    return {
      version: 1,
      vendor: "h-schema",
      jsonSchema: {
        input: () => this.jsonSchema,
        output: () => this.jsonSchema,
      },
      validate: (value: unknown) => {
        const r = this.innerSchema["~standard"].validate(value) as StandardSchemaV1.Result<In>;
        if ("issues" in r) {
          return r as StandardSchemaV1.Result<Out>;
        }
        try {
          return { value: this.fn(r.value) };
        } catch (e) {
          return {
            issues: [{ message: e instanceof Error ? e.message : "Transform failed" }],
          };
        }
      },
      types: {
        input: {} as I,
        output: {} as Out,
      },
    };
  }
}

export class PipeSchema<I, A, B> extends BaseSchema<I, B> {
  private readonly first: Schema<I, A>;
  private readonly second: Schema<A, B>;

  constructor(first: Schema<I, A>, second: Schema<A, B>) {
    super();
    this.first = first;
    this.second = second;
    this.jsonSchema = { ...first.jsonSchema };
  }

  get ["~standard"](): CombinedStandardProps<I, B> {
    return {
      version: 1,
      vendor: "h-schema",
      jsonSchema: {
        input: () => this.first.jsonSchema,
        output: () => this.second.jsonSchema ?? this.first.jsonSchema,
      },
      validate: (value: unknown) => {
        const r1 = this.first["~standard"].validate(value) as StandardSchemaV1.Result<A>;
        if ("issues" in r1) {
          return r1 as StandardSchemaV1.Result<B>;
        }
        return this.second["~standard"].validate(r1.value) as StandardSchemaV1.Result<B>;
      },
      types: {
        input: {} as I,
        output: {} as B,
      },
    };
  }
}
