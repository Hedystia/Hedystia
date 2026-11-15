import type { Plugin } from "vite";
import { type GeneratorOptions, generateRoutes } from "./generator/generate";

/** Generate typed lazy file routes before builds and refresh on route additions or removals. */
export function routerPlugin(options: GeneratorOptions = {}): Plugin {
  let root = options.root;
  let queued = Promise.resolve();
  const generate = () => {
    queued = queued
      .catch(() => {})
      .then(() => generateRoutes({ ...options, root }))
      .then(() => {});
    return queued;
  };
  return {
    name: "@hedystia/router:routes",
    configResolved(config) {
      root ??= config.root;
    },
    buildStart: generate,
    configureServer(server) {
      const update = (file: string) => {
        const directory = options.routesDirectory ?? "src/routes";
        if (file.replace(/\\/g, "/").includes(directory.replace(/\\/g, "/"))) {
          generate().catch((error) => server.config.logger.error(String(error)));
        }
      };
      server.watcher.on("add", update).on("unlink", update);
      server.httpServer?.once("close", () => {
        server.watcher.off("add", update).off("unlink", update);
      });
    },
  };
}

export type { GeneratorOptions };
export { generateRoutes };
