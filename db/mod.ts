import type { ObjectSchema, SchemaShape } from "@bearmetal/forge";
import { createService, createServiceToken, Module, type ServiceToken } from "@bearmetal/router";
import { KVConnector, PostgresConnector } from "@connectors";
import { schemaHash } from "@lib/hash.ts";
import type { Migration, MigrationResult } from "@migrations";
import { m } from "@migrations";
import type { DBOptions, PostgresOptions, Queryable, TableIdentifier, TableRegistry } from "./types.d.ts";
import { isProd } from "@bearmetal/miscellanea/environment";

export { type Infer, ObjectSchema, s, type SchemaShape } from "@bearmetal/forge";
export { m, type Migration, type MigrationOp, type MigrationResult } from "@migrations";
export type { TableRegistry } from "./types.d.ts";

type ProviderType = "postgres" | "kv";

export type DBServiceActions = {
	table<K extends keyof TableRegistry>(identifier: K): Queryable<TableRegistry[K]>;
	table(identifier: TableIdentifier): Queryable;
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

	const mod = new Module().provides(
		dbToken,
		createService<DBServiceActions>({
			table: ((id: TableIdentifier) => conn.table(id)) as DBServiceActions["table"],
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
					allowDrop: allowDrop ?? !isProd(),
				}]));
			},
		}),
	);

	if (!isProd()) {
		mod.onStart(() => conn.migrate(migrations).then(() => {}));
	}

	return mod;
}
