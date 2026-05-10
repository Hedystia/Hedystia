import Framework from "hedystia";
import { afterAll, describe, expect, it } from "vitest";

const appWithSpecificOrigin = new Framework({
  cors: {
    origin: "http://allowed-client.com",
    methods: ["GET", "POST"],
    credentials: true,
    maxAge: 86400,
  },
}).get("/", () => "CORS OK");

appWithSpecificOrigin.listen(3035);

const appWithWildcardOrigin = new Framework({
  cors: { origin: "*" },
}).post("/", () => "Wildcard CORS OK");

appWithWildcardOrigin.listen(3036);

const appWithFunctionOrigin = new Framework({
  cors: {
    origin: (origin) => {
      return origin?.endsWith(".approved.org") ?? false;
    },
  },
}).get("/", () => "Dynamic CORS OK");

appWithFunctionOrigin.listen(3037);

describe("CORS Tests", () => {
  describe("Specific Origin Configuration", () => {
    it("should handle OPTIONS pre-flight request from an allowed origin", async () => {
      const response = await fetch("http://127.0.0.1:3035/", {
        method: "OPTIONS",
        headers: {
          Origin: "http://allowed-client.com",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://allowed-client.com");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST");
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    });

    it("should handle actual GET request from an allowed origin", async () => {
      const response = await fetch("http://127.0.0.1:3035/", {
        headers: { Origin: "http://allowed-client.com" },
      });
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toBe("CORS OK");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://allowed-client.com");
      expect(response.headers.get("Vary")).toContain("Origin");
    });

    it("should not add CORS headers for a request from a disallowed origin", async () => {
      const response = await fetch("http://127.0.0.1:3035/", {
        headers: { Origin: "http://disallowed-client.com" },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });

  describe("Wildcard Origin Configuration", () => {
    it("should allow any origin with '*'", async () => {
      const response = await fetch("http://127.0.0.1:3036/", {
        method: "POST",
        headers: { Origin: "http://any-random-client.net" },
        body: "test",
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("Function Origin Configuration", () => {
    it("should allow a dynamically approved origin", async () => {
      const response = await fetch("http://127.0.0.1:3037/", {
        headers: { Origin: "https://frontend.approved.org" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://frontend.approved.org",
      );
    });

    it("should block a dynamically disapproved origin", async () => {
      const response = await fetch("http://127.0.0.1:3037/", {
        headers: { Origin: "https://frontend.unapproved.com" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });

  afterAll(() => {
    appWithSpecificOrigin.close();
    appWithWildcardOrigin.close();
    appWithFunctionOrigin.close();
  });
});
