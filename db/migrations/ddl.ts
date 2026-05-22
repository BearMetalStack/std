import {
  NullableSchema,
  type ObjectSchema,
  OptionalSchema,
  type Schema,
  type SchemaShape,
} from "@bearmetal/forge";
import type { MigrationOp } from "./ops.ts";

export function schemaToPostgresType(schema: Schema<unknown>): string {
  const json = schema.toJSONSchema();
  if (json.type === "string") return json.format === "uuid" ? "UUID" : "TEXT";
  if (json.type === "integer") return "INTEGER";
  if (json.type === "number") return "NUMERIC";
  if (json.type === "boolean") return "BOOLEAN";
  if (json.type === "object" || json.type === "array") return "JSONB";
  if (json.oneOf) {
    const allStrings = json.oneOf.every(
      (m) =>
        m.type === "string" ||
        (m.const !== undefined && typeof m.const === "string"),
    );
    return allStrings ? "TEXT" : "JSONB";
  }
  return "TEXT";
}

function isNullable(schema: Schema<unknown>): boolean {
  return schema instanceof OptionalSchema || schema instanceof NullableSchema;
}

function buildCreateTable(
  table: string,
  schema: ObjectSchema<SchemaShape>,
  primaryKey?: string | string[],
  indexes?: Array<{ columns: string[]; unique?: boolean; name?: string }>,
): Array<{ sql: string; params: unknown[] }> {
  const required = new Set(schema.toJSONSchema().required ?? []);
  const pkCols = primaryKey
    ? (Array.isArray(primaryKey) ? primaryKey : [primaryKey])
    : [];

  const cols = Object.entries(schema.shape).map(([col, fieldSchema]) => {
    const pgType = schemaToPostgresType(fieldSchema);
    const notNull = required.has(col) || pkCols.includes(col)
      ? " NOT NULL"
      : "";
    const pk = pkCols.length === 1 && pkCols[0] === col ? " PRIMARY KEY" : "";
    return `  ${col} ${pgType}${notNull}${pk}`;
  });

  if (pkCols.length > 1) cols.push(`  PRIMARY KEY (${pkCols.join(", ")})`);

  const stmts: Array<{ sql: string; params: unknown[] }> = [
    {
      sql: `CREATE TABLE IF NOT EXISTS ${table} (\n${cols.join(",\n")}\n)`,
      params: [],
    },
  ];

  for (const idx of indexes ?? []) {
    const unique = idx.unique ? "UNIQUE " : "";
    const name = idx.name ?? `${table}_${idx.columns.join("_")}_idx`;
    stmts.push({
      sql: `CREATE ${unique}INDEX IF NOT EXISTS ${name} ON ${table} (${
        idx.columns.join(", ")
      })`,
      params: [],
    });
  }

  return stmts;
}

export function opToStatements(
  op: MigrationOp,
): Array<{ sql: string; params: unknown[] }> {
  switch (op.kind) {
    case "createTable":
      return buildCreateTable(op.table, op.schema, op.primaryKey, op.indexes);

    case "dropTable":
      return [{ sql: `DROP TABLE IF EXISTS ${op.table}`, params: [] }];

    case "addColumn": {
      const pgType = schemaToPostgresType(op.schema);
      const notNull = isNullable(op.schema) ? "" : " NOT NULL";
      return [{
        sql:
          `ALTER TABLE ${op.table} ADD COLUMN ${op.column} ${pgType}${notNull}`,
        params: [],
      }];
    }

    case "dropColumn":
      return [{
        sql: `ALTER TABLE ${op.table} DROP COLUMN ${op.column}`,
        params: [],
      }];

    case "renameColumn":
      return [{
        sql: `ALTER TABLE ${op.table} RENAME COLUMN ${op.from} TO ${op.to}`,
        params: [],
      }];

    case "retypeColumn": {
      const pgType = schemaToPostgresType(op.schema);
      const using = op.using ? ` USING ${op.using(op.column)}` : "";
      return [{
        sql:
          `ALTER TABLE ${op.table} ALTER COLUMN ${op.column} TYPE ${pgType}${using}`,
        params: [],
      }];
    }

    case "addIndex": {
      const unique = op.unique ? "UNIQUE " : "";
      const name = op.name ?? `${op.table}_${op.columns.join("_")}_idx`;
      return [{
        sql: `CREATE ${unique}INDEX IF NOT EXISTS ${name} ON ${op.table} (${
          op.columns.join(", ")
        })`,
        params: [],
      }];
    }

    case "dropIndex":
      return [{ sql: `DROP INDEX IF EXISTS ${op.name}`, params: [] }];

    case "raw":
      return [{ sql: op.sql, params: op.params ?? [] }];

    case "extendTable":
      throw new Error(
        "extendTable ops require database access — handled by the migration runner, not opToStatements",
      );
  }
}
