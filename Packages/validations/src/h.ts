import {
  type ArraySchema,
  type InstanceOfSchema,
  LiteralSchema,
  NullSchemaType,
  type OptionalSchema,
  UnionSchema,
} from "./core/base";
import type {
  AnySchema,
  InferObject,
  InferSchema,
  Schema,
  SchemaDefinition,
  SchemaType,
} from "./core/types";
import { AnySchemaType, NeverSchemaType, UnknownSchemaType } from "./schemas/any";
import { BigIntSchemaType } from "./schemas/bigint";
import { BooleanSchemaType } from "./schemas/boolean";
import { DefaultSchema } from "./schemas/default";
import { DiscriminatedUnionSchema } from "./schemas/discriminated-union";
import { IntersectionSchema } from "./schemas/intersection";
import { LazySchema } from "./schemas/lazy";
import { MapSchema } from "./schemas/map";
import { NumberSchemaType } from "./schemas/number";
import { ObjectSchemaType } from "./schemas/object";
import { RecordSchema } from "./schemas/record";
import { type RefineCheck, RefineSchema } from "./schemas/refine";
import { SetSchema } from "./schemas/set";
import { StringSchemaType } from "./schemas/string";
import { PipeSchema, TransformSchema } from "./schemas/transform";
import { TupleSchema } from "./schemas/tuple";
import { UndefinedSchemaType, VoidSchemaType } from "./schemas/undefined";
import { getJsonSchema, toStandard } from "./to-standard";

/**
 * The `h` builder: factory functions for constructing validation schemas.
 *
 * @example
 * const user = h.object({ id: h.uuid(), name: h.string().minLength(1) });
 */
