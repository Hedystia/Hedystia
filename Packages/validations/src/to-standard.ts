import type { StandardJSONSchemaV1 } from "@standard-schema/spec";
import { BaseSchema, OptionalSchema } from "./core/base";
import type { AnySchema, Schema, SchemaDefinition } from "./core/types";
import { BooleanSchemaType } from "./schemas/boolean";
import { NumberSchemaType } from "./schemas/number";
import { ObjectSchemaType } from "./schemas/object";
import { StringSchemaType } from "./schemas/string";

/**
 * Normalize an `AnySchema` (primitive name, BaseSchema, or schema definition)
 * to a Standard-Schema-compatible object.
 *
 * @param {AnySchema} schema Schema or schema-like value.
 * @returns {Schema<unknown, T>} Standard-schema-shaped object.
 */
export function toStandard<T>(schema: AnySchema): Schema<unknown, T> {
  let standardSchema: Schema<unknown, T>;

  if (schema instanceof BaseSchema) {
    standardSchema = schema as Schema<unknown, T>;
  } else if (typeof schema === "string") {
    if (schema === "string") {
      standardSchema = new StringSchemaType() as unknown as Schema<unknown, T>;
    } else if (schema === "number") {
      standardSchema = new NumberSchemaType() as unknown as Schema<unknown, T>;
    } else if (schema === "boolean") {
      standardSchema = new BooleanSchemaType() as unknown as Schema<unknown, T>;
    } else {
      throw new Error("Invalid schema type provided to toStandard");
    }
  } else if (typeof schema === "object" && schema !== null && !Array.isArray(schema)) {
    standardSchema = new ObjectSchemaType<any>(schema as SchemaDefinition) as Schema<unknown, T>;
  } else {
    throw new Error("Invalid schema type provided to toStandard");
  }

  return {
    ...standardSchema,
    inferred: null as unknown as T,
    "~standard": standardSchema["~standard"],
    jsonSchema: standardSchema.jsonSchema,
    schema: standardSchema,
    optional: () => new OptionalSchema<unknown, T>(standardSchema),
    enum: standardSchema.enum.bind(standardSchema),
    array: standardSchema.array.bind(standardSchema),
    instanceOf: standardSchema.instanceOf.bind(standardSchema),
    parse: standardSchema.parse.bind(standardSchema),
    safeParse: standardSchema.safeParse.bind(standardSchema),
  };
}

/**
 * Convert any validation schema to a JSON Schema document.
 *
 * @param {AnySchema} schema Schema to convert.
 * @param {object} [options] Conversion options.
 * @param {string} [options.target="draft-2020-12"] Target JSON Schema draft.
 * @returns {Record<string, unknown>} JSON Schema object.
 */
export function getJsonSchema(
  schema: AnySchema,
  options: { target?: string } = {},
): Record<string, unknown> {
  const std = toStandard(schema);
  return std["~standard"].jsonSchema.output({
    target: (options.target ?? "draft-2020-12") as StandardJSONSchemaV1.Target,
  });
}
