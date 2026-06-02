import type { Pool } from "@db/postgres";
import type { Migration, MigrationOp, MigrationResult } from "./ops.ts";
import { opToStatements, schemaToPostgresType } from "./ddl.ts";
import { isProd } from "@bearmetal/miscellanea";

const ENSURE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    id          TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta        JSONB
  )
`.trim();

export async function runMigrations(
	pool: Pool,
	migrations: Migration[],
): Promise<MigrationResult> {
	const result: MigrationResult = { applied: [], skipped: [] };

	type ExtendOp = Extract<MigrationOp, { kind: "extendTable" }>;

	const client = await pool.connect();

	async function handleExtendTable(op: ExtendOp): Promise<string[]> {
		const desiredCols = new Set(Object.keys(op.schema.shape));

		// Find which columns were previously added by extendTable for this table
		const { rows: metaRows } = await client.queryObject<
			{ meta: { columns: string[] } }
		>(
			`SELECT meta FROM _migrations
       WHERE (meta->>'kind') = 'extendTable' AND (meta->>'table') = $1`,
			[op.table],
		);
		const prevCols = new Set(metaRows.flatMap((r) => r.meta.columns ?? []));

		// Current DB columns for this table
		const { rows: dbRows } = await client.queryObject<{ column_name: string }>(
			`SELECT column_name FROM information_schema.columns
       WHERE table_name = $1 AND table_schema = current_schema()`,
			[op.table],
		);
		const existingCols = new Set(dbRows.map((r) => r.column_name));

		// Removed = was in a previous extend AND still in DB AND not in current schema
		// (if it was already gone from DB it was handled by an explicit migration)
		const removed = [...prevCols].filter(
			(c) => !desiredCols.has(c) && existingCols.has(c),
		);

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
			for (const col of removed) {
				await client.queryObject(`ALTER TABLE ${op.table} DROP COLUMN ${col}`);
			}
		}

		// Add columns that are desired but don't yet exist in the DB
		for (const [col, fieldSchema] of Object.entries(op.schema.shape)) {
			if (!existingCols.has(col)) {
				const pgType = schemaToPostgresType(fieldSchema);
				await client.queryObject(
					`ALTER TABLE ${op.table} ADD COLUMN ${col} ${pgType}`,
				);
			}
		}

		return [...desiredCols];
	}

	try {
		await client.queryObject(ENSURE_MIGRATIONS_TABLE);
		// Upgrade path: add meta column if this table existed before it was introduced
		await client.queryObject(
			`ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS meta JSONB`,
		);

		const { rows } = await client.queryObject<{ id: string }>(
			"SELECT id FROM _migrations ORDER BY id",
		);
		const alreadyApplied = new Set(rows.map((r) => r.id));

		for (
			const migration of [...migrations].sort((a, b) => a.id.localeCompare(b.id))
		) {
			if (alreadyApplied.has(migration.id)) {
				result.skipped.push(migration.id);
				continue;
			}

			let migrationMeta: unknown = null;

			await client.queryObject("BEGIN");
			try {
				for (const op of migration.ops) {
					if (op.kind === "extendTable") {
						const cols = await handleExtendTable(op);
						migrationMeta = { kind: "extendTable", table: op.table, columns: cols };
					} else {
						for (const { sql, params } of opToStatements(op)) {
							await client.queryObject(sql, params);
						}
					}
				}
				await client.queryObject(
					"INSERT INTO _migrations (id, meta) VALUES ($1, $2)",
					[migration.id, migrationMeta !== null ? JSON.stringify(migrationMeta) : null],
				);
				await client.queryObject("COMMIT");
				result.applied.push(migration.id);
			} catch (err) {
				await client.queryObject("ROLLBACK");
				throw err;
			}
		}

		return result;
	} finally {
		client.release();
	}
}
