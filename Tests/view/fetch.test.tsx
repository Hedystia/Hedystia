/** @vitest-environment happy-dom */
import { action, load, set, sig, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("Fetch", () => {
  describe("load()", () => {
    it("should create resource", async () => {
      const data = { id: 1, name: "test" };
      const resource = load(
        () => "key",
        async () => data,
      );

      expect(val(resource.loading)).toBe(true);
      expect(val(resource.state)).toBe("pending");

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(resource.ready).toBe(true);
      expect(val(resource.data)).toEqual(data);
    });

    it("should handle errors", async () => {
      const resource = load(
        () => "key",
        async () => {
          throw new Error("fetch failed");
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(val(resource.state)).toBe("errored");
      expect(val(resource.error)).toBeDefined();
    });

    it("should refetch when key changes", async () => {
      const key = sig("a");
      const fetches: string[] = [];
      load(
        () => val(key),
        async (k) => {
          fetches.push(k);
          return { value: k };
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(fetches).toEqual(["a"]);

      set(key, "b");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(fetches).toEqual(["a", "b"]);
    });
  });

  describe("action()", () => {
    it("should create action", async () => {
      const saveAction = action(async (data: { name: string }) => {
        return { id: 1, ...data };
      });

      expect(val(saveAction.loading)).toBe(false);
      const result = await saveAction.run({ name: "test" });
      expect(result).toEqual({ id: 1, name: "test" });
    });

    it("should track loading state", async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const saveAction = action(async (data: { name: string }) => {
        await promise;
        return { id: 1, ...data };
      });

      saveAction.run({ name: "test" });
      expect(val(saveAction.loading)).toBe(true);

      resolvePromise!({});
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(val(saveAction.loading)).toBe(false);
    });

    it("should handle errors", async () => {
      const saveAction = action(async () => {
        throw new Error("save failed");
      });

      try {
        await saveAction.run({ name: "test" });
      } catch {
        expect(val(saveAction.error)).toBeDefined();
      }
    });

    it("should store result in data", async () => {
      const saveAction = action(async (data: { name: string }) => {
        return { id: 1, ...data };
      });

      await saveAction.run({ name: "test" });
      expect(val(saveAction.data)).toEqual({ id: 1, name: "test" });
    });
  });
});
