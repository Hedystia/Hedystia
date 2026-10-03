import { BetterAuthError } from "better-auth";
import { type CleanedWhere, createAdapterFactory } from "better-auth/adapters";
import type { Where } from "better-auth/types";
import * as fs from "fs";
import * as path from "path";

type FieldAttribute = {
  type: string | string[];
  required?: boolean;
  unique?: boolean;
  index?: boolean;
  bigint?: boolean;
  fieldName?: string;
  defaultValue?: unknown | (() => unknown);
  onUpdate?: () => unknown;
  references?: {
    model: string;
    field: string;
    onDelete?: "no action" | "restrict" | "cascade" | "set null" | "set default";
  };
};

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toCamelCase(value: string): string {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function mapFieldTypeToColumnBuilder(fieldType: string | string[], field: FieldAttribute): string {
  const typeStr = Array.isArray(fieldType) ? fieldType[0] || "string" : fieldType;

  switch (typeStr) {
    case "string":
      return "varchar(255)";
    case "number":
      return field.bigint ? "bigint()" : "integer()";
    case "boolean":
      return "boolean()";
    case "date":
      return "datetime()";
    default:
      return "text()";
  }
}

function formatDefaultValue(field: FieldAttribute): string | null {
  if (field.defaultValue === undefined) {
    return null;
  }

  if (typeof field.defaultValue === "function") {
    if ((Array.isArray(field.type) ? field.type[0] : field.type) === "date") {
      return ".default(new Date())";
    }
    return null;
  }

  if (typeof field.defaultValue === "string") {
    return `.default(${JSON.stringify(field.defaultValue)})`;
  }

  if (typeof field.defaultValue === "number" || typeof field.defaultValue === "boolean") {
    return `.default(${String(field.defaultValue)})`;
  }

  return null;
}

function generateSchemaFile(
  modelName: string,
  modelSchema: {
    modelName: string;
    fields: Record<string, FieldAttribute>;
  },
  _allModels: string[],
): string {
  const tableName = modelSchema.modelName;
  const varName = toCamelCase(modelName);

  const imports = new Set<string>();
  imports.add("table");

  const referencedModels: Array<{ varName: string; fileName: string }> = [];

  for (const field of Object.values(modelSchema.fields)) {
    const typeStr = Array.isArray(field.type) ? field.type[0] || "string" : field.type;
    switch (typeStr) {
      case "string":
        imports.add("varchar");
        break;
      case "number":
        imports.add(field.bigint ? "bigint" : "integer");
        break;
      case "boolean":
        imports.add("boolean");
        break;
      case "date":
        imports.add("datetime");
        break;
      default:
        imports.add("text");
        break;
    }

    if (field.references) {
      const refVar = toCamelCase(field.references.model);
      if (refVar !== varName) {
        referencedModels.push({
          varName: refVar,
          fileName: `./${toCamelCase(field.references.model)}`,
        });
      }
    }
  }

  let code = `import { ${Array.from(imports).sort().join(", ")} } from "@hedystia/db";\n`;
  for (const ref of referencedModels) {
    code += `import { ${ref.varName} } from "${ref.fileName}";\n`;
  }
  code += "\n";

  code += `export const ${varName} = table("${tableName}", {\n`;
  code += "  id: varchar(255).primaryKey(),\n";

  for (const [fieldName, field] of Object.entries(modelSchema.fields)) {
    const dbField = field.fieldName || fieldName;
    const columnType = mapFieldTypeToColumnBuilder(field.type, field);

    let chain = columnType;

    if (dbField !== fieldName) {
      chain += `.name("${dbField}")`;
    }

    if (field.required) {
      chain += ".notNull()";
    }

    if (field.unique || dbField === "email" || dbField === "token") {
      chain += ".unique()";
    }

    const defaultVal = formatDefaultValue(field);
    if (defaultVal) {
      chain += defaultVal;
    }

    if (field.references) {
      const refVar = toCamelCase(field.references.model);
      chain += `.references(() => ${refVar}.id)`;
    }

    code += `  ${fieldName}: ${chain},\n`;
  }

  code += "});\n";
  return code;
}

function generateMigrationFile(
  modelName: string,
  modelSchema: {
    modelName: string;
    fields: Record<string, FieldAttribute>;
  },
  timestamp: number,
  action: "create" | "alter",
  changes?: {
    addColumns?: { name: string; field: FieldAttribute }[];
    dropColumns?: string[];
  },
): string {
  const tableName = modelSchema.modelName;
  const migrationName = `${action}_${modelName}_${timestamp}`;
  const varName = toCamelCase(modelName);

  let code = `import { migration } from "@hedystia/db";\n`;
  code += `import { ${varName} } from "../schemas/${toCamelCase(modelName)}";\n\n`;

  code += `export default migration("${migrationName}", {\n`;
  code += "  async up(ctx) {\n";

  if (action === "create") {
    code += `    await ctx.schema.createTable(${varName});\n`;
  } else if (action === "alter" && changes) {
    if (changes.addColumns) {
      for (const { name, field } of changes.addColumns) {
        const dbField = field.fieldName || name;
        const typeStr = Array.isArray(field.type) ? field.type[0] || "string" : field.type;
        let colType: string;
        switch (typeStr) {
          case "string":
            colType = "varchar";
            break;
          case "number":
            colType = field.bigint ? "bigint" : "integer";
            break;
          case "boolean":
            colType = "boolean";
            break;
          case "date":
            colType = "datetime";
            break;
          default:
            colType = "text";
            break;
        }
        code += `    await ctx.schema.addColumn("${tableName}", "${dbField}", {\n`;
        code += `      name: "${dbField}",\n`;
        code += `      type: "${colType}",\n`;
        code += "      primaryKey: false,\n";
        code += "      autoIncrement: false,\n";
        code += `      notNull: ${!!field.required},\n`;
        code += `      unique: ${!!(field.unique || dbField === "email" || dbField === "token")},\n`;
        code += "      defaultValue: undefined,\n";
        code += "    });\n";
      }
    }
    if (changes.dropColumns) {
      for (const col of changes.dropColumns) {
        code += `    await ctx.schema.dropColumn("${tableName}", "${col}");\n`;
      }
    }
  }

  code += "  },\n";
  code += "  async down(ctx) {\n";

  if (action === "create") {
    code += `    await ctx.schema.dropTable("${tableName}");\n`;
  } else if (action === "alter" && changes) {
    if (changes.addColumns) {
      for (const { name, field } of changes.addColumns) {
        code += `    await ctx.schema.dropColumn("${tableName}", "${field.fieldName || name}");\n`;
      }
    }
    if (changes.dropColumns) {
      for (const col of changes.dropColumns) {
        code += `    await ctx.schema.addColumn("${tableName}", "${col}", {\n`;
        code += `      name: "${col}",\n`;
        code += `      type: "text",\n`;
        code += "      primaryKey: false,\n";
        code += "      autoIncrement: false,\n";
        code += "      notNull: false,\n";
        code += "      unique: false,\n";
        code += "      defaultValue: undefined,\n";
        code += "    });\n";
      }
    }
  }

  code += "  },\n";
  code += "});\n";

  return code;
}

export interface HedystiaAdapterOptions {
  outputDir?: string;
  schemasDir?: string;
  migrationsDir?: string;
  usePlural?: boolean;
  debugLogs?: boolean;
}

export const hedystiaAdapter = (db: any, options?: HedystiaAdapterOptions) =>
  createAdapterFactory({
    config: {
      adapterId: "hedystia-db",
      adapterName: "Hedystia DB",
      usePlural: options?.usePlural ?? false,
      debugLogs: options?.debugLogs ?? false,
      supportsJSON: false,
      supportsDates: false,
      supportsBooleans: false,
      supportsNumericIds: false,
    },
    adapter: ({
      getModelName,
      getDefaultModelName,
      transformInput,
      transformOutput,
      transformWhereClause,
    }) => {
      async function ensureTableAndColumns(
        model: string,
        data: Record<string, unknown>,
      ): Promise<void> {
        const driver = db.getDriver();
        const tableName = getModelName(model);
        const exists = await driver.tableExists(tableName);
        if (!exists) {
          const columns: any[] = [
            {
              name: "id",
              type: "varchar",
              primaryKey: true,
              autoIncrement: false,
              notNull: true,
              unique: true,
              defaultValue: undefined,
              length: 255,
            },
          ];
          for (const [key, value] of Object.entries(data)) {
            if (key === "id") {
              continue;
            }
            columns.push({
              name: key,
              type:
                typeof value === "boolean"
                  ? "boolean"
                  : typeof value === "number"
                    ? "integer"
                    : value instanceof Date
                      ? "datetime"
                      : "text",
              primaryKey: false,
              autoIncrement: false,
              notNull: false,
              unique: key === "email" || key === "token",
              defaultValue: undefined,
            });
          }
          await driver.createTable({ name: tableName, columns });
        } else {
          const existingCols = await driver.getTableColumns(tableName);
          const existingNames = new Set(existingCols.map((c: any) => c.name));
          for (const [key, value] of Object.entries(data)) {
            if (existingNames.has(key)) {
              continue;
            }
            await driver.addColumn(tableName, {
              name: key,
              type:
                typeof value === "boolean"
                  ? "boolean"
                  : typeof value === "number"
                    ? "integer"
                    : value instanceof Date
                      ? "datetime"
                      : "text",
              primaryKey: false,
              autoIncrement: false,
              notNull: false,
              unique: key === "email" || key === "token",
              defaultValue: undefined,
            });
          }
        }
      }

      async function disableForeignKeys() {
        const driver = db.getDriver();
        const dialect = driver.dialect;
        if (dialect === "sqlite") {
          await driver.execute("PRAGMA foreign_keys = OFF");
        } else if (dialect === "mysql") {
          await driver.execute("SET FOREIGN_KEY_CHECKS = 0");
        }
      }

      async function enableForeignKeys() {
        const driver = db.getDriver();
        const dialect = driver.dialect;
        if (dialect === "sqlite") {
          await driver.execute("PRAGMA foreign_keys = ON");
        } else if (dialect === "mysql") {
          await driver.execute("SET FOREIGN_KEY_CHECKS = 1");
        }
      }

      function buildWhereSql(model: string, action: string, where?: CleanedWhere[] | Where[]) {
        const cleaned = where?.length
          ? transformWhereClause({ model, where: where as Where[], action: action as any })
          : [];

        return buildCleanedWhereSql(cleaned);
      }

      function buildCleanedWhereSql(cleaned: CleanedWhere[]) {
        if (!cleaned.length) {
          return { sql: "", params: [] as unknown[] };
        }

        const params: unknown[] = [];
        const parts: string[] = [];

        for (let i = 0; i < cleaned.length; i++) {
          const w = cleaned[i]!;
          const prefix = i === 0 ? "" : ` ${w.connector ?? "AND"} `;
          const col = `\`${w.field}\``;

          const push = (value: unknown) => {
            const v =
              value instanceof Date
                ? value.toISOString()
                : typeof value === "object" && value !== null
                  ? JSON.stringify(value)
                  : value;
            params.push(v);
            return "?";
          };

          switch (w.operator ?? "eq") {
            case "eq":
              if (w.value === null || w.value === undefined) {
                parts.push(`${prefix}${col} IS NULL`);
              } else {
                parts.push(`${prefix}${col} = ${push(w.value)}`);
              }
              break;
            case "ne":
              if (w.value === null || w.value === undefined) {
                parts.push(`${prefix}${col} IS NOT NULL`);
              } else {
                parts.push(`${prefix}${col} <> ${push(w.value)}`);
              }
              break;
            case "lt":
              parts.push(`${prefix}${col} < ${push(w.value)}`);
              break;
            case "lte":
              parts.push(`${prefix}${col} <= ${push(w.value)}`);
              break;
            case "gt":
              parts.push(`${prefix}${col} > ${push(w.value)}`);
              break;
            case "gte":
              parts.push(`${prefix}${col} >= ${push(w.value)}`);
              break;
            case "contains":
              parts.push(`${prefix}${col} LIKE ${push(`%${String(w.value)}%`)}`);
              break;
            case "starts_with":
              parts.push(`${prefix}${col} LIKE ${push(`${String(w.value)}%`)}`);
              break;
            case "ends_with":
              parts.push(`${prefix}${col} LIKE ${push(`%${String(w.value)}`)}`);
              break;
            case "in": {
              const values = Array.isArray(w.value) ? w.value : [];
              if (!values.length) {
                parts.push(`${prefix}1 = 0`);
              } else {
                const placeholders = values.map((v) => push(v)).join(", ");
                parts.push(`${prefix}${col} IN (${placeholders})`);
              }
              break;
            }
            case "not_in": {
              const values = Array.isArray(w.value) ? w.value : [];
              if (!values.length) {
                parts.push(`${prefix}1 = 1`);
              } else {
                const placeholders = values.map((v) => push(v)).join(", ");
                parts.push(`${prefix}${col} NOT IN (${placeholders})`);
              }
              break;
            }
            default:
              parts.push(`${prefix}${col} = ${push(w.value)}`);
              break;
          }
        }

        return {
          sql: ` WHERE ${parts.join("")}`,
          params,
        };
      }

      return {
        async create<T>({ model, data, select }: { model: string; data: T; select?: string[] }) {
          const defaultModelName = getDefaultModelName(model);
          const transformedData = await transformInput(
            data as Record<string, unknown>,
            defaultModelName,
            "create",
          );

          try {
            await ensureTableAndColumns(model, transformedData as Record<string, unknown>);
          } catch {}

          const driver = db.getDriver();
          const tableName = getModelName(model);
          const keys = Object.keys(transformedData as Record<string, unknown>);
          const values = Object.values(transformedData as Record<string, unknown>).map((v) => {
            if (v instanceof Date) {
              return v.toISOString();
            }
            if (typeof v === "object" && v !== null) {
              return JSON.stringify(v);
            }
            return v;
          });
          const placeholders = keys.map(() => "?").join(", ");
          const cols = keys.map((k) => `\`${k}\``).join(", ");

          await disableForeignKeys();
          try {
            await driver.execute(
              `INSERT INTO \`${tableName}\` (${cols}) VALUES (${placeholders})`,
              values,
            );
          } finally {
            await enableForeignKeys();
          }

          const rows = await driver.query(`SELECT * FROM \`${tableName}\` WHERE \`id\` = ?`, [
            (transformedData as any).id,
          ]);
          const row = rows[0];
          if (!row) {
            throw new BetterAuthError(`Failed to create ${model}: row not found after insert`);
          }

          return transformOutput(row, defaultModelName, select) as T;
        },

        async findOne<T>({
          model,
          where,
          select,
        }: {
          model: string;
          where: Required<Where>[];
          select?: string[];
        }) {
          const defaultModelName = getDefaultModelName(model);
          const tableName = getModelName(model);
          const driver = db.getDriver();

          const { sql: whereSql, params } = buildWhereSql(model, "findOne", where);

          const rows = await driver.query(
            `SELECT * FROM \`${tableName}\`${whereSql} LIMIT 1`,
            params,
          );
          if (!rows[0]) {
            return null;
          }
          return transformOutput(rows[0], defaultModelName, select) as T;
        },

        async findMany<T>({
          model,
          where,
          limit,
          sortBy,
          offset,
        }: {
          model: string;
          where?: Required<Where>[];
          limit: number;
          select?: string[];
          sortBy?: { field: string; direction: "asc" | "desc" };
          offset?: number;
        }) {
          const defaultModelName = getDefaultModelName(model);
          const tableName = getModelName(model);
          const driver = db.getDriver();

          const { sql: whereSql, params } = buildWhereSql(model, "findMany", where);

          let query = `SELECT * FROM \`${tableName}\`${whereSql}`;

          if (sortBy?.field) {
            query += ` ORDER BY \`${sortBy.field}\` ${sortBy.direction === "desc" ? "DESC" : "ASC"}`;
          }

          query += ` LIMIT ${limit || 100}`;

          if (offset) {
            query += ` OFFSET ${offset}`;
          }

          let rows: any[];
          try {
            rows = await driver.query(query, params);
          } catch {
            return [];
          }
          const transformed = await Promise.all(
            rows.map((row: any) => transformOutput(row, defaultModelName)),
          );
          return transformed as T[];
        },

        async update<T>({
          model,
          where,
          update: updateData,
        }: {
          model: string;
          where: Required<Where>[];
          update: T;
        }) {
          const defaultModelName = getDefaultModelName(model);
          const tableName = getModelName(model);
          const driver = db.getDriver();

          const transformedData = await transformInput(
            updateData as Record<string, unknown>,
            defaultModelName,
            "update",
          );

          try {
            await ensureTableAndColumns(model, transformedData as Record<string, unknown>);
          } catch {}

          const { sql: whereSql, params: whereParams } = buildWhereSql(model, "update", where);

          const existing = await driver.query(
            `SELECT * FROM \`${tableName}\`${whereSql} LIMIT 1`,
            whereParams,
          );

          if (!existing[0]) {
            return null;
          }

          const setEntries = Object.entries(transformedData as Record<string, unknown>).filter(
            ([, v]) => v !== undefined,
          );
          if (setEntries.length === 0) {
            return transformOutput(existing[0], defaultModelName) as T;
          }

          const setClauses = setEntries.map(([k]) => `\`${k}\` = ?`).join(", ");
          const setValues = setEntries.map(([, v]) => {
            if (v instanceof Date) {
              return v.toISOString();
            }
            if (typeof v === "object" && v !== null) {
              return JSON.stringify(v);
            }
            return v;
          });

          await disableForeignKeys();
          try {
            await driver.execute(`UPDATE \`${tableName}\` SET ${setClauses} WHERE \`id\` = ?`, [
              ...setValues,
              existing[0].id,
            ]);
          } finally {
            await enableForeignKeys();
          }

          const result = await driver.query(`SELECT * FROM \`${tableName}\` WHERE \`id\` = ?`, [
            existing[0].id,
          ]);

          if (result[0]) {
            return transformOutput(result[0], defaultModelName) as T;
          }
          return null;
        },

        async updateMany({ model, where, update: updateData }) {
          const defaultModelName = getDefaultModelName(model);
          const tableName = getModelName(model);
          const driver = db.getDriver();

          const transformedData = await transformInput(
            updateData as Record<string, unknown>,
            defaultModelName,
            "update",
          );

          const setEntries = Object.entries(transformedData as Record<string, unknown>).filter(
            ([, v]) => v !== undefined,
          );
          if (setEntries.length === 0) {
            return 0;
          }

          const setClauses = setEntries.map(([k]) => `\`${k}\` = ?`).join(", ");
          const setValues = setEntries.map(([, v]) => {
            if (v instanceof Date) {
              return v.toISOString();
            }
            if (typeof v === "object" && v !== null) {
              return JSON.stringify(v);
            }
            return v;
          });

          const { sql: whereSql, params: whereParams } = buildWhereSql(model, "updateMany", where);

          await disableForeignKeys();
          try {
            const result = await driver.execute(
              `UPDATE \`${tableName}\` SET ${setClauses}${whereSql}`,
              [...setValues, ...whereParams],
            );
            return result?.changes ?? result?.affectedRows ?? 0;
          } finally {
            await enableForeignKeys();
          }
        },

        async incrementOne({ model, where, increment, set }) {
          const tableName = getModelName(model);
          const driver = db.getDriver();
          const { sql: whereSql, params: whereParams } = buildCleanedWhereSql(where);
          const incrementEntries = Object.entries(increment ?? {}) as [string, number][];
          const incrementFields = new Set(incrementEntries.map(([field]) => field));
          const setEntries = Object.entries(set ?? {}).filter(
            ([field, value]) => value !== undefined && !incrementFields.has(field),
          );
          const prepareUpdate = (row: Record<string, unknown>) => {
            const assignments = setEntries.map(([field]) => `\`${field}\` = ?`);
            const values = setEntries.map(([, value]) => value);
            const updated = { ...row };

            for (const [field, delta] of incrementEntries) {
              const current = row[field] == null ? 0 : Number(row[field]);
              const next = current + delta;
              if (!Number.isFinite(current) || !Number.isFinite(delta) || !Number.isFinite(next)) {
                throw new BetterAuthError(`Cannot increment non-numeric field ${field}`);
              }
              assignments.push(`\`${field}\` = COALESCE(\`${field}\`, 0) + ?`);
              values.push(delta);
              updated[field] = next;
            }

            for (const [field, value] of setEntries) {
              updated[field] = value;
            }

            return {
              assignments,
              values,
              isNoop: Object.entries(updated).every(([field, value]) =>
                Object.is(row[field], value),
              ),
            };
          };

          const updateWhere = () =>
            whereSql ? ` WHERE (${whereSql.slice(7)}) AND \`id\` = ?` : " WHERE `id` = ?";

          if (driver.dialect === "mysql") {
            return db.transaction(async () => {
              const rows = await driver.query(
                `SELECT * FROM \`${tableName}\`${whereSql} LIMIT 1 FOR UPDATE`,
                whereParams,
              );
              const row = rows[0] as Record<string, unknown> | undefined;
              if (!row) {
                return null;
              }

              const { assignments, values, isNoop } = prepareUpdate(row);
              if (isNoop) {
                return row;
              }

              const result = await driver.execute(
                `UPDATE \`${tableName}\` SET ${assignments.join(", ")}${updateWhere()}`,
                [...values, ...whereParams, row.id],
              );
              if (result?.affectedRows === 0) {
                return row;
              }
              if (result?.affectedRows !== 1) {
                throw new BetterAuthError("incrementOne must update exactly one row");
              }

              const updatedRows = await driver.query(
                `SELECT * FROM \`${tableName}\` WHERE \`id\` = ?`,
                [row.id],
              );
              return updatedRows[0] ?? null;
            });
          }

          const rows = await driver.query(
            `SELECT * FROM \`${tableName}\`${whereSql} LIMIT 1`,
            whereParams,
          );
          const row = rows[0] as Record<string, unknown> | undefined;
          if (!row) {
            return null;
          }

          const { assignments, values, isNoop } = prepareUpdate(row);
          if (isNoop) {
            return row;
          }

          const updatedRows = await driver.query(
            `UPDATE \`${tableName}\` SET ${assignments.join(", ")}${updateWhere()} RETURNING *`,
            [...values, ...whereParams, row.id],
          );
          return updatedRows[0] ?? null;
        },

        async delete({ model, where }) {
          const tableName = getModelName(model);
          const driver = db.getDriver();

          const { sql: whereSql, params } = buildWhereSql(model, "delete", where);

          await disableForeignKeys();
          try {
            await driver.execute(`DELETE FROM \`${tableName}\`${whereSql}`, params);
          } finally {
            await enableForeignKeys();
          }
        },

        async deleteMany({ model, where }) {
          const tableName = getModelName(model);
          const driver = db.getDriver();

          const { sql: whereSql, params } = buildWhereSql(model, "deleteMany", where);

          await disableForeignKeys();
          try {
            const result = await driver.execute(`DELETE FROM \`${tableName}\`${whereSql}`, params);
            return result?.changes ?? result?.affectedRows ?? 0;
          } finally {
            await enableForeignKeys();
          }
        },

        async count({ model, where }) {
          const tableName = getModelName(model);
          const driver = db.getDriver();

          const { sql: whereSql, params } = buildWhereSql(model, "count", where);

          const rows = await driver.query(
            `SELECT COUNT(*) as count FROM \`${tableName}\`${whereSql}`,
            params,
          );
          return Number(rows[0]?.count ?? 0);
        },

        async createSchema({ tables, file }) {
          const timestamp = Date.now();
          const baseDir = path.resolve(options?.outputDir ?? "./hedystia-db");
          const schemasDir = path.resolve(
            options?.schemasDir ?? `${options?.outputDir ?? "./hedystia-db"}/schemas`,
          );
          const migrationsDir = path.resolve(
            options?.migrationsDir ?? `${options?.outputDir ?? "./hedystia-db"}/migrations`,
          );

          if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
          }
          if (!fs.existsSync(schemasDir)) {
            fs.mkdirSync(schemasDir, { recursive: true });
          }
          if (!fs.existsSync(migrationsDir)) {
            fs.mkdirSync(migrationsDir, { recursive: true });
          }

          const driver = db.getDriver();
          let changelogContent = `# @hedystia/db Schema Changes - ${new Date().toISOString()}\n\n`;
          let hasChanges = false;

          const expectedTables = Object.keys(tables);

          for (const modelName of expectedTables) {
            const modelSchema = tables[modelName];
            if (!modelSchema) {
              continue;
            }
            const tableName = modelSchema.modelName;

            const tableExists = await driver.tableExists(tableName);
            const schemaCode = generateSchemaFile(modelName, modelSchema, expectedTables);
            const schemaPath = path.join(schemasDir, `${toCamelCase(modelName)}.ts`);

            if (!tableExists) {
              const migrationCode = generateMigrationFile(
                modelName,
                modelSchema,
                timestamp,
                "create",
              );
              const migrationFileName = `${timestamp}-create-${modelName}.ts`;
              const migrationPath = path.join(migrationsDir, migrationFileName);

              fs.writeFileSync(schemaPath, schemaCode);
              fs.writeFileSync(migrationPath, migrationCode);

              changelogContent += `- CREATE Migration: migrations/${migrationFileName}\n`;
              changelogContent += `- Schema: schemas/${toCamelCase(modelName)}.ts\n\n`;
              hasChanges = true;
            } else {
              const existingCols = await driver.getTableColumns(tableName);
              const existingNames = existingCols.map((col: any) => col.name);
              const expectedFields = modelSchema.fields;

              const addColumns: { name: string; field: FieldAttribute }[] = [];
              const dropColumns: string[] = [];

              for (const [fieldName, field] of Object.entries(expectedFields)) {
                const dbField = (field as FieldAttribute).fieldName || fieldName;
                if (!existingNames.includes(dbField)) {
                  addColumns.push({ name: fieldName, field: field as FieldAttribute });
                }
              }

              for (const existingCol of existingNames) {
                if (existingCol === "id") {
                  continue;
                }
                const fieldExists = Object.entries(expectedFields).some(
                  ([fieldName, field]) =>
                    ((field as FieldAttribute).fieldName || fieldName) === existingCol,
                );
                if (!fieldExists) {
                  dropColumns.push(existingCol);
                }
              }

              if (addColumns.length > 0 || dropColumns.length > 0) {
                const migrationCode = generateMigrationFile(
                  modelName,
                  modelSchema,
                  timestamp,
                  "alter",
                  { addColumns, dropColumns },
                );
                const migrationFileName = `${timestamp}-alter-${modelName}.ts`;
                const migrationPath = path.join(migrationsDir, migrationFileName);

                fs.writeFileSync(schemaPath, schemaCode);
                fs.writeFileSync(migrationPath, migrationCode);

                changelogContent += `- ALTER Migration: migrations/${migrationFileName}\n`;
                changelogContent += `- Updated Schema: schemas/${toCamelCase(modelName)}.ts\n`;
                if (addColumns.length > 0) {
                  changelogContent += `  - Added columns: ${addColumns.map((c) => c.field.fieldName || c.name).join(", ")}\n`;
                }
                if (dropColumns.length > 0) {
                  changelogContent += `  - Removed columns: ${dropColumns.join(", ")}\n`;
                }
                changelogContent += "\n";
                hasChanges = true;
              } else {
                if (fs.existsSync(schemaPath)) {
                  const existing = fs.readFileSync(schemaPath, "utf-8");
                  if (existing !== schemaCode) {
                    fs.writeFileSync(schemaPath, schemaCode);
                    changelogContent += `- Updated schema: schemas/${toCamelCase(modelName)}.ts\n\n`;
                    hasChanges = true;
                  }
                } else {
                  fs.writeFileSync(schemaPath, schemaCode);
                  changelogContent += `- Generated missing schema: schemas/${toCamelCase(modelName)}.ts\n\n`;
                  hasChanges = true;
                }
              }
            }
          }

          if (!hasChanges) {
            changelogContent += "Schema is up to date. No changes detected.\n";
          }

          return {
            code: changelogContent,
            path: file ?? "hedystia-db/changelog.txt",
          };
        },
      };
    },
  });
