import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPI } from "openapi-types";

export interface SwaggerOptions {
  title?: string;
  description?: string;
  version?: string;
  basePath?: string;
  schemes?: string[];
  consumes?: string[];
  produces?: string[];
  tags?: { name: string; description?: string }[];
  securityDefinitions?: Record<string, any>;
  externalDocs?: { description: string; url: string };
  host?: string;
}

export class Swagger {
  private spec: OpenAPI.Document = {
    openapi: "3.0.0",
    info: {
      title: "API Documentation",
      version: "1.0.0",
    },
    paths: {},
    components: {
      schemas: {},
    },
  } as OpenAPI.Document;
  host: string;

  constructor(options: SwaggerOptions = {}) {
    this.spec.info.title = options.title || "API Documentation";
    this.spec.info.description = options.description;
    this.spec.info.version = options.version || "1.0.0";
    this.host = options.host || "https://example.com";

    if (options.tags) {
      this.spec.tags = options.tags;
    }

    if (options.externalDocs) {
      this.spec.externalDocs = options.externalDocs;
    }

    if (options.securityDefinitions) {
      (this.spec as any).components = (this.spec as any).components || {};
      (this.spec as any).components.securitySchemes = options.securityDefinitions;
    }
  }

  addRoute(
    method: string,
    path: string,
    schema: any,
    summary?: string,
    description?: string,
    tags?: string[],
  ) {
    if (!schema) {
      return;
    }

    const normalizedPath = path.replace(/:([^/]+)/g, "{$1}");
    if (!this.spec.paths) {
      this.spec.paths = {};
    }
    if (!this.spec.paths[normalizedPath]) {
      this.spec.paths[normalizedPath] = {};
    }

    const methodLower = method.toLowerCase();
    const operationObject: any = {
      summary: summary || `${method} ${path}`,
      parameters: this.buildParameters(schema),
      requestBody: this.buildRequestBody(schema),
      responses: this.buildResponses(schema),
    };

    if (description) {
      operationObject.description = description;
    }

    if (tags) {
      operationObject.tags = tags;
    }

    (this.spec.paths as any)[normalizedPath][methodLower] = operationObject;
  }

  private extractJsonSchema(schema: any): any {
    if (!schema) {
      return {};
    }

    const js = schema.jsonSchema || schema;

    if (js.type || js.properties || js.$ref || js.items) {
      const standardProps = [
        "type",
        "properties",
        "required",
        "items",
        "enum",
        "nullable",
        "format",
        "description",
        "title",
        "default",
        "minimum",
        "maximum",
        "minLength",
        "maxLength",
        "pattern",
        "anyOf",
        "oneOf",
        "allOf",
        "not",
        "$ref",
        "additionalProperties",
      ];

      const filtered: any = {};
      for (const prop of standardProps) {
        if (js[prop] !== undefined) {
          filtered[prop] = js[prop];
        }
      }
      return filtered;
    }

    return {};
  }

  private buildParameters(schema: any) {
    const parameters: any[] = [];

    const paramsSchema = this.extractJsonSchema(schema.params);
    if (paramsSchema.properties) {
      Object.entries(paramsSchema.properties).forEach(([name, propSchema]: [string, any]) => {
        parameters.push({
          name,
          in: "path",
          required: paramsSchema.required?.includes(name) ?? true,
          schema: propSchema,
        });
      });
    }

    const querySchema = this.extractJsonSchema(schema.query);
    if (querySchema.properties) {
      Object.entries(querySchema.properties).forEach(([name, propSchema]: [string, any]) => {
        parameters.push({
          name,
          in: "query",
          required: querySchema.required?.includes(name) ?? false,
          schema: propSchema,
        });
      });
    }

    return parameters.length > 0 ? parameters : undefined;
  }

  private buildRequestBody(schema: any) {
    if (!schema.body) {
      return undefined;
    }

    try {
      const jsonSchema = this.extractJsonSchema(schema.body);
      return {
        required: true,
        content: {
          "application/json": {
            schema: jsonSchema,
          },
        },
      };
    } catch (e) {
      console.error("Failed to convert body schema:", e);
      return undefined;
    }
  }

