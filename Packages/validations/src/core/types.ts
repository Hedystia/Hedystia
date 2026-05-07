import type { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec";
import type { BaseSchema, OptionalSchema } from "./base";

export type SchemaPrimitive = "string" | "number" | "boolean" | "any";

export interface SchemaLike {
  [key: string]: SchemaPrimitive | SchemaLike | BaseSchema<any, any>;
}

export type SchemaDefinition = SchemaLike;

export type Simplify<T> = T extends any ? { [K in keyof T]: T[K] } : never;

export type RequiredKeys<S> = {
  [K in keyof S]: S[K] extends OptionalSchema<any, any> ? never : K;
}[keyof S];

export type OptionalKeys<S> = {
  [K in keyof S]: S[K] extends OptionalSchema<any, any> ? K : never;
}[keyof S];

export type SchemaPrimitiveMap = {
  string: string;
  number: number;
  boolean: boolean;
  any: unknown;
};

export type SchemaType<S> =
  S extends BaseSchema<any, infer O>
    ? O
    : S extends keyof SchemaPrimitiveMap
      ? SchemaPrimitiveMap[S]
      : S extends Record<string, any>
        ? InferSchema<S>
        : unknown;

export type InferObject<S extends SchemaDefinition> = Simplify<
  {
    [K in RequiredKeys<S>]: SchemaType<S[K]>;
  } & {
    [K in OptionalKeys<S>]?: SchemaType<S[K]>;
  }
>;

export type InferSchema<S> =
  S extends BaseSchema<any, infer O>
    ? O
    : S extends "string"
      ? string
      : S extends "number"
        ? number
        : S extends "boolean"
          ? boolean
          : S extends { [key: string]: any }
            ? {
                [K in keyof S as undefined extends InferSchema<S[K]> ? K : never]?: InferSchema<
                  S[K]
                >;
              } & {
                [K in keyof S as undefined extends InferSchema<S[K]> ? never : K]: InferSchema<
                  S[K]
                >;
              }
            : unknown;

export type Infer<S> = InferSchema<S>;
export type InferOutput<S> = InferSchema<S>;
export type InferInput<S> = S extends BaseSchema<infer I, any> ? I : unknown;

export type CombinedStandardProps<I, O> = StandardSchemaV1.Props<I, O> & {
  readonly jsonSchema: StandardJSONSchemaV1.Converter;
};

export interface Schema<I, O> {
  readonly "~standard": CombinedStandardProps<I, O>;
  optional(): BaseSchema<I, O | undefined>;
  null(): BaseSchema<I, O | null>;
  nullable(): BaseSchema<I, O | null>;
  enum<V extends O & (string | number | boolean), Values extends readonly [V, ...V[]]>(
    values: Values,
  ): BaseSchema<I, Values[number]>;
  array(): BaseSchema<I, O[]>;
  instanceOf<C extends new (...args: any[]) => any>(constructor: C): BaseSchema<I, InstanceType<C>>;
  jsonSchema: any;
  readonly inferred: O;
  schema: Schema<I, O>;
}

export type AnySchema = SchemaPrimitive | BaseSchema<any, any> | SchemaDefinition;
