import { h } from "@hedystia/validations";
import { describe, expect, it } from "vitest";

async function validate(schema: any, value: unknown) {
  return h.toStandard(schema)["~standard"].validate(value);
}

describe("string formats", () => {
  it("should validate ipv4 addresses", async () => {
    expect((await validate(h.ipv4(), "192.168.1.1")).issues).toBeUndefined();
    expect((await validate(h.ipv4(), "0.0.0.0")).issues).toBeUndefined();
    expect((await validate(h.ipv4(), "256.1.1.1")).issues).toBeDefined();
    expect((await validate(h.ipv4(), "1.2.3")).issues).toBeDefined();
    expect((await validate(h.ipv4(), "1.2.3.a")).issues).toBeDefined();
  });

  it("should validate ipv6 addresses", async () => {
    expect((await validate(h.ipv6(), "::1")).issues).toBeUndefined();
    expect((await validate(h.ipv6(), "2001:db8::1")).issues).toBeUndefined();
    expect((await validate(h.ipv6(), "2001:db8:0:0:0:0:0:1")).issues).toBeUndefined();
    expect((await validate(h.ipv6(), "2001:db8:::1")).issues).toBeDefined();
    expect((await validate(h.ipv6(), "2001:db8:0:0:0:0:0:0:1")).issues).toBeDefined();
    expect((await validate(h.ipv6(), "gggg::1")).issues).toBeDefined();
  });

  it("should validate ip addresses of either family", async () => {
    expect((await validate(h.ip(), "10.0.0.1")).issues).toBeUndefined();
    expect((await validate(h.ip(), "fe80::1")).issues).toBeUndefined();
    expect((await validate(h.ip(), "not-an-ip")).issues).toBeDefined();
  });

  it("should validate urls", async () => {
    expect((await validate(h.url(), "https://example.com/path?q=1")).issues).toBeUndefined();
    expect((await validate(h.url(), "http://localhost:3000")).issues).toBeUndefined();
    expect((await validate(h.url(), "ftp://example.com")).issues).toBeDefined();
    expect((await validate(h.url(), "not a url")).issues).toBeDefined();
  });

  it("should validate base64 strings", async () => {
    expect((await validate(h.base64(), "aGVsbG8=")).issues).toBeUndefined();
    expect((await validate(h.base64(), "aGVsbG8")).issues).toBeDefined();
    expect((await validate(h.base64(), "a$b=")).issues).toBeDefined();
    expect((await validate(h.base64(), "")).issues).toBeDefined();
  });

  it("should validate hexadecimal strings", async () => {
    expect((await validate(h.hex(), "deadBEEF")).issues).toBeUndefined();
    expect((await validate(h.hex(), "0123456789abcdef")).issues).toBeUndefined();
    expect((await validate(h.hex(), "xyz")).issues).toBeDefined();
  });

  it("should validate jwts", async () => {
    expect(
      (await validate(h.jwt(), "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature")).issues,
    ).toBeUndefined();
    expect((await validate(h.jwt(), "a.b")).issues).toBeDefined();
    expect((await validate(h.jwt(), "a.b.c.d")).issues).toBeDefined();
  });

  it("should validate ulids", async () => {
    expect((await validate(h.ulid(), "01ARZ3NDEKTSV4RRFFQ69G5FAV")).issues).toBeUndefined();
    expect((await validate(h.ulid(), "01ARZ3NDEKTSV4RRFFQ69G5FA")).issues).toBeDefined();
    expect((await validate(h.ulid(), "01ARZ3NDEKTSV4RRFFQ69G5FAI")).issues).toBeDefined();
  });

  it("should validate slugs", async () => {
    expect((await validate(h.slug(), "hello-world-2")).issues).toBeUndefined();
    expect((await validate(h.slug(), "hello")).issues).toBeUndefined();
    expect((await validate(h.slug(), "Hello World")).issues).toBeDefined();
    expect((await validate(h.slug(), "-hello")).issues).toBeDefined();
  });

  it("should validate mac addresses", async () => {
    expect((await validate(h.mac(), "00:1A:2B:3C:4D:5E")).issues).toBeUndefined();
    expect((await validate(h.mac(), "00-1a-2b-3c-4d-5e")).issues).toBeUndefined();
    expect((await validate(h.mac(), "00:1A:2B")).issues).toBeDefined();
  });

  it("should validate times", async () => {
    expect((await validate(h.time(), "23:59")).issues).toBeUndefined();
    expect((await validate(h.time(), "00:00:00")).issues).toBeUndefined();
    expect((await validate(h.time(), "24:00")).issues).toBeDefined();
    expect((await validate(h.time(), "12:60")).issues).toBeDefined();
  });

  it("should validate datetimes", async () => {
    expect((await validate(h.datetime(), "2024-05-01T12:30:00Z")).issues).toBeUndefined();
    expect((await validate(h.datetime(), "2024-05-01T12:30:00.123+02:00")).issues).toBeUndefined();
    expect((await validate(h.datetime(), "2024-05-01 12:30")).issues).toBeDefined();
    expect((await validate(h.datetime(), "not-a-date")).issues).toBeDefined();
  });

  it("should validate iso dates", async () => {
    expect((await validate(h.isoDate(), "2024-02-29")).issues).toBeUndefined();
    expect((await validate(h.isoDate(), "2023-02-29")).issues).toBeDefined();
    expect((await validate(h.isoDate(), "01-02-2024")).issues).toBeDefined();
  });

  it("should validate credit card numbers", async () => {
    expect((await validate(h.creditCard(), "4242424242424242")).issues).toBeUndefined();
    expect((await validate(h.creditCard(), "4242 4242 4242 4242")).issues).toBeUndefined();
    expect((await validate(h.creditCard(), "4242424242424241")).issues).toBeDefined();
    expect((await validate(h.creditCard(), "1234")).issues).toBeDefined();
  });

  it("should validate semver strings", async () => {
    expect((await validate(h.semver(), "1.2.3")).issues).toBeUndefined();
    expect((await validate(h.semver(), "1.2.3-beta.1+build.5")).issues).toBeUndefined();
    expect((await validate(h.semver(), "1.2")).issues).toBeDefined();
  });

  it("should validate non-empty strings", async () => {
    expect((await validate(h.nonempty(), "a")).issues).toBeUndefined();
    expect((await validate(h.nonempty(), "")).issues).toBeDefined();
  });

  it("should validate startsWith, endsWith and includes", async () => {
    expect((await validate(h.string().startsWith("api-"), "api-key")).issues).toBeUndefined();
    expect((await validate(h.string().startsWith("api-"), "key")).issues).toBeDefined();
    expect((await validate(h.string().endsWith(".ts"), "index.ts")).issues).toBeUndefined();
    expect((await validate(h.string().endsWith(".ts"), "index.js")).issues).toBeDefined();
    expect((await validate(h.string().includes("mid"), "a-mid-b")).issues).toBeUndefined();
    expect((await validate(h.string().includes("mid"), "a-b")).issues).toBeDefined();
  });

  it("should chain format and length constraints", async () => {
    const schema = h.string().uuid().maxLength(36);
    expect((await validate(schema, "550e8400-e29b-41d4-a716-446655440000")).issues).toBeUndefined();
    expect((await validate(schema, "not-a-uuid")).issues).toBeDefined();
  });
});