  private buildResponses(schema: any) {
    const responses: Record<string, any> = {
      "200": {
        description: "Successful response",
      },
    };

    if (schema.response) {
      try {
        const jsonSchema = this.extractJsonSchema(schema.response);
        responses["200"].content = {
          "application/json": {
            schema: jsonSchema,
          },
        };
      } catch (e) {
        console.error("Failed to convert response schema:", e);
      }
    }

    return responses;
  }

  async validate() {
    try {
      await SwaggerParser.validate(this.spec as any);
      return true;
    } catch (error) {
      console.error("Swagger validation error:", error);
      return false;
    }
  }

  getSpec() {
    return this.spec;
  }

  generateHTML(): string {
    const hostname = new URL(this.host).hostname;

    const groupedPaths: Record<
      string,
      Array<{
        path: string;
        method: string;
        operation: any;
      }>
    > = {};

    const defaultGroup = "API";

    Object.entries(this.spec.paths || {}).forEach(([path, pathItem]: [string, any]) => {
      Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
        const tags = operation.tags || [defaultGroup];
        const primaryTag = tags[0];

        if (!groupedPaths[primaryTag]) {
          groupedPaths[primaryTag] = [];
        }

        groupedPaths[primaryTag].push({
          path,
          method: method.toUpperCase(),
          operation,
        });
      });
    });

    const sidebarSections = Object.entries(groupedPaths)
      .map(([tag, endpoints]) => {
        const endpointCount = endpoints.length;
        const endpointLinks = endpoints
          .map(({ path, method }) => {
            const operationId = `${method.toLowerCase()}-${path.replace(/[^a-zA-Z0-9]/g, "-")}`;
            return `<li><a href="#${operationId}" class="block px-3 py-1.5 rounded-lg hover:bg-dark-700/50 transition-colors text-sm text-gray-400 hover:text-white">${method} ${path}</a></li>`;
          })
          .join("\n                                ");

        return `
                    <div>
                        <button class="sidebar-group-toggle w-full flex items-center justify-between px-3 py-2 hover:bg-dark-700/30 rounded-lg transition-colors group" data-target="${tag.toLowerCase()}-group">
                            <div class="flex items-center space-x-2">
                                <h3 class="text-sm font-medium text-gray-300 group-hover:text-white">${tag}</h3>
                                <span class="text-xs text-gray-500 bg-dark-600 px-2 py-0.5 rounded-full">${endpointCount}</span>
                                <svg class="w-4 h-4 text-gray-400 transform transition-transform duration-200 group-hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                </svg>
                            </div>
                        </button>
                        <div id="${tag.toLowerCase()}-group" class="sidebar-group-content max-h-0 overflow-hidden transition-all duration-300">
                            <ul class="ml-6 mt-1 space-y-1">
                                ${endpointLinks}
                            </ul>
                        </div>
                    </div>

                    <div class="border-t border-dark-600 my-3"></div>`;
      })
      .join("");

    const contentSections = Object.entries(groupedPaths)
      .map(([tag, endpoints]) => {
        const tagDescription =
          this.spec.tags?.find((t) => t.name === tag)?.description ||
          `Manage ${tag.toLowerCase()} operations`;

        const endpointCards = endpoints
          .map(({ path, method, operation }) => {
            const operationId = `${method.toLowerCase()}-${path.replace(/[^a-zA-Z0-9]/g, "-")}`;
            const methodColor =
              {
                GET: "bg-green-600",
                POST: "bg-blue-600",
                PUT: "bg-yellow-600",
                DELETE: "bg-red-600",
                PATCH: "bg-purple-600",
                WS: "bg-indigo-600",
                SUB: "bg-pink-600",
              }[method] || "bg-gray-600";

            return `
                                        <a href="#${operationId}" class="block p-4 rounded-lg border border-dark-600 hover:border-blue-500 hover:bg-dark-700/30 transition-all group">
                                            <div class="flex items-center justify-between mb-2">
                                                <div class="flex items-center space-x-3">
                                                    <span class="${methodColor} text-white px-3 py-1 rounded-lg text-sm font-medium">${method}</span>
                                                    <code class="text-blue-400 font-mono">${path}</code>
                                                </div>
                                                <svg class="w-5 h-5 text-gray-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                                                </svg>
                                            </div>
                                            <p class="text-gray-300 text-sm">${operation.summary || operation.description || `${method} ${path} operation`}</p>
                                        </a>`;
          })
          .join("\n");

        const detailedEndpoints = endpoints
          .map(({ path, method, operation }) => {
            const operationId = `${method.toLowerCase()}-${path.replace(/[^a-zA-Z0-9]/g, "-")}`;
            const methodColor =
              {
                GET: "bg-green-600",
                POST: "bg-blue-600",
                PUT: "bg-yellow-600",
                DELETE: "bg-red-600",
                PATCH: "bg-purple-600",
                WS: "bg-indigo-600",
                SUB: "bg-pink-600",
              }[method] || "bg-gray-600";

            let parametersSection = "";
            if (operation.parameters && operation.parameters.length > 0) {
              const pathParams = operation.parameters.filter((p: any) => p.in === "path");
              const queryParams = operation.parameters.filter((p: any) => p.in === "query");

              if (pathParams.length > 0) {
                parametersSection += `
                                <div>
                                    <h4 class="text-lg font-semibold text-white mb-3">Path Parameters</h4>
                                    <div class="space-y-3">
                                        ${pathParams
                                          .map(
                                            (param: any) => `
                                        <div class="border border-dark-600 rounded-lg p-3">
                                            <div class="flex items-center justify-between mb-1">
                                                <code class="text-blue-400">${param.name}</code>
                                                <span class="text-xs ${param.required ? "text-red-400" : "text-gray-400"}">${param.required ? "required" : "optional"}</span>
                                            </div>
                                            <p class="text-sm text-gray-300">${param.description || `${param.name} parameter`}</p>
                                        </div>`,
                                          )
                                          .join("")}
                                    </div>
                                </div>`;
              }

              if (queryParams.length > 0) {
                parametersSection += `
                                <div>
                                    <h4 class="text-lg font-semibold text-white mb-3">Query Parameters</h4>
                                    <div class="space-y-3">
                                        ${queryParams
                                          .map(
                                            (param: any) => `
                                        <div class="border border-dark-600 rounded-lg p-3">
                                            <div class="flex items-center justify-between mb-1">
                                                <code class="text-blue-400">${param.name}</code>
                                                <span class="text-xs ${param.required ? "text-red-400" : "text-gray-400"}">${param.required ? "required" : "optional"}</span>
                                            </div>
                                            <p class="text-sm text-gray-300">${param.description || `${param.name} parameter`}</p>
                                        </div>`,
                                          )
                                          .join("")}
                                    </div>
                                </div>`;
              }
            }

            let requestBodySection = "";
            if (operation.requestBody) {
              const schema = operation.requestBody.content?.["application/json"]?.schema;
              const cleanSchema = this.extractJsonSchema(schema);

              if (cleanSchema.properties) {
                requestBodySection = `
                                <div>
                                    <h4 class="text-lg font-semibold text-white mb-3">Body Parameters</h4>
                                    <div class="space-y-3">
                                        ${Object.entries(cleanSchema.properties)
                                          .map(
                                            ([propName, propSchema]: [string, any]) => `
                                        <div class="border border-dark-600 rounded-lg p-3">
                                            <div class="flex items-center justify-between mb-1">
                                                <code class="text-blue-400">${propName}</code>
                                                <span class="text-xs ${cleanSchema.required?.includes(propName) ? "text-red-400" : "text-gray-400"}">${cleanSchema.required?.includes(propName) ? "required" : "optional"}</span>
                                            </div>
                                            <p class="text-sm text-gray-300">${propSchema.description || `${propName} field`}</p>
                                        </div>`,
                                          )
                                          .join("")}
                                    </div>
                                </div>`;
              }
            }

            const baseUrl = `https://${hostname}`;
            let requestExample = "";

            if (method !== "WS" && method !== "SUB") {
              let curlCommand = `curl -X ${method} '${baseUrl}${path}'`;

              if (operation.requestBody) {
                curlCommand += ` \\\n  -H 'Content-Type: application/json'`;
                const schema = operation.requestBody.content?.["application/json"]?.schema;
                const cleanSchema = this.extractJsonSchema(schema);

                if (cleanSchema.properties) {
                  const exampleData: Record<string, any> = {};
                  Object.entries(cleanSchema.properties).forEach(
                    ([propName, propSchema]: [string, any]) => {
                      if (propSchema.type === "string") {
                        exampleData[propName] =
                          propSchema.format === "email"
                            ? "user@example.com"
                            : `example ${propName}`;
                      } else if (propSchema.type === "number") {
                        exampleData[propName] = 123;
                      } else if (propSchema.type === "boolean") {
                        exampleData[propName] = true;
                      } else {
                        exampleData[propName] = `example ${propName}`;
                      }
                    },
                  );
                  curlCommand += ` \\\n  -d '${JSON.stringify(exampleData, null, 2).replace(/\n/g, "\\n  ")}'`;
                }
              }

              curlCommand += ` \\\n  -H 'Authorization: Bearer your-token'`;

              requestExample = `
                                <div>
                                    <div class="flex items-center justify-between mb-4">
                                        <h4 class="text-lg font-semibold text-white">Request Example</h4>
                                        <button class="copy-btn bg-dark-700 hover:bg-dark-600 px-3 py-1 rounded-lg text-sm transition-colors" data-copy="${curlCommand.replace(/'/g, "\\'")}">
                                            Copy
                                        </button>
                                    </div>
                                    <div class="code-block rounded-xl p-4 border border-dark-600">
                                        <pre class="text-sm text-gray-300 overflow-x-auto"><code>${curlCommand}</code></pre>
                                    </div>
                                </div>`;
            }

            let responseSection = "";
            const response200 = operation.responses?.["200"];
            if (response200?.content?.["application/json"]?.schema) {
              const schema = response200.content["application/json"].schema;
              const cleanSchema = this.extractJsonSchema(schema);

              responseSection = `
                                <div>
                                    <h4 class="text-lg font-semibold text-white mb-4">Response Schema</h4>
                                    <div class="code-block rounded-xl p-4 border border-dark-600">
                                        <pre class="text-sm text-gray-300 overflow-x-auto"><code>${JSON.stringify(cleanSchema, null, 2)}</code></pre>
                                    </div>
                                </div>`;
            }

            return `
                    <section id="${operationId}" class="fade-in">
                        <div class="grid lg:grid-cols-3 gap-8">
                            <div class="lg:col-span-1 space-y-6">
                                <div>
                                    <div class="flex items-center space-x-3 mb-4">
                                        <span class="${methodColor} text-white px-3 py-1 rounded-lg text-sm font-medium">${method}</span>
                                        <code class="text-blue-400 font-mono">${path}</code>
                                    </div>
                                    <p class="text-gray-300">${operation.description || operation.summary || `${method} ${path} operation`}</p>
                                </div>

                                ${parametersSection}
                                ${requestBodySection}

                                <div>
                                    <h4 class="text-lg font-semibold text-white mb-3">Headers</h4>
                                    <div class="border border-dark-600 rounded-lg p-3">
                                        <div class="flex items-center justify-between mb-1">
                                            <code class="text-blue-400">Authorization</code>
                                            <span class="text-xs text-red-400">required</span>
                                        </div>
                                        <p class="text-sm text-gray-300">Bearer token for authentication</p>
                                    </div>
                                </div>

                                <div>
                                    <h4 class="text-lg font-semibold text-white mb-3">Responses</h4>
                                    <div class="space-y-2">
                                        ${Object.entries(operation.responses || {})
                                          .map(([code, response]: [string, any]) => {
                                            const statusColor = code.startsWith("2")
                                              ? "bg-green-600"
                                              : code.startsWith("4")
                                                ? "bg-red-600"
                                                : "bg-yellow-600";
                                            return `
                                        <div class="flex items-center space-x-3">
                                            <span class="${statusColor} text-white px-2 py-1 rounded text-xs">${code}</span>
                                            <span class="text-gray-300 text-sm">${response.description || "Response"}</span>
                                        </div>`;
                                          })
                                          .join("")}
                                    </div>
                                </div>
                            </div>

                            <div class="lg:col-span-2 space-y-6">
                                ${requestExample}
                                ${responseSection}
                            </div>
                        </div>
                    </section>`;
          })
          .join("\n");

        return `
                    <section id="${tag.toLowerCase()}-tag" class="fade-in">
                        <div class="grid lg:grid-cols-3 gap-8 mb-12">
                            <div class="lg:col-span-1">
                                <div class="sticky top-24">
                                    <h2 class="text-3xl font-bold text-white mb-4">${tag}</h2>
                                    <p class="text-gray-300 text-lg leading-relaxed">
                                        ${tagDescription}
                                    </p>
                                    <div class="mt-6 flex items-center space-x-2">
                                        <span class="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">${endpoints.length} endpoints</span>
                                        <span class="bg-gray-600 text-white px-3 py-1 rounded-full text-sm font-medium">Authentication required</span>
                                    </div>
                                </div>
                            </div>

                            <div class="lg:col-span-2">
                                <div class="bg-dark-800/30 backdrop-blur-sm rounded-xl p-6 border border-dark-700">
                                    <h3 class="text-xl font-semibold text-white mb-6">Available Endpoints</h3>
                                    <div class="space-y-4">
                                        ${endpointCards}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <hr class="border-dark-600">

                    <div class="space-y-16">
                        ${detailedEndpoints}
                    </div>`;
      })
      .join("\n\n");

    return `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.spec.info.title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        dark: {
                            50: '#f8fafc',
                            100: '#f1f5f9',
                            200: '#e2e8f0',
                            300: '#cbd5e1',
                            400: '#94a3b8',
                            500: '#64748b',
                            600: '#475569',
                            700: '#334155',
                            800: '#1e293b',
                            900: '#0f172a',
                        }
                    }
                }
            }
        }
    </script>
    <style>
        .sidebar-transition {
            transition: transform 0.3s ease-in-out, width 0.3s ease-in-out;
        }
        .fade-in {
            animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .code-block {
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
        }
    </style>
</head>
<body class="bg-dark-900 text-gray-100 font-sans">

    <nav class="fixed top-0 left-0 right-0 z-50 bg-dark-900/80 backdrop-blur-md border-b border-dark-700">
        <div class="flex items-center justify-between px-4 py-3">
            <div class="flex items-center space-x-4">
                <button id="sidebarToggle" class="p-2 rounded-lg hover:bg-dark-700 transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                    </svg>
                </button>
                <h1 class="text-xl font-bold text-blue-400">${this.spec.info.title}</h1>
            </div>

            <div class="flex items-center space-x-4">
                <!-- <select id="languageSelect" class="bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                    <option value="shell">Shell</option>
                    <option value="nodejs">Node.js</option>
                </select> -->

                <button id="themeToggle" class="p-2 rounded-lg hover:bg-dark-700 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
                    </svg>
                </button>
            </div>
        </div>
    </nav>

    <div class="flex pt-16">

        <aside id="sidebar" class="fixed top-16 bottom-0 left-0 z-40 w-64 bg-dark-800/50 backdrop-blur-sm border-r border-dark-700 sidebar-transition transform translate-x-0">
            <div class="p-4 h-full overflow-y-auto pt-6">
                <div class="space-y-1">
                    ${sidebarSections}
                </div>
            </div>
        </aside>

        <div id="sidebarOverlay" class="fixed top-16 bottom-0 left-0 right-0 bg-black/50 z-30 lg:hidden hidden"></div>

        <main id="mainContent" class="flex-1 ml-64 transition-all duration-300">
            <div class="max-w-7xl mx-auto px-4 py-8">

                <div class="mb-12 fade-in">
                    <h1 class="text-4xl font-bold text-white mb-4">${this.spec.info.title}</h1>
                    <p class="text-xl text-gray-300 mb-4">${this.spec.info.description || "Complete reference for our REST API"}</p>
                    <span class="inline-block bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">v${this.spec.info.version}</span>
                </div>

                <div class="grid gap-8 mb-12 fade-in">
                  <div class="bg-dark-800/30 backdrop-blur-sm rounded-xl p-6 border border-dark-700">
                      <h3 class="text-xl font-semibold text-white mb-4">Server</h3>
                      <div class="space-y-3">
                          <a href="${this.host}" target="_blank" class="flex items-center space-x-3 hover:bg-dark-700/30 p-2 rounded-lg transition-colors group">
                              <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                  <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                  </svg>
                              </div>
                              <span class="text-gray-300 group-hover:text-white transition-colors">${this.host}</span>
                          </a>
                      </div>
                  </div>
              </div>

                <div class="space-y-20">
                    ${contentSections}
                </div>
            </div>
        </main>
    </div>

    <script>
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const mainContent = document.getElementById('mainContent');
        const themeToggle = document.getElementById('themeToggle');
        const html = document.documentElement;

        themeToggle.addEventListener('click', () => {
            if (html.classList.contains('dark')) {
                html.classList.remove('dark');
                html.classList.add('light');
                document.body.className = 'bg-gray-50 text-gray-900 font-sans';

                const navbar = document.querySelector('nav');
                navbar.className = 'fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200';

                const sidebar = document.getElementById('sidebar');
                sidebar.className = sidebar.className.replace('bg-dark-800/50 backdrop-blur-sm border-r border-dark-700', 'bg-white/50 backdrop-blur-sm border-r border-gray-200');

                document.querySelectorAll('h1, h2, h3, h4').forEach(heading => {
                    heading.classList.remove('text-white', 'text-gray-100');
                    heading.classList.add('text-gray-900');
                });

                document.querySelectorAll('.text-gray-300').forEach(el => {
                    el.classList.remove('text-gray-300');
                    el.classList.add('text-gray-700');
                });

                document.querySelectorAll('.text-gray-400').forEach(el => {
                    el.classList.remove('text-gray-400');
                    el.classList.add('text-gray-600');
                });

                document.querySelectorAll('.border-dark-600').forEach(el => {
                    el.classList.remove('border-dark-600');
                    el.classList.add('border-gray-300');
                });

                document.querySelectorAll('.bg-dark-700\\/30').forEach(el => {
                    el.classList.remove('bg-dark-700/30');
                    el.classList.add('bg-gray-100/30');
                });

                document.querySelectorAll('.bg-dark-800\\/20').forEach(el => {
                    el.classList.remove('bg-dark-800/20');
                    el.classList.add('bg-gray-50/20');
                });

                document.querySelectorAll('.bg-dark-600').forEach(el => {
                    el.classList.remove('bg-dark-600');
                    el.classList.add('bg-gray-400');
                });

                document.querySelectorAll('.text-gray-500').forEach(el => {
                    el.classList.remove('text-gray-500');
                    el.classList.add('text-gray-600');
                });

                document.querySelectorAll('aside a').forEach(link => {
                    link.classList.add('text-gray-700', 'hover:text-gray-900', 'hover:bg-gray-100');
                });

                document.querySelectorAll('pre code').forEach(code => {
                    code.classList.remove('text-gray-300');
                    code.classList.add('text-gray-800');
                });

                document.querySelectorAll('.bg-dark-800\\/30').forEach(el => {
                    el.classList.remove('bg-dark-800/30', 'border-dark-700');
                    el.classList.add('bg-white/30', 'border-gray-200');
                });

                document.querySelectorAll('.code-block').forEach(el => {
                    el.style.background = 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
                    el.classList.remove('border-dark-600');
                    el.classList.add('border-gray-300');
                });

                document.querySelectorAll('.border-dark-600').forEach(el => {
                    el.classList.remove('border-dark-600');
                    el.classList.add('border-gray-300');
                });

            } else {
                html.classList.remove('light');
                html.classList.add('dark');
                document.body.className = 'bg-dark-900 text-gray-100 font-sans';

                const navbar = document.querySelector('nav');
                navbar.className = 'fixed top-0 left-0 right-0 z-50 bg-dark-900/80 backdrop-blur-md border-b border-dark-700';

                const sidebar = document.getElementById('sidebar');
                sidebar.className = sidebar.className.replace('bg-white/50 backdrop-blur-sm border-r border-gray-200', 'bg-dark-800/50 backdrop-blur-sm border-r border-dark-700');

                document.querySelectorAll('h1, h2, h3, h4').forEach(heading => {
                    heading.classList.remove('text-gray-900');
                    heading.classList.add('text-white');
                });

                document.querySelectorAll('.text-gray-700').forEach(el => {
                    el.classList.remove('text-gray-700');
                    el.classList.add('text-gray-300');
                });

                document.querySelectorAll('.text-gray-600').forEach(el => {
                    el.classList.remove('text-gray-600');
                    el.classList.add('text-gray-400');
                });

                document.querySelectorAll('.border-gray-300').forEach(el => {
                    el.classList.remove('border-gray-300');
                    el.classList.add('border-dark-600');
                });

                document.querySelectorAll('.bg-gray-100\\/30').forEach(el => {
                    el.classList.remove('bg-gray-100/30');
                    el.classList.add('bg-dark-700/30');
                });

                document.querySelectorAll('.bg-gray-50\\/20').forEach(el => {
                    el.classList.remove('bg-gray-50/20');
                    el.classList.add('bg-dark-800/20');
                });

                document.querySelectorAll('.bg-gray-400').forEach(el => {
                    el.classList.remove('bg-gray-400');
                    el.classList.add('bg-dark-600');
                });

                document.querySelectorAll('.text-gray-600').forEach(el => {
                    el.classList.remove('text-gray-600');
                    el.classList.add('text-gray-500');
                });

                document.querySelectorAll('aside a').forEach(link => {
                    link.classList.remove('text-gray-700', 'hover:text-gray-900', 'hover:bg-gray-100');
                });

                document.querySelectorAll('pre code').forEach(code => {
                    code.classList.remove('text-gray-800');
                    code.classList.add('text-gray-300');
                });

                document.querySelectorAll('.bg-white\\/30').forEach(el => {
                    el.classList.remove('bg-white/30', 'border-gray-200');
                    el.classList.add('bg-dark-800/30', 'border-dark-700');
                });

                document.querySelectorAll('.code-block').forEach(el => {
                    el.style.background = 'linear-gradient(135deg, #1e293b 0%, #334155 100%)';
                    el.classList.remove('border-gray-300');
                    el.classList.add('border-dark-600');
                });

                document.querySelectorAll('.border-gray-300').forEach(el => {
                    el.classList.remove('border-gray-300');
                    el.classList.add('border-dark-600');
                });
            }
        });

        function toggleSidebar() {
            const isHidden = sidebar.classList.contains('-translate-x-full');

            if (isHidden) {
                sidebar.classList.remove('-translate-x-full');
                mainContent.classList.remove('ml-0');
                mainContent.classList.add('ml-64');
            } else {
                sidebar.classList.add('-translate-x-full');
                mainContent.classList.remove('ml-64');
                mainContent.classList.add('ml-0');
            }

            if (window.innerWidth < 1024) {
                sidebarOverlay.classList.toggle('hidden');
            }
        }

        sidebarToggle.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', toggleSidebar);

        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const textToCopy = btn.getAttribute('data-copy');
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    btn.textContent = 'Copied!';
                    setTimeout(() => {
                        btn.textContent = 'Copy';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy text: ', err);
                }
            });
        });

        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });

                    if (window.innerWidth < 1024) {
                        toggleSidebar();
                    }
                }
            });
        });

        document.querySelectorAll('.sidebar-group-toggle').forEach(button => {
            button.addEventListener('click', () => {
                const targetId = button.getAttribute('data-target');
                const targetGroup = document.getElementById(targetId);
                const arrow = button.querySelector('svg');

                if (targetGroup.style.maxHeight && targetGroup.style.maxHeight !== '0px') {
                    targetGroup.style.maxHeight = '0px';
                    arrow.style.transform = 'rotate(0deg)';
                } else {
                    targetGroup.style.maxHeight = targetGroup.scrollHeight + 'px';
                    arrow.style.transform = 'rotate(180deg)';
                }
            });
        });

        document.querySelectorAll('.sidebar-group-content').forEach(group => {
            group.style.maxHeight = group.scrollHeight + 'px';
        });
        document.querySelectorAll('.sidebar-group-toggle svg').forEach(arrow => {
            arrow.style.transform = 'rotate(180deg)';
        });

        function handleResize() {
            if (window.innerWidth < 1024) {
                sidebar.classList.add('-translate-x-full');
                mainContent.classList.remove('ml-64');
                mainContent.classList.add('ml-0');
            } else {
                if (!sidebar.hasAttribute('data-manually-hidden')) {
                    sidebar.classList.remove('-translate-x-full');
                    mainContent.classList.remove('ml-0');
                    mainContent.classList.add('ml-64');
                }
                sidebarOverlay.classList.add('hidden');
            }
        }

        window.addEventListener('resize', handleResize);
        handleResize();
    </script>
</body>
</html>`;
  }
}
