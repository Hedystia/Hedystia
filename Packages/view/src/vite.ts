import type { Plugin, UserConfig } from "vite";

const CSS_RE = /\.css$/;

export interface ViewPluginOptions {
  include?: string[];
  exclude?: string[];
}

export interface ViewPluginResult {
  plugins: Plugin[];
  collectedCSS: Map<string, string>;
}

export function viewPlugin(options: ViewPluginOptions = {}): ViewPluginResult {
  const collectedCSS = new Map<string, string>();

  const plugins: Plugin[] = [viewJSXPlugin(options), viewCSSCollectorPlugin(collectedCSS)];

  return { plugins, collectedCSS };
}

function viewJSXPlugin(_options: ViewPluginOptions): Plugin {
  return {
    name: "@hedystia/view:jsx",
    config(): UserConfig {
      return {
        esbuild: {
          jsx: "automatic",
          jsxImportSource: "@hedystia/view",
        },
      };
    },
  };
}

function viewCSSCollectorPlugin(collectedCSS: Map<string, string>): Plugin {
  return {
    name: "@hedystia/view:css-collector",
    // Use buildEnd to collect CSS after it has been fully processed
    buildEnd() {
      // CSS should have been collected during transform
    },
    transform(code, id) {
      // Collect CSS files that are being imported
      // This runs before TailwindCSS processes them, but we track the import
      if (CSS_RE.test(id)) {
        collectedCSS.set(id.replace(/\\/g, "/"), code);
      }
      // Return undefined to let other plugins process the CSS
      return;
    },
  };
}
