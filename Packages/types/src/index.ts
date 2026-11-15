import { writeFile } from "fs/promises";
import type { RouteInfo } from "./types";
import { schemaToTypeString } from "./utils";

/** Generate a portable declaration without writing to disk. */
export function generateTypesContent(routes: readonly RouteInfo[]): string {
  const typeDefinitions = routes
    .map((route) => {
      const responseType = schemaToTypeString(route.response);
      const paramsType = schemaToTypeString(route.params);
      const queryType = schemaToTypeString(route.query);
      const bodyType = schemaToTypeString(route.body);
      const headersType = schemaToTypeString(route.headers);
      const dataType = schemaToTypeString(route.data);
      const errorType = schemaToTypeString(route.error);
      const messageType = schemaToTypeString(route.message);
      return `{method:${JSON.stringify(route.method)};path:${JSON.stringify(route.path)};params:${paramsType};query:${queryType};body:${bodyType};headers:${headersType};response:${responseType};data:${dataType};error:${errorType};message:${messageType}}`;
    })
    .join(",");

  return `// Automatic Hedystia type generation\nexport type AppRoutes=[${typeDefinitions}];`;
}

export async function generateTypes(routes: RouteInfo[], filePath: string): Promise<void> {
  await writeFile(filePath, generateTypesContent(routes), "utf8");
}

export type { RouteInfo } from "./types";

export { schemaToTypeString };
