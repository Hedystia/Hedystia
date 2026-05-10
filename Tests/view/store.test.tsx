/** @vitest-environment happy-dom */
import { memo, patch, set, snap, store, val } from "@hedystia/view";
import { describe, expect, it } from "vitest";

describe("Store", () => {
  describe("store()", () => {
    it("should create a store with initial state", () => {
      const appStore = store({
        user: { name: "guest", role: "viewer" as const },
        theme: "dark" as "dark" | "light",
        count: 0,
      });

      expect(val((appStore.user as any).name)).toBe("guest");
      expect(val(appStore.theme as any)).toBe("dark");
      expect(val(appStore.count as any)).toBe(0);
    });

    it("should create nested signals", () => {
      const appStore = store({
        user: { name: "guest" },
      });

      expect(typeof appStore.user).toBe("object");
      expect(val((appStore.user as any).name)).toBe("guest");
    });
  });

  describe("set() with store", () => {
    it("should update store signal", () => {
      const appStore = store({
        theme: "dark" as "dark" | "light",
      });

      set(appStore.theme as any, "light");
      expect(val(appStore.theme as any)).toBe("light");
    });

    it("should update nested signal", () => {
      const appStore = store({
        user: { name: "guest" },
      });

      set((appStore.user as any).name, "alice");
      expect(val((appStore.user as any).name)).toBe("alice");
    });
  });

  describe("patch()", () => {
    it("should deep update store node", () => {
      const appStore = store({
        user: { name: "guest", role: "viewer" as const },
      });

      patch(appStore.user as any, { name: "alice", role: "admin" });
      expect(val((appStore.user as any).name)).toBe("alice");
      expect(val((appStore.user as any).role)).toBe("admin");
    });
  });

  describe("snap()", () => {
    it("should create plain snapshot", () => {
      const appStore = store({
        user: { name: "guest", role: "viewer" as const },
        count: 0,
      });

      const snapshot = snap(appStore);
      expect(snapshot).toEqual({
        user: { name: "guest", role: "viewer" },
        count: 0,
      });
    });

    it("should snapshot reflects current state", () => {
      const appStore = store({
        count: 0,
      });

      set(appStore.count! as any, 5);
      const snapshot = snap(appStore) as any;
      expect(snapshot.count).toBe(5);
    });
  });

  describe("reactivity", () => {
    it("should trigger memo on store change", () => {
      const appStore = store({
        count: 0,
      });

      let updates = 0;
      const doubled = memo(() => {
        updates++;
        return (val(appStore.count! as any) as any) * 2;
      });

      expect(val(doubled)).toBe(0);
      set(appStore.count! as any, 5);
      expect(val(doubled)).toBe(10);
      expect(updates).toBe(2);
    });

    it("should work with derived values", () => {
      const appStore = store({
        firstName: "John",
        lastName: "Doe",
      });

      const fullName = memo(() => {
        return `${val(appStore.firstName! as any)} ${val(appStore.lastName! as any)}`;
      });

      expect(val(fullName)).toBe("John Doe");
      set(appStore.firstName! as any, "Jane");
      expect(val(fullName)).toBe("Jane Doe");
    });
  });
});
