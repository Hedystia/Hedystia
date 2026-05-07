import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, SchemaPrimitive } from "../core/types";

export class AnySchemaType extends BaseSchema<unknown, any> {
  readonly type: SchemaPrimitive = "any";
  readonly "~standard": CombinedStandardProps<unknown, any> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => ({}),
      output: () => ({}),
    },
    validate: (value: unknown) => ({ value }),
    types: {
      input: {} as unknown,
      output: {} as any,
    },
  };
}

export class UnknownSchemaType extends BaseSchema<unknown, unknown> {
  constructor() {
    super();
    this.jsonSchema = {};
  }

  readonly "~standard": CombinedStandardProps<unknown, unknown> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => ({}),
      output: () => ({}),
    },
    validate: (value: unknown) => ({ value }),
    types: {
      input: {} as unknown,
      output: {} as unknown,
    },
  };
}

export class NeverSchemaType extends BaseSchema<unknown, never> {
  constructor() {
    super();
    this.jsonSchema = { not: {} };
  }

  readonly "~standard": CombinedStandardProps<unknown, never> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: () => ({
      issues: [{ message: "Value is never allowed" }],
    }),
    types: {
      input: {} as unknown,
      output: {} as never,
    },
  };
}
