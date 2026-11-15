import { writeFile } from "fs/promises";
import type { RouteInfo } from "./types";
import { schemaToTypeString } from "./utils";

const schemaSections = [
  "params",
  "query",
  "body",
  "headers",
  "response",
  "data",
  "error",
  "message",
] as const;

/** Generate a portable declaration without writing to disk. */
export function generateTypesContent(routes: readonly RouteInfo[]): string {
  const typeDefinitions = routes
    .map((route) => {
      const fields = [
        `method:${JSON.stringify(route.method)}`,
        `path:${JSON.stringify(route.path)}`,
      ];
      for (const section of schemaSections) {
        const schema = route[section];
        if (schema !== undefined && schema !== null) {
          fields.push(`${section}:${schemaToTypeString(schema)}`);
        }
      }
      return `{${fields.join(";")}}`;
    })
    .join(",");

  return `// Automatic Hedystia type generation\nexport type AppRoutes=[${typeDefinitions}];`;
}

export async function generateTypes(routes: RouteInfo[], filePath: string): Promise<void> {
  await writeFile(filePath, generateTypesContent(routes), "utf8");
}

export type { RouteInfo } from "./types";

export { schemaToTypeString };
