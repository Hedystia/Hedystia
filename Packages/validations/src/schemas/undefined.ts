import { BaseSchema } from "../core/base";
import type { CombinedStandardProps } from "../core/types";

export class UndefinedSchemaType extends BaseSchema<unknown, undefined> {
  constructor() {
    super();
    this.jsonSchema = { type: "undefined" };
  }

  readonly "~standard": CombinedStandardProps<unknown, undefined> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (value !== undefined) {
        return { issues: [{ message: `Expected undefined, received ${typeof value}` }] };
      }
      return { value: undefined };
    },
    types: {
      input: {} as unknown,
      output: undefined as undefined,
    },
  };
}

export class VoidSchemaType extends BaseSchema<unknown, void> {
  constructor() {
    super();
    this.jsonSchema = { type: "undefined" };
  }

  readonly "~standard": CombinedStandardProps<unknown, void> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (value !== undefined) {
        return { issues: [{ message: `Expected void/undefined, received ${typeof value}` }] };
      }
      return { value: undefined };
    },
    types: {
      input: {} as unknown,
      output: undefined,
    },
  };
}
