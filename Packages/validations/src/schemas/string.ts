import { BaseSchema } from "../core/base";
import type { CombinedStandardProps, SchemaPrimitive } from "../core/types";

export class StringSchemaType extends BaseSchema<unknown, string> {
  readonly type: SchemaPrimitive = "string";
  private _validateDate = false;
  private _validateUUID = false;
  private _validateRegex = false;
  private _validateEmail = false;
  private _validatePhone = false;
  private _validateDomain = false;
  private _requireHttpOrHttps = false;
  private _minLength?: number;
  private _maxLength?: number;

  constructor() {
    super();
    this.jsonSchema = { type: "string" };
  }

  primitive(): SchemaPrimitive {
    return this.type;
  }

  /**
   * Require minimum string length.
   * @param {number} n Minimum length.
   * @returns {StringSchemaType} New constrained schema.
   */
  minLength(n: number): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._minLength = n;
    schema.jsonSchema = { ...this.jsonSchema, minLength: n };
    return schema;
  }

  /**
   * Require maximum string length.
   * @param {number} n Maximum length.
   * @returns {StringSchemaType} New constrained schema.
   */
  maxLength(n: number): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._maxLength = n;
    schema.jsonSchema = { ...this.jsonSchema, maxLength: n };
    return schema;
  }

  /**
   * Validate value as parseable date string.
   * @returns {StringSchemaType} New constrained schema.
   */
  date(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateDate = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "date" };
    return schema;
  }

  /**
   * Validate value as a UUID string.
   * @returns {StringSchemaType} New constrained schema.
   */
  uuid(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateUUID = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "uuid" };
    return schema;
  }

  /**
   * Validate value matches a regex.
   * @param {RegExp} regex Pattern to match.
   * @returns {StringSchemaType} New constrained schema.
   */
  regex(regex: RegExp): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateRegex = true;
    schema.jsonSchema = { ...this.jsonSchema, pattern: regex.source };
    return schema;
  }

  /**
   * Validate value as an email.
   * @returns {StringSchemaType} New constrained schema.
   */
  email(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateEmail = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "email" };
    return schema;
  }

  /**
   * Validate value as a phone number.
   * @returns {StringSchemaType} New constrained schema.
   */
  phone(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validatePhone = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "phone" };
    return schema;
  }

  /**
   * Validate value as a domain name.
   * @param {boolean} [requireHttpOrHttps=true] Require http(s) prefix.
   * @returns {StringSchemaType} New constrained schema.
   */
  domain(requireHttpOrHttps = true): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateDomain = true;
    schema._requireHttpOrHttps = requireHttpOrHttps;
    schema.jsonSchema = { ...this.jsonSchema, format: "domain" };
    return schema;
  }

  get ["~standard"](): CombinedStandardProps<unknown, string> {
    return {
      version: 1,
      vendor: "h-schema",
      jsonSchema: {
        input: () => this.jsonSchema,
        output: () => this.jsonSchema,
      },
      validate: (value: unknown) => {
        if (this._coerce && typeof value !== "string") {
          value = String(value);
        }

        if (typeof value !== "string") {
          return { issues: [{ message: `Expected string, received ${typeof value}` }] };
        }

        if (this._minLength !== undefined && value.length < this._minLength) {
          return { issues: [{ message: `String shorter than ${this._minLength}` }] };
        }
        if (this._maxLength !== undefined && value.length > this._maxLength) {
          return { issues: [{ message: `String longer than ${this._maxLength}` }] };
        }
        if (this._validateUUID && !this._isValidUUID(value)) {
          return { issues: [{ message: "Invalid UUID format" }] };
        }
        if (this._validateRegex && !this._isValidRegex(value)) {
          return { issues: [{ message: "Invalid regex format" }] };
        }
        if (this._validateEmail && !this._isValidEmail(value)) {
          return { issues: [{ message: "Invalid email format" }] };
        }
        if (this._validatePhone && !this._isValidPhone(value)) {
          return { issues: [{ message: "Invalid phone number format" }] };
        }
        if (this._validateDomain && !this._isValidDomain(value)) {
          return { issues: [{ message: "Invalid domain format" }] };
        }
        if (this._validateDate && !this._isValidDate(value)) {
          return { issues: [{ message: "Invalid date format" }] };
        }

        return { value };
      },
      types: {
        input: {} as unknown,
        output: {} as string,
      },
    };
  }

  private _isValidDate(value: string): boolean {
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  }

  private _isValidUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  private _isValidRegex(value: string): boolean {
    return new RegExp(this.jsonSchema.pattern!).test(value);
  }

  private _isValidEmail(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  private _isValidPhone(value: string): boolean {
    const phoneRegex = /^\+?[0-9]{7,15}$/;
    return phoneRegex.test(value);
  }

  private _isValidDomain(value: string): boolean {
    let domainRegex = /^[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,6}$/;
    if (this._requireHttpOrHttps) {
      domainRegex = /^https?:\/\/[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,6}$/;
    }
    return domainRegex.test(value);
  }
}
