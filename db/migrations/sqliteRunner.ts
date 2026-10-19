import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { Migration, MigrationOp, MigrationResult } from "./ops.ts";
import { opToStatements, schemaToSqlType } from "./ddl.ts";
import { isProd } from "@bearmetal/miscellanea/environment";

const ENSURE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    id          TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    meta        TEXT
  )
`.trim();

type ExtendOp = Extract<MigrationOp, { kind: "extendTable" }>;

/**
 * The SQLite counterpart of `runMigrations`: same bookkeeping in `_migrations`,
 * same ordering by id, each migration in its own transaction.
 */
export function runSqliteMigrations(
	db: DatabaseSync,
	migrations: Migration[],
): Promise<MigrationResult> {
	const result: MigrationResult = { applied: [], skipped: [] };

	const handleExtendTable = (op: ExtendOp): string[] => {
		const desiredCols = new Set(Object.keys(op.schema.shape));

		const metaRows = db.prepare(
			`SELECT meta FROM _migrations
       WHERE json_extract(meta, '$.kind') = 'extendTable' AND json_extract(meta, '$.table') = ?1`,
		).all(op.table) as { meta: string }[];
		const prevCols = new Set(
			metaRows.flatMap((r) => (JSON.parse(r.meta) as { columns?: string[] }).columns ?? []),
		);

		const existingCols = new Set(
			(db.prepare(`SELECT name FROM pragma_table_info(?1)`).all(op.table) as { name: string }[])
				.map((r) => r.name),
		);

		const removed = [...prevCols].filter((c) => !desiredCols.has(c) && existingCols.has(c));
		if (removed.length > 0) {
			const cols = removed.map((c) => `"${c}"`).join(", ");
			const were = removed.length === 1 ? "was" : "were";
			if (isProd()) {
				throw new Error(
					`Cannot drop columns via extend() in prod: ${cols} ${were} removed from ` +
						`the "${op.table}" schema extension. Use an explicit m.dropColumn() migration instead.`,
				);
			}
			if (!op.allowDrop) {
				throw new Error(
					`Hold up - ${cols} ${were} removed from the "${op.table}" schema extension. ` +
						`Verify you don't need to translate this data first. ` +
						`To drop, pass allowDrop: true to extend().`,
				);
			}
			for (const col of removed) db.exec(`ALTER TABLE ${op.table} DROP COLUMN ${col}`);
		}

		for (const [col, fieldSchema] of Object.entries(op.schema.shape)) {
			if (!existingCols.has(col)) {
				db.exec(
					`ALTER TABLE ${op.table} ADD COLUMN ${col} ${schemaToSqlType(fieldSchema, "sqlite")}`,
				);
			}
		}

		return [...desiredCols];
	};

	try {
		db.exec(ENSURE_MIGRATIONS_TABLE);
		const applied = new Set(
			(db.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map((r) => r.id),
		);

		for (const migration of [...migrations].sort((a, b) => a.id.localeCompare(b.id))) {
			if (applied.has(migration.id)) {
				result.skipped.push(migration.id);
				continue;
			}

			let meta: unknown = null;
			db.exec("BEGIN");
			try {
				for (const op of migration.ops) {
					if (op.kind === "extendTable") {
						meta = { kind: "extendTable", table: op.table, columns: handleExtendTable(op) };
						continue;
					}
					for (const { sql, params } of opToStatements(op, "sqlite")) {
						db.prepare(sql).run(...params as SQLInputValue[]);
					}
				}
				db.prepare("INSERT INTO _migrations (id, meta) VALUES (?1, ?2)")
					.run(migration.id, meta !== null ? JSON.stringify(meta) : null);
				db.exec("COMMIT");
				result.applied.push(migration.id);
			} catch (err) {
				db.exec("ROLLBACK");
				throw err;
			}
		}
		return Promise.resolve(result);
	} catch (err) {
		return Promise.reject(err);
	}
}
