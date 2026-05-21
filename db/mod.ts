import {
  createService,
  createServiceToken,
  Module,
  type ObjectSchema,
  type SchemaShape,
  type ServiceToken,
} from "@bearmetal/router";
import { KVConnector, PostgresConnector } from "@connectors";
import type {
  DBOptions,
  PostgresOptions,
  Queryable,
  TableIdentifier,
} from "./types.d.ts";
import { m } from "@migrations";
import type { Migration, MigrationResult } from "@migrations";
import { schemaHash } from "@lib/hash.ts";

export {
  m,
  type Migration,
  type MigrationOp,
  type MigrationResult,
} from "@migrations";
export {
  type Infer,
  ObjectSchema,
  s,
  type SchemaShape,
} from "@bearmetal/router";

type ProviderType = "postgres" | "kv";

export type DBServiceActions = {
  table: (identifier: TableIdentifier) => Queryable;
  migrate: () => Promise<MigrationResult>;
  registerMigrations: (migrations: Migration[]) => void;
  extend: (
    opts: {
      table: string;
      schema: ObjectSchema<SchemaShape>;
      migration?: Migration;
      allowDrop?: boolean;
    },
  ) => void;
};

export const dbToken: ServiceToken<DBServiceActions> = createServiceToken<
  DBServiceActions
>("db");

export function dbModule(
  type: "kv",
  opts: DBOptions,
  config?: { migrations?: Migration[] },
): Module;
export function dbModule(
  type: "postgres",
  opts: DBOptions<PostgresOptions>,
  config?: { migrations?: Migration[] },
): Module;
export function dbModule(
  type: ProviderType,
  opts: DBOptions,
  config?: { migrations?: Migration[] },
): Module {
  const migrations: Migration[] = [...(config?.migrations ?? [])];
  const conn = type === "postgres"
    ? new PostgresConnector(opts as DBOptions<PostgresOptions>)
    : new KVConnector(opts);

  let bearEnv = "dev";
  try {
    bearEnv = Deno.env.get("BEARMETAL_ENV") ?? "dev";
  } catch { /* no --allow-env, treat as dev */ }
  const isProd = bearEnv === "prod" || bearEnv === "stage";

  const mod = new Module().provides(
    dbToken,
    createService<DBServiceActions>({
      table: (id: TableIdentifier) => conn.table(id),
      migrate: () => conn.migrate(migrations),
      registerMigrations: (incoming) => migrations.push(...incoming),
      extend: ({ table, schema, migration, allowDrop }) => {
        if (migration) {
          migrations.push(migration);
          return;
        }
        const id = schemaHash(schema.toJSONSchema());
        migrations.push(m.change(id, [{
          kind: "extendTable",
          table,
          schema,
          allowDrop: allowDrop ?? !isProd,
        }]));
      },
    }),
  );

  if (!isProd) {
    mod.onStart(() => conn.migrate(migrations).then(() => {}));
  }

  return mod;
}