describe("number constraints", () => {
  it("should validate sign constraints", async () => {
    expect((await validate(h.number().positive(), 1)).issues).toBeUndefined();
    expect((await validate(h.number().positive(), 0)).issues).toBeDefined();
    expect((await validate(h.number().negative(), -1)).issues).toBeUndefined();
    expect((await validate(h.number().negative(), 0)).issues).toBeDefined();
    expect((await validate(h.number().nonnegative(), 0)).issues).toBeUndefined();
    expect((await validate(h.number().nonnegative(), -1)).issues).toBeDefined();
    expect((await validate(h.number().nonpositive(), 0)).issues).toBeUndefined();
    expect((await validate(h.number().nonpositive(), 1)).issues).toBeDefined();
  });

  it("should validate multipleOf", async () => {
    expect((await validate(h.number().multipleOf(5), 25)).issues).toBeUndefined();
    expect((await validate(h.number().multipleOf(5), 26)).issues).toBeDefined();
  });

  it("should validate finite numbers", async () => {
    expect((await validate(h.number().finite(), 42)).issues).toBeUndefined();
    expect((await validate(h.number().finite(), Number.POSITIVE_INFINITY)).issues).toBeDefined();
  });

  it("should validate safe integers", async () => {
    expect((await validate(h.number().safe(), 42)).issues).toBeUndefined();
    expect((await validate(h.number().safe(), 2 ** 53)).issues).toBeDefined();
  });

  it("should validate port numbers", async () => {
    expect((await validate(h.number().port(), 80)).issues).toBeUndefined();
    expect((await validate(h.number().port(), 0)).issues).toBeDefined();
    expect((await validate(h.number().port(), 70000)).issues).toBeDefined();
    expect((await validate(h.number().port(), 80.5)).issues).toBeDefined();
  });
});
