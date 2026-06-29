import fs from "node:fs";
import path from "node:path";
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
  const { plugins, collectedCSS } = viewPlugin(options);

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
      "astro:build:done": async ({ dir }) => {
        if (collectedCSS.size > 0) {
          const css = Array.from(collectedCSS.values()).join("\n");
          injectCSSIntoHTML(dir.pathname, css);
        }
      },
    },
  };
}

function injectCSSIntoHTML(dir: string, css: string): void {
  const styleTag = `<style data-hedystia-css>${css}</style>`;

  for (const file of findHTMLFiles(dir)) {
    let content = fs.readFileSync(file, "utf-8");
    if (content.includes("data-hedystia-css")) {
      continue;
    }
    if (content.includes("</head>")) {
      content = content.replace("</head>", `${styleTag}</head>`);
    } else {
      content = `${styleTag}${content}`;
    }
    fs.writeFileSync(file, content, "utf-8");
  }
}

function findHTMLFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".html")) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
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
