import { viewPlugin } from "@hedystia/view/vite";
import type { AstroIntegration, AstroRenderer } from "astro";
import type { Plugin, UserConfig } from "vite";

function getRenderer(): AstroRenderer {
  return {
    name: "@hedystia/astro",
    clientEntrypoint: "@hedystia/astro/client.js",
    serverEntrypoint: "@hedystia/astro/server.js",
  };
}

export { getRenderer as getContainerRenderer };

export interface Options {
  include?: string[];
  exclude?: string[];
}

export default function (options: Options = {}): AstroIntegration {
  const { plugins } = viewPlugin(options);

  return {
    name: "@hedystia/astro",
    hooks: {
      "astro:config:setup": async ({ addRenderer, updateConfig }) => {
        addRenderer(getRenderer());
        updateConfig({
          vite: {
            plugins: [...plugins, configEnvironmentPlugin()],
            ssr: {
              noExternal: ["@hedystia/view"],
            },
          },
        });
      },
    },
  };
}

function configEnvironmentPlugin(): Plugin {
  return {
    name: "@hedystia/astro:config-environment",
    configEnvironment(environmentName: string): UserConfig | Promise<UserConfig> | undefined {
      return {
        optimizeDeps: {
          include: environmentName === "client" ? ["@hedystia/astro/client.js"] : [],
          exclude: ["@hedystia/astro/server.js"],
        },
      };
    },
  };
}
