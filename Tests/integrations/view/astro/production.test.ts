import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "astro";
import { describe, expect, it } from "vitest";
import { project } from "../../../helpers/project";

/** Build with Astro's actual production pipeline instead of mocking renderer hooks. */
async function buildAstro(root: string) {
  await build({ root: pathToFileURL(`${root}/`), logLevel: "silent" });
}

describe("Astro production islands", () => {
  it("produces a static View page with no client scripts or component bundle", async () => {
    const fixture = await project("astro-static");
    const previous = process.env.ASTRO_TELEMETRY_DISABLED;
    process.env.ASTRO_TELEMETRY_DISABLED = "1";
    try {
      await fixture.write(
        "astro.config.mjs",
        'import {defineConfig} from "astro/config"; import view from "@hedystia/astro"; export default defineConfig({integrations:[view()]});',
      );
      await fixture.write(
        "src/components/Static.tsx",
        "export default function Static(){ return <section><h1>STATIC_ASTRO_VIEW</h1><p>Zero client runtime</p></section>; }",
      );
      await fixture.write(
        "src/pages/index.astro",
        '---\nimport Static from "../components/Static";\n---\n<html lang="en"><head><title>Static</title></head><body><Static /></body></html>',
      );
      await buildAstro(fixture.root);
      const html = await readFile(join(fixture.root, "dist/index.html"), "utf8");
      expect(html).toContain("STATIC_ASTRO_VIEW");
      expect(html).not.toContain("<script");
      expect(html).not.toContain("astro-island");
    } finally {
      if (previous === undefined) {
        delete process.env.ASTRO_TELEMETRY_DISABLED;
      } else {
        process.env.ASTRO_TELEMETRY_DISABLED = previous;
      }
      await fixture.dispose();
    }
  }, 60_000);

  it("keeps the shell static and emits browser code only for client-directed components", async () => {
    const fixture = await project("astro-reactive");
    const previous = process.env.ASTRO_TELEMETRY_DISABLED;
    process.env.ASTRO_TELEMETRY_DISABLED = "1";
    try {
      await fixture.write(
        "astro.config.mjs",
        'import {defineConfig} from "astro/config"; import view from "@hedystia/astro"; export default defineConfig({integrations:[view()]});',
      );
      await fixture.write(
        "src/components/Static.tsx",
        "export default function Static(){return <h1>ASTRO_SERVER_ONLY_MARKER</h1>}",
      );
      await fixture.write(
        "src/components/Counter.tsx",
        'import {sig,set,val} from "@hedystia/view"; export default function Counter(){const n=sig(0);return <button onClick={()=>set(n,val(n)+1)}>Count: {()=>val(n)}</button>}',
      );
      await fixture.write(
        "src/pages/index.astro",
        '---\nimport Static from "../components/Static"; import Counter from "../components/Counter";\n---\n<Static /><Counter client:load /><Counter client:visible /><Counter client:only="@hedystia/astro" />',
      );
      await buildAstro(fixture.root);
      const html = await readFile(join(fixture.root, "dist/index.html"), "utf8");
      expect(html).toContain("ASTRO_SERVER_ONLY_MARKER");
      expect(html).toContain("astro-island");
      expect(html).toContain('client="visible"');
      expect(html).toContain("Count:");
      const files = await readdir(join(fixture.root, "dist/_astro"));
      const code = (
        await Promise.all(
          files
            .filter((file) => file.endsWith(".js"))
            .map((file) => readFile(join(fixture.root, "dist/_astro", file), "utf8")),
        )
      ).join("\n");
      expect(code).not.toContain("ASTRO_SERVER_ONLY_MARKER");
      expect(code).not.toContain("renderToString");
    } finally {
      if (previous === undefined) {
        delete process.env.ASTRO_TELEMETRY_DISABLED;
      } else {
        process.env.ASTRO_TELEMETRY_DISABLED = previous;
      }
      await fixture.dispose();
    }
  }, 60_000);
});
