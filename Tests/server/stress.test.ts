import Framework, { h } from "hedystia";
import { describe, it } from "vitest";

describe("Stress test", () => {
  it("should run performance test", () => {
    // gc not available in Node.js

    const memory = process.memoryUsage().heapTotal / 1024 / 1024;

    const total = 500;
    const sub = 1;

    const app = new Framework();
    const plugin = new Framework();

    const responseHandler = () => "hi";
    const responseSchema = { response: h.string() };

    const paths = Array(total * sub);
    for (let i = 0; i < total * sub; i++) {
      paths[i] = `/${i}`;
    }

    const t1 = performance.now();

    const routeFn = plugin.get;
    for (let i = 0; i < paths.length; i++) {
      routeFn.call(plugin, paths[i], responseHandler, responseSchema);
    }

    app.use(plugin);

    const t2 = performance.now();

    // gc(true);
    const memoryAfter = process.memoryUsage().heapTotal / 1024 / 1024;
    const totalRoutes = paths.length;
    const totalTime = t2 - t1;
    const avgTimePerRoute = totalTime / totalRoutes;

    console.log(`${totalRoutes} routes took ${totalTime.toFixed(4)} ms`);
    console.log(`Average ${avgTimePerRoute.toFixed(4)} ms per route`);
    console.log(`${(memoryAfter - memory).toFixed(2)} MB memory used`);
  });
});
