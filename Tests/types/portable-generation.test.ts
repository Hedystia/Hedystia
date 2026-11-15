import { generateTypesContent, schemaToTypeString } from "@hedystia/types";
import { h } from "@hedystia/validations";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("portable type generation", () => {
  it("creates an empty declaration without filesystem access", () => {
    expect(generateTypesContent([])).toContain("export type AppRoutes=[];");
  });

  it("escapes route paths, property names and string literals into valid TypeScript", () => {
    const content = generateTypesContent([
      {
        method: "SUB",
        path: '/a"\\\n/:id',
        response: h.object({ 'a"\\\n': h.literal("it's\\\nvalid") }),
        message: h.object({ text: h.string() }),
      },
    ]);
    const source = ts.createSourceFile("routes.ts", content, ts.ScriptTarget.Latest, true);
    const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
      .parseDiagnostics;
    expect(diagnostics).toEqual([]);
    expect(content).toContain("message:{text:string}");
    const declaration = source.statements[0] as ts.TypeAliasDeclaration;
    const tuple = declaration.type as ts.TupleTypeNode;
    const properties = (tuple.elements[0] as ts.TypeLiteralNode)
      .members as ts.NodeArray<ts.PropertySignature>;
    const path = properties.find((property) => property.name?.getText(source) === "path")!;
    expect(((path.type as ts.LiteralTypeNode).literal as ts.StringLiteral).text).toBe(
      '/a"\\\n/:id',
    );
    expect(schemaToTypeString(h.literal("it's"))).toBe("'it\\'s'");
  });
});
