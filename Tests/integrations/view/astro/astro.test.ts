/** @vitest-environment happy-dom */
import astroIntegration, { getContainerRenderer } from "@hedystia/astro";
import { describe, expect, it, vi } from "vitest";

describe("astro integration", () => {
  it("getContainerRenderer returns expected renderer object", () => {
    const renderer = getContainerRenderer();
    expect(renderer.name).toBe("@hedystia/astro");
    expect(renderer.clientEntrypoint).toBe("@hedystia/astro/client.js");
    expect(renderer.serverEntrypoint).toBe("@hedystia/astro/server.js");
  });

  it("default export returns Astro integration object", () => {
    const integration = astroIntegration();
    expect(integration.name).toBe("@hedystia/astro");
    expect(integration.hooks).toBeDefined();
    expect(integration.hooks["astro:config:setup"]).toBeInstanceOf(Function);
  });

  it("astro:config:setup hook calls addRenderer and updateConfig", async () => {
    const integration = astroIntegration();
    const addRenderer = vi.fn();
    const updateConfig = vi.fn();

    if (integration.hooks["astro:config:setup"]) {
      await (integration.hooks["astro:config:setup"] as any)({
        addRenderer,
        updateConfig,
      });

      expect(addRenderer).toHaveBeenCalledWith(getContainerRenderer());
      expect(updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          vite: expect.objectContaining({
            plugins: expect.any(Array),
            ssr: {
              noExternal: ["@hedystia/view"],
            },
          }),
        }),
      );
    }
  });
});
