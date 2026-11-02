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
  private _validateIpv4 = false;
  private _validateIpv6 = false;
  private _validateIp = false;
  private _validateUrl = false;
  private _validateBase64 = false;
  private _validateHex = false;
  private _validateJwt = false;
  private _validateUlid = false;
  private _validateSlug = false;
  private _validateMac = false;
  private _validateTime = false;
  private _validateDatetime = false;
  private _validateIsoDate = false;
  private _validateCreditCard = false;
  private _validateSemver = false;
  private _requireHttpOrHttps = false;
  private _minLength?: number;
  private _maxLength?: number;
  private _startsWith?: string;
  private _endsWith?: string;
  private _includes?: string;

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

  /**
   * Require the value to be non-empty.
   * @returns {StringSchemaType} New constrained schema.
   */
  nonempty(): StringSchemaType {
    return this.minLength(1);
  }

  /**
   * Validate value as an IPv4 address.
   * @returns {StringSchemaType} New constrained schema.
   */
  ipv4(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateIpv4 = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "ipv4" };
    return schema;
  }

  /**
   * Validate value as an IPv6 address.
   * @returns {StringSchemaType} New constrained schema.
   */
  ipv6(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateIpv6 = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "ipv6" };
    return schema;
  }

  /**
   * Validate value as an IPv4 or IPv6 address.
   * @returns {StringSchemaType} New constrained schema.
   */
  ip(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateIp = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "ip" };
    return schema;
  }

  /**
   * Validate value as an absolute http(s) URL.
   * @returns {StringSchemaType} New constrained schema.
   */
  url(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateUrl = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "uri" };
    return schema;
  }

  /**
   * Validate value as a base64 encoded string.
   * @returns {StringSchemaType} New constrained schema.
   */
  base64(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateBase64 = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "base64" };
    return schema;
  }

  /**
   * Validate value as a hexadecimal string.
   * @returns {StringSchemaType} New constrained schema.
   */
  hex(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateHex = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "hex" };
    return schema;
  }

  /**
   * Validate value as a JSON Web Token.
   * @returns {StringSchemaType} New constrained schema.
   */
  jwt(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateJwt = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "jwt" };
    return schema;
  }

  /**
   * Validate value as a ULID.
   * @returns {StringSchemaType} New constrained schema.
   */
  ulid(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateUlid = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "ulid" };
    return schema;
  }

  /**
   * Validate value as a URL-safe slug.
   * @returns {StringSchemaType} New constrained schema.
   */
  slug(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateSlug = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "slug" };
    return schema;
  }

  /**
   * Validate value as a MAC address.
   * @returns {StringSchemaType} New constrained schema.
   */
  mac(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateMac = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "mac" };
    return schema;
  }

  /**
   * Validate value as a 24-hour time (`HH:MM` or `HH:MM:SS`).
   * @returns {StringSchemaType} New constrained schema.
   */
  time(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateTime = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "time" };
    return schema;
  }

  /**
   * Validate value as an ISO 8601 date-time string.
   * @returns {StringSchemaType} New constrained schema.
   */
  datetime(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateDatetime = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "date-time" };
    return schema;
  }

  /**
   * Validate value as an ISO 8601 calendar date (`YYYY-MM-DD`).
   * @returns {StringSchemaType} New constrained schema.
   */
  isoDate(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateIsoDate = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "date" };
    return schema;
  }

  /**
   * Validate value as a payment card number (Luhn algorithm).
   * @returns {StringSchemaType} New constrained schema.
   */
  creditCard(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateCreditCard = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "credit-card" };
    return schema;
  }

  /**
   * Validate value as a semantic version.
   * @returns {StringSchemaType} New constrained schema.
   */
  semver(): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._validateSemver = true;
    schema.jsonSchema = { ...this.jsonSchema, format: "semver" };
    return schema;
  }

  /**
   * Require the value to start with a prefix.
   * @param {string} prefix Expected prefix.
   * @returns {StringSchemaType} New constrained schema.
   */
  startsWith(prefix: string): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._startsWith = prefix;
    return schema;
  }

  /**
   * Require the value to end with a suffix.
   * @param {string} suffix Expected suffix.
   * @returns {StringSchemaType} New constrained schema.
   */
  endsWith(suffix: string): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._endsWith = suffix;
    return schema;
  }

  /**
   * Require the value to contain a substring.
   * @param {string} substring Expected substring.
   * @returns {StringSchemaType} New constrained schema.
   */
  includes(substring: string): StringSchemaType {
    const schema = new StringSchemaType();
    Object.assign(schema, this);
    schema._includes = substring;
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
        if (this._validateIpv4 && !this._isValidIpv4(value)) {
          return { issues: [{ message: "Invalid IPv4 format" }] };
        }
        if (this._validateIpv6 && !this._isValidIpv6(value)) {
          return { issues: [{ message: "Invalid IPv6 format" }] };
        }
        if (this._validateIp && !this._isValidIpv4(value) && !this._isValidIpv6(value)) {
          return { issues: [{ message: "Invalid IP address format" }] };
        }
        if (this._validateUrl && !this._isValidUrl(value)) {
          return { issues: [{ message: "Invalid URL format" }] };
        }
        if (this._validateBase64 && !this._isValidBase64(value)) {
          return { issues: [{ message: "Invalid base64 format" }] };
        }
        if (this._validateHex && !this._isValidHex(value)) {
          return { issues: [{ message: "Invalid hexadecimal format" }] };
        }
        if (this._validateJwt && !this._isValidJwt(value)) {
          return { issues: [{ message: "Invalid JWT format" }] };
        }
        if (this._validateUlid && !this._isValidUlid(value)) {
          return { issues: [{ message: "Invalid ULID format" }] };
        }
        if (this._validateSlug && !this._isValidSlug(value)) {
          return { issues: [{ message: "Invalid slug format" }] };
        }
        if (this._validateMac && !this._isValidMac(value)) {
          return { issues: [{ message: "Invalid MAC address format" }] };
        }
        if (this._validateTime && !this._isValidTime(value)) {
          return { issues: [{ message: "Invalid time format" }] };
        }
        if (this._validateDatetime && !this._isValidDatetime(value)) {
          return { issues: [{ message: "Invalid datetime format" }] };
        }
        if (this._validateIsoDate && !this._isValidIsoDate(value)) {
          return { issues: [{ message: "Invalid date format" }] };
        }
        if (this._validateCreditCard && !this._isValidCreditCard(value)) {
          return { issues: [{ message: "Invalid credit card number" }] };
        }
        if (this._validateSemver && !this._isValidSemver(value)) {
          return { issues: [{ message: "Invalid semver format" }] };
        }
        if (this._startsWith !== undefined && !value.startsWith(this._startsWith)) {
          return { issues: [{ message: `String must start with "${this._startsWith}"` }] };
        }
        if (this._endsWith !== undefined && !value.endsWith(this._endsWith)) {
          return { issues: [{ message: `String must end with "${this._endsWith}"` }] };
        }
        if (this._includes !== undefined && !value.includes(this._includes)) {
          return { issues: [{ message: `String must include "${this._includes}"` }] };
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

  private _isValidIpv4(value: string): boolean {
    const parts = value.split(".");
    if (parts.length !== 4) {
      return false;
    }
    return parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) {
        return false;
      }
      return Number(part) <= 255;
    });
  }

  private _isValidIpv6(value: string): boolean {
    if (value.length === 0 || value.length > 45) {
      return false;
    }
    const sections = value.split("::");
    if (sections.length > 2) {
      return false;
    }
    const groups = sections.flatMap((section) => (section === "" ? [] : section.split(":")));
    const hasCompression = sections.length === 2;
    if (hasCompression ? groups.length >= 8 : groups.length !== 8) {
      return false;
    }
    return groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group));
  }

  private _isValidUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  private _isValidBase64(value: string): boolean {
    return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
  }

  private _isValidHex(value: string): boolean {
    return value.length > 0 && /^[0-9a-fA-F]+$/.test(value);
  }

  private _isValidJwt(value: string): boolean {
    return (
      value.split(".").length === 3 &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value)
    );
  }

  private _isValidUlid(value: string): boolean {
    return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value);
  }

  private _isValidSlug(value: string): boolean {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  }

  private _isValidMac(value: string): boolean {
    return /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(value);
  }

  private _isValidTime(value: string): boolean {
    return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
  }

  private _isValidDatetime(value: string): boolean {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ) {
      return false;
    }
    return !Number.isNaN(Date.parse(value));
  }

  private _isValidIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const [year, month, day] = value.split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private _isValidCreditCard(value: string): boolean {
    const digits = value.replace(/[\s-]/g, "");
    if (!/^\d{13,19}$/.test(digits)) {
      return false;
    }
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = Number(digits[i]);
      if (double) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      double = !double;
    }
    return sum % 10 === 0;
  }

  private _isValidSemver(value: string): boolean {
    return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      value,
    );
  }
}
