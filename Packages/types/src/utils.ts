import {
  AnySchemaType,
  ArraySchema,
  BooleanSchemaType,
  InstanceOfSchema,
  LiteralSchema,
  NeverSchemaType,
  NullSchemaType,
  NumberSchemaType,
  ObjectSchemaType,
  OptionalSchema,
  StringSchemaType,
  UndefinedSchemaType,
  UnionSchema,
  UnknownSchemaType,
  VoidSchemaType,
} from "@hedystia/validations";

export function schemaToTypeString(schema: any): string {
  if (!schema) {
    return "any";
  }

  if (schema instanceof StringSchemaType) {
    return "string";
  }
  if (schema instanceof NumberSchemaType) {
    return "number";
  }
  if (schema instanceof BooleanSchemaType) {
    return "boolean";
  }
  if (schema instanceof NullSchemaType) {
    return "null";
  }
  if (schema instanceof AnySchemaType) {
    return "any";
  }
  if (schema instanceof UnknownSchemaType) {
    return "unknown";
  }
  if (schema instanceof UndefinedSchemaType) {
    return "undefined";
  }
  if (schema instanceof VoidSchemaType) {
    return "void";
  }
  if (schema instanceof NeverSchemaType) {
    return "never";
  }

  if (schema instanceof OptionalSchema) {
    const inner = (schema as any).innerSchema;
    return `${schemaToTypeString(inner)} | undefined`;
  }

  if (schema instanceof ArraySchema) {
    const inner = (schema as any).innerSchema;
    const innerType = schemaToTypeString(inner);
    return innerType.includes("|") || innerType.includes("{")
      ? `(${innerType})[]`
      : `${innerType}[]`;
  }

  if (schema instanceof UnionSchema) {
    const schemas = (schema as any).schemas || [];
    if (schemas.length === 0) {
      return "any";
    }
    return schemas.map((s: any) => schemaToTypeString(s)).join(" | ");
  }

  if (schema instanceof LiteralSchema) {
    const val = (schema as any).value;
    return typeof val === "string"
      ? `'${JSON.stringify(val).slice(1, -1).replace(/'/g, "\\'")}'`
      : String(val);
  }

  if (schema instanceof InstanceOfSchema) {
    const ctor = (schema as any).classConstructor;
    return ctor ? ctor.name : "object";
  }

  if (schema instanceof ObjectSchemaType) {
    const definition = (schema as any).definition;
    if (!definition || Object.keys(definition).length === 0) {
      return "{}";
    }

    const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    const properties = Object.entries(definition)
      .map(([key, value]) => {
        const finalKey = validIdentifierRegex.test(key) ? key : JSON.stringify(key);
        const isOptional = value instanceof OptionalSchema;
        const optionalMarker = isOptional ? "?" : "";

        let typeStr = schemaToTypeString(value);

        if (isOptional) {
          typeStr = typeStr.replace(" | undefined", "");
        }

        return `${finalKey}${optionalMarker}:${typeStr}`;
      })
      .join(";");

    return `{${properties}}`;
  }

  return "any";
}
