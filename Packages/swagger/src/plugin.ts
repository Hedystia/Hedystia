import { Hedystia } from "hedystia";
import { Swagger, type SwaggerOptions } from "./swagger";

/**
 * Create Swagger plugin
 * @param {SwaggerOptions} [options] - Swagger options
 * @returns Plugin instance
 */
export function swagger(options: SwaggerOptions = {}) {
  const swaggerInstance = new Swagger(options);

  const swaggerApp = new Hedystia()
    .get("/", () => {
      return new Response(swaggerInstance.generateHTML(), {
        headers: { "Content-Type": "text/html" },
      });
    })
    .get("/json", () => {
      return swaggerInstance.getSpec();
    });

  function createPlugin(app: Hedystia<any, any>) {
    for (const route of app.routes) {
      swaggerInstance.addRoute(
        route.method,
        route.path,
        {
          params: route.schema.params,
          query: route.schema.query,
          headers: route.schema.headers,
          body: route.schema.body,
          response: route.schema.response,
        },
        route.schema.description || `${route.method} ${route.path}`,
        route.schema.description,
        route.schema.tags,
      );
    }

    for (const staticRoute of app.staticRoutes) {
      swaggerInstance.addRoute("GET", staticRoute.path, {}, `Static route ${staticRoute.path}`);
    }

    for (const [path] of app.wsRoutes) {
      swaggerInstance.addRoute("WS", path, {}, `WebSocket route ${path}`);
    }

    for (const [path, handlerData] of app.subscriptionHandlers) {
      swaggerInstance.addRoute(
        "SUB",
        path,
        {
          params: handlerData.schema.params,
          query: handlerData.schema.query,
          headers: handlerData.schema.headers,
        },
        handlerData.schema.description || `SUB ${path}`,
        handlerData.schema.description,
        handlerData.schema.tags,
      );
    }

    return swaggerApp;
  }

  return {
    plugin: createPlugin,
    swagger: swaggerInstance,
  };
}