export const h = {
  /** Create a string schema. */
  string: (): StringSchemaType => new StringSchemaType(),
  /** Create a number schema. */
  number: (): NumberSchemaType => new NumberSchemaType(),
  /** Create a boolean schema. */
  boolean: (): BooleanSchemaType => new BooleanSchemaType(),
  /** Create a bigint schema. */
  bigint: (): BigIntSchemaType => new BigIntSchemaType(),
  /** Create a null schema. */
  null: (): NullSchemaType => new NullSchemaType(),
  /** Alias of {@link h.null}. */
  nullable: (): NullSchemaType => new NullSchemaType(),
  /** Create an undefined schema. */
  undefined: (): UndefinedSchemaType => new UndefinedSchemaType(),
  /** Create a void schema. */
  void: (): VoidSchemaType => new VoidSchemaType(),
  /** Create an `any` schema. */
  any: (): AnySchemaType => new AnySchemaType(),
  /** Create an `unknown` schema. */
  unknown: (): UnknownSchemaType => new UnknownSchemaType(),
  /** Create a `never` schema (always fails). */
  never: (): NeverSchemaType => new NeverSchemaType(),

  /**
   * Literal value schema.
   * @param value Literal value to match.
   */
  literal: <T extends string | number | boolean>(value: T): LiteralSchema<unknown, T> =>
    new LiteralSchema<unknown, T>(value),

  /**
   * Object schema.
   * @param schemaDef Field definitions.
   */
  object: <S extends SchemaDefinition>(schemaDef?: S): ObjectSchemaType<InferObject<S>> => {
    return new ObjectSchemaType(schemaDef || {}) as ObjectSchemaType<InferObject<S>>;
  },

  /**
   * Record schema (object with dynamic keys).
   * @param keyOrValue Key schema (when 2 args) or value schema (when 1 arg).
   * @param maybeValue Value schema if a key schema was provided.
   */
  record: ((...args: any[]) => {
    if (args.length === 1) {
      return new RecordSchema<string, any>(undefined, toStandard<any>(args[0]));
    }
    return new RecordSchema<any, any>(toStandard<any>(args[0]), toStandard<any>(args[1]));
  }) as {
    <V extends AnySchema>(value: V): RecordSchema<string, SchemaType<V>>;
    <K extends AnySchema, V extends AnySchema>(
      key: K,
      value: V,
    ): RecordSchema<SchemaType<K> & (string | number), SchemaType<V>>;
  },

  /**
   * Tuple schema (fixed-length, positional).
   * @param schemas Item schemas.
   */
  tuple: <S extends AnySchema[]>(
    ...schemas: S
  ): TupleSchema<unknown, { [K in keyof S]: SchemaType<S[K]> }> => {
    const items = schemas.map((s) => toStandard<any>(s).schema);
    return new TupleSchema<unknown, { [K in keyof S]: SchemaType<S[K]> }>(items);
  },

  /**
   * Map schema.
   * @param key Key schema.
   * @param value Value schema.
   */
  map: <K extends AnySchema, V extends AnySchema>(
    key: K,
    value: V,
  ): MapSchema<SchemaType<K>, SchemaType<V>> =>
    new MapSchema<SchemaType<K>, SchemaType<V>>(toStandard<any>(key), toStandard<any>(value)),

  /**
   * Set schema.
   * @param value Value schema.
   */
  set: <V extends AnySchema>(value: V): SetSchema<SchemaType<V>> =>
    new SetSchema<SchemaType<V>>(toStandard<any>(value)),

  /**
   * Intersection schema (combines all schemas).
   * @param schemas Schemas to intersect.
   */
  intersection: <S extends AnySchema[]>(
    ...schemas: S
  ): IntersectionSchema<unknown, InferSchema<S[number]>> => {
    const stds = schemas.map((s) => toStandard<any>(s).schema);
    return new IntersectionSchema<unknown, InferSchema<S[number]>>(...stds);
  },

  /**
   * Discriminated union: faster than `options` for tagged unions.
   * @param discriminator Field name acting as the tag.
   * @param options Object schemas, each with the discriminator as a literal.
   */
  discriminatedUnion: <D extends string>(
    discriminator: D,
    options: ObjectSchemaType<any>[],
  ): DiscriminatedUnionSchema<D, any> =>
    new DiscriminatedUnionSchema<D, any>(discriminator, options),

  /**
   * Lazy schema for recursive types.
   * @param getter Function returning the inner schema.
   */
  lazy: <S extends AnySchema>(getter: () => S): LazySchema<unknown, InferSchema<S>> =>
    new LazySchema<unknown, InferSchema<S>>(() => toStandard<InferSchema<S>>(getter())),

  /**
   * Default value when the input is undefined or null.
   * @param schema Inner schema.
   * @param defaultValue Value or factory.
   */
  default: <S extends AnySchema>(
    schema: S,
    defaultValue: InferSchema<S> | (() => InferSchema<S>),
  ): DefaultSchema<unknown, InferSchema<S>> =>
    new DefaultSchema<unknown, InferSchema<S>>(
      toStandard<InferSchema<S>>(schema),
      defaultValue as any,
    ),

  /**
   * Apply a transformation to the validated value.
   * @param schema Inner schema.
   * @param fn Transform function.
   */
  transform: <S extends AnySchema, Out>(
    schema: S,
    fn: (value: InferSchema<S>) => Out,
  ): TransformSchema<unknown, InferSchema<S>, Out> =>
    new TransformSchema<unknown, InferSchema<S>, Out>(toStandard<InferSchema<S>>(schema), fn),

  /**
   * Apply a custom validation predicate.
   * @param schema Inner schema.
   * @param check Predicate returning true / false / message / issues.
   * @param message Default message when predicate returns false.
   */
  refine: <S extends AnySchema>(
    schema: S,
    check: RefineCheck<InferSchema<S>>,
    message?: string,
  ): RefineSchema<unknown, InferSchema<S>> =>
    new RefineSchema<unknown, InferSchema<S>>(toStandard<InferSchema<S>>(schema), check, message),

  /**
   * Pipe one schema's output into another schema's input.
   * @param a First schema.
   * @param b Second schema receiving `a`'s output.
   */
  pipe: <A extends AnySchema, B extends AnySchema>(
    a: A,
    b: B,
  ): PipeSchema<unknown, InferSchema<A>, InferSchema<B>> =>
    new PipeSchema<unknown, InferSchema<A>, InferSchema<B>>(
      toStandard<InferSchema<A>>(a),
      toStandard<InferSchema<B>>(b) as unknown as Schema<InferSchema<A>, InferSchema<B>>,
    ),

  /**
   * Array schema.
   * @param schema Item schema.
   */
  array: <S extends AnySchema>(schema: S): ArraySchema<unknown, SchemaType<S>[]> => {
    const base = toStandard<SchemaType<S>>(schema);
    return base.array() as ArraySchema<unknown, SchemaType<S>[]>;
  },

  /**
   * Enum schema from a list of literal values.
   * @param values Allowed literals.
   */
  enum: <T extends string | number | boolean, Values extends readonly [T, ...T[]]>(
    values: Values,
  ): UnionSchema<unknown, Values[number]> => {
    if (!values || values.length === 0) {
      throw new Error("h.enum() requires a non-empty array of values.");
    }
    const literalSchemas = values.map((val) => h.literal(val));
    return h.options(...literalSchemas) as UnionSchema<unknown, Values[number]>;
  },

  /**
   * Optional schema (allows undefined).
   * @param schema Inner schema.
   */
  optional: <S extends AnySchema>(
    schema: S,
  ): OptionalSchema<unknown, InferSchema<S> | undefined> => {
    return toStandard<InferSchema<S>>(schema).optional() as OptionalSchema<
      unknown,
      InferSchema<S> | undefined
    >;
  },

  /**
   * Union schema (succeeds if any branch succeeds).
   * @param schemas Branch schemas.
   */
  options: <S extends AnySchema[]>(...schemas: S): UnionSchema<unknown, InferSchema<S[number]>> => {
    const stdSchemas = schemas.map((s) => toStandard<InferSchema<S[number]>>(s).schema);
    return new UnionSchema<unknown, InferSchema<S[number]>>(...stdSchemas);
  },

  /**
   * Alias of {@link h.options}.
   */
  union: <S extends AnySchema[]>(...schemas: S): UnionSchema<unknown, InferSchema<S[number]>> =>
    h.options(...schemas),

  /**
   * Restrict to instances of a constructor.
   * @param constructor Class constructor.
   */
  instanceOf: <C extends new (...args: any[]) => any>(
    constructor: C,
  ): InstanceOfSchema<unknown, InstanceType<C>> => {
    const baseSchema = h.object({});
    return baseSchema.instanceOf(constructor);
  },

  /** Date string schema. */
  date: (): StringSchemaType => h.string().date(),
  /** UUID string schema. */
  uuid: (): StringSchemaType => h.string().uuid(),
  /** Regex string schema. */
  regex: (regex: RegExp): StringSchemaType => h.string().regex(regex),
  /** Email string schema. */
  email: (): StringSchemaType => h.string().email(),
  /** Phone string schema. */
  phone: (): StringSchemaType => h.string().phone(),
  /** Domain string schema. */
  domain: (requireHttpOrHttps = true): StringSchemaType => h.string().domain(requireHttpOrHttps),

  /**
   * Coerce-then-validate factories. Equivalent to `h.X().coerce()`.
   */
  coerce: {
    /** Coerce input to string. */
    string: (): StringSchemaType => new StringSchemaType().coerce(),
    /** Coerce input to number. */
    number: (): NumberSchemaType => new NumberSchemaType().coerce(),
    /** Coerce input to boolean. */
    boolean: (): BooleanSchemaType => new BooleanSchemaType().coerce(),
    /** Coerce input to bigint. */
    bigint: (): BigIntSchemaType => new BigIntSchemaType().coerce(),
  },

  /** Re-export of {@link toStandard}. */
  toStandard,

  /**
   * Get JSON Schema from a validation schema.
   * @param schema Schema to convert.
   * @param options Conversion options.
   */
  getJsonSchema,
};
