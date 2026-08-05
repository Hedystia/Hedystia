import type { StandardSchemaV1 } from "@standard-schema/spec";
import { BaseSchema, OptionalSchema, validatePrimitive } from "../core/base";
import type { CombinedStandardProps, SchemaDefinition, SchemaPrimitive } from "../core/types";

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

export class ObjectSchemaType<T extends Record<string, unknown>> extends BaseSchema<unknown, T> {
  readonly definition: SchemaDefinition;
  private _strict = false;
  private _passthrough = false;

  constructor(definition: SchemaDefinition) {
    super();
    this.definition = definition;
    this._rebuildJsonSchema();
  }

  private _rebuildJsonSchema(): void {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const key in this.definition) {
      const schemaItem = this.definition[key];
      const isOptional = schemaItem instanceof OptionalSchema;

      const hasDefault = schemaItem instanceof BaseSchema && "_isDefault" in schemaItem;
      if (!isOptional && !hasDefault) {
        required.push(key);
      }

      if (typeof schemaItem === "string") {
        properties[key] = { type: schemaItem };
      } else if (schemaItem instanceof BaseSchema) {
        properties[key] = schemaItem.jsonSchema;
      } else if (typeof schemaItem === "object" && schemaItem !== null) {
        properties[key] = new ObjectSchemaType(schemaItem as SchemaDefinition).jsonSchema;
      }
    }

    this.jsonSchema = {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: this._strict ? false : this._passthrough ? true : undefined,
    };
  }

  /**
   * Disallow unknown keys; produce issues if present.
   * @returns {ObjectSchemaType<T>} New strict object schema.
   */
  strict(): ObjectSchemaType<T> {
    const schema = new ObjectSchemaType<T>(this.definition);
    schema._strict = true;
    schema._rebuildJsonSchema();
    return schema;
  }

  /**
   * Pass through unknown keys without validating them.
   * @returns {ObjectSchemaType<T & Record<string, unknown>>} Passthrough schema.
   */
  passthrough(): ObjectSchemaType<T & Record<string, unknown>> {
    const schema = new ObjectSchemaType<T & Record<string, unknown>>(this.definition);
    schema._passthrough = true;
    schema._rebuildJsonSchema();
    return schema;
  }

  /**
   * Extend with additional fields.
   * @param {SchemaDefinition} extension Extra fields to add.
   * @returns {ObjectSchemaType<any>} New extended object schema.
   */
  extend(extension: SchemaDefinition): ObjectSchemaType<any> {
    return new ObjectSchemaType<any>({ ...this.definition, ...extension });
  }

  /**
   * Merge with another object schema.
   * @param {ObjectSchemaType<any>} other Schema to merge in.
   * @returns {ObjectSchemaType<any>} Merged object schema.
   */
  merge(other: ObjectSchemaType<any>): ObjectSchemaType<any> {
    return new ObjectSchemaType<any>({ ...this.definition, ...other.definition });
  }

  /**
   * Pick selected fields.
   * @param {readonly (keyof T & string)[]} keys Field names to keep.
   * @returns {ObjectSchemaType<any>} Picked object schema.
   */
  pick(keys: readonly (keyof T & string)[]): ObjectSchemaType<any> {
    const next: SchemaDefinition = {};
    for (const k of keys) {
      if (k in this.definition) {
        next[k] = this.definition[k]!;
      }
    }
    return new ObjectSchemaType<any>(next);
  }

  /**
   * Omit selected fields.
   * @param {readonly (keyof T & string)[]} keys Field names to remove.
   * @returns {ObjectSchemaType<any>} Object schema without those fields.
   */
  omit(keys: readonly (keyof T & string)[]): ObjectSchemaType<any> {
    const next: SchemaDefinition = { ...this.definition };
    for (const k of keys) {
      delete next[k];
    }
    return new ObjectSchemaType<any>(next);
  }

  /**
   * Make every field optional.
   * @returns {ObjectSchemaType<Partial<T>>} Partial object schema.
   */
  partial(): ObjectSchemaType<Partial<T>> {
    const next: SchemaDefinition = {};
    for (const key in this.definition) {
      const item = this.definition[key];
      if (item instanceof BaseSchema) {
        next[key] = item instanceof OptionalSchema ? item : item.optional();
      } else {
        next[key] = item!;
      }
    }
    return new ObjectSchemaType<Partial<T>>(next);
  }

  get ["~standard"](): CombinedStandardProps<unknown, T> {
    return {
      version: 1,
      vendor: "h-schema",
      jsonSchema: {
        input: () => this.jsonSchema,
        output: () => this.jsonSchema,
      },
      validate: (value: unknown): StandardSchemaV1.Result<T> => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          return {
            issues: [
              {
                message:
                  "Expected object, received " +
                  (value === null ? "null" : Array.isArray(value) ? "array" : typeof value),
              },
            ],
          };
        }

        const obj = value as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        const issues: StandardSchemaV1.Issue[] = [];

        const pending: Promise<void>[] = [];

        const appendResult = (key: string, validated: StandardSchemaV1.Result<unknown>): void => {
          if ("issues" in validated) {
            issues.push(
              ...(validated.issues ?? []).map((issue) => ({
                ...issue,
                path: issue.path ? [key, ...issue.path] : [key],
              })),
            );
          } else {
            result[key] = validated.value;
          }
        };

        for (const key in this.definition) {
          const schemaItem = this.definition[key];
          const isOptional = schemaItem instanceof OptionalSchema;
          const hasDefault = schemaItem instanceof BaseSchema && "_isDefault" in schemaItem;

          if (!(key in obj) && !isOptional && !hasDefault) {
            issues.push({ message: `Missing required property: ${key}`, path: [key] });
            continue;
          }

          if (!(key in obj) && !hasDefault) {
            continue;
          }

          const input = key in obj ? obj[key] : undefined;
          if (typeof schemaItem === "string") {
            const sp = schemaItem as SchemaPrimitive;
            if (!validatePrimitive(sp, input)) {
              issues.push({
                message: `Invalid type for property ${key}: expected ${sp}`,
                path: [key],
              });
            } else {
              result[key] = input;
            }
          } else if (schemaItem instanceof BaseSchema) {
            const validated = schemaItem["~standard"].validate(input) as
              | StandardSchemaV1.Result<unknown>
              | Promise<StandardSchemaV1.Result<unknown>>;
            if (isPromiseLike(validated)) {
              pending.push(validated.then((resolved) => appendResult(key, resolved)));
            } else {
              appendResult(key, validated);
            }
          } else if (typeof schemaItem === "object" && schemaItem !== null) {
            const nested = new ObjectSchemaType(schemaItem as SchemaDefinition);
            const validated = nested["~standard"].validate(input);
            if (isPromiseLike(validated)) {
              pending.push(validated.then((resolved) => appendResult(key, resolved)));
            } else {
              appendResult(key, validated);
            }
          }
        }

        const finish = () => {
          if (this._strict) {
            for (const key of Object.keys(obj)) {
              if (!(key in this.definition)) {
                issues.push({ message: `Unknown key: ${key}`, path: [key] });
              }
            }
          } else if (this._passthrough) {
            for (const key of Object.keys(obj)) {
              if (!(key in this.definition)) {
                result[key] = obj[key];
              }
            }
          }

          if (issues.length > 0) {
            return { issues };
          }

          return { value: result as T };
        };

        return pending.length > 0 ? Promise.all(pending).then(finish) : finish();
      },
      types: {
        input: {} as unknown,
        output: {} as T,
      },
    };
  }
}
