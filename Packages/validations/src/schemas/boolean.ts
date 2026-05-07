import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, SchemaPrimitive } from "../core/types";

export class BooleanSchemaType extends BaseSchema<unknown, boolean> {
  readonly type: SchemaPrimitive = "boolean";

  constructor() {
    super();
    this.jsonSchema = { type: "boolean" };
  }

  primitive(): SchemaPrimitive {
    return this.type;
  }

  readonly "~standard": CombinedStandardProps<unknown, boolean> = {
    version: 1,
    vendor: "h-schema",
    jsonSchema: {
      input: () => this.jsonSchema,
      output: () => this.jsonSchema,
    },
    validate: (value: unknown) => {
      if (this._coerce && typeof value !== "boolean") {
        if (value === "true" || value === 1 || value === "1") {
          value = true;
        } else if (value === "false" || value === 0 || value === "0") {
          value = false;
        }
      }
      if (typeof value !== "boolean") {
        return { issues: [{ message: `Expected boolean, received ${typeof value}` }] };
      }
      return { value };
    },
    types: {
      input: {} as unknown,
      output: {} as boolean,
    },
  };
}
