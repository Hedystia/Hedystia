import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema } from "../core/base";
import type { CombinedStandardProps } from "../core/types";
import type { ObjectSchemaType } from "./object";

export class DiscriminatedUnionSchema<
  D extends string,
  T extends Record<string, unknown>,
> extends BaseSchema<unknown, T> {
  readonly discriminator: D;
  readonly options: ObjectSchemaType<any>[];
  private readonly map: Map<unknown, ObjectSchemaType<any>>;

  constructor(discriminator: D, options: ObjectSchemaType<any>[]) {
    super();
    this.discriminator = discriminator;
    this.options = options;
    this.map = new Map();

    for (const opt of options) {
      const def = opt.definition[discriminator];
      if (def && typeof def === "object" && "jsonSchema" in def) {
        const j = (def as any).jsonSchema;
        if (j && "const" in j) {
          this.map.set(j.const, opt);
        }
      }
    }

    this.jsonSchema = {
      oneOf: options.map((o) => o.jsonSchema),
      discriminator: { propertyName: discriminator },
    };
  }

  get ["~standard"](): CombinedStandardProps<unknown, T> {
    return {
      version: 1,
      vendor: "h-schema",
      jsonSchema: {
        input: () => this.jsonSchema,
        output: () => this.jsonSchema,
      },
      validate: (value: unknown) => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          return { issues: [{ message: `Expected object, received ${typeof value}` }] };
        }
        const obj = value as Record<string, unknown>;
        const tag = obj[this.discriminator];
        const opt = this.map.get(tag);
        if (!opt) {
          return {
            issues: [
              {
                message: `Invalid discriminator value for ${this.discriminator}: ${String(tag)}`,
                path: [this.discriminator],
              },
            ],
          };
        }
        return opt["~standard"].validate(value) as StandardSchemaV1.Result<T>;
      },
      types: {
        input: {} as unknown,
        output: {} as T,
      },
    };
  }
}
