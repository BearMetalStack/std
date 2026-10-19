import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { Connector } from "@connectors";
import type { Queryable, SqliteOptions, TableIdentifier } from "../types.d.ts";
import {
	buildDeleteSQL,
	buildSelectSQL,
	buildUpsertSQL,
	emptyState,
	type QueryState,
} from "@lib/SqlBuilder.ts";
import { runSqliteMigrations } from "@migrations";
import type { Migration, MigrationResult } from "@migrations";

function resolveIdentifier(id: TableIdentifier): string {
	return typeof id === "string" ? id : id.name;
}

/**
 * SQLite has no booleans, objects or dates, so values are narrowed to what it
 * can bind: booleans to 0/1, dates to ISO strings, and anything structured to
 * JSON — the same shapes the DDL gives those columns.
 */
function toSqlite(value: unknown): SQLInputValue {
	if (value === undefined || value === null) return null;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (value instanceof Date) return value.toISOString();
	if (value instanceof Uint8Array) return value;
	if (typeof value === "object") return JSON.stringify(value);
	return value as SQLInputValue;
}

/**
 * A connector over a single SQLite file through `node:sqlite`, which ships
 * with Deno — no native library to install, and it works inside a
 * `deno compile` binary. Queries run synchronously under the hood; the
 * `Promise` returns keep it interchangeable with the Postgres connector.
 */
export class SqliteConnector extends Connector {
	#db: DatabaseSync;
	#state: QueryState;

	constructor(opts: SqliteOptions) {
		super(opts);
		this.#db = new DatabaseSync(opts.path);
		this.#db.exec("PRAGMA journal_mode = WAL");
		this.#db.exec("PRAGMA foreign_keys = ON");
		if (opts.busyTimeout !== 0) this.#db.exec(`PRAGMA busy_timeout = ${opts.busyTimeout ?? 5000}`);
		this.#state = emptyState();
	}

	#execute(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
		try {
			const stmt = this.#db.prepare(sql);
			const bound = params.map(toSqlite);
			if (/^\s*select/i.test(sql)) {
				return Promise.resolve(stmt.all(...bound).map((row) => ({ ...row })));
			}
			stmt.run(...bound);
			return Promise.resolve([]);
		} catch (err) {
			return Promise.reject(err);
		}
	}

	/** Closes the underlying database. */
	close(): void {
		this.#db.close();
	}

	table<T = Record<string, unknown>>(identifier: TableIdentifier): Queryable<T> {
		this.#state = { ...emptyState(), table: resolveIdentifier(identifier) };
		return this as unknown as Queryable<T>;
	}

	select<F extends string>(fields: F[]): Queryable<Pick<Record<string, unknown>, F>> {
		this.#state.fields = fields;
		return this as unknown as Queryable<Pick<Record<string, unknown>, F>>;
	}

	where(condition: unknown): Queryable {
		if (condition && typeof condition === "object") {
			for (const [col, val] of Object.entries(condition as Record<string, unknown>)) {
				this.#state.conditions.push([col, val]);
			}
		}
		return this;
	}

	join(
		otherTableIdentifier: TableIdentifier,
		on: { localTable?: string; local: string; foreign: string },
		type: "inner" | "left" = "inner",
	): Queryable {
		this.#state.joins.push({ table: resolveIdentifier(otherTableIdentifier), on, type });
		return this;
	}

	orderBy(field: string, direction: "asc" | "desc" = "asc"): Queryable {
		this.#state.orderBys.push({ field, direction });
		return this;
	}

	groupBy(fields: string[]): Queryable {
		this.#state.groupBys.push(...fields);
		return this;
	}

	limit(count?: number): Queryable {
		this.#state.limitCount = count;
		return this;
	}

	offset(skipCount: number): Queryable {
		if (skipCount < 0) throw new Error("Offset count must be non-negative.");
		this.#state.offsetCount = skipCount;
		return this;
	}

	get query(): Promise<Record<string, unknown>[]> {
		const { sql, params } = buildSelectSQL(this.#state, "sqlite");
		return this.#execute(sql, params);
	}

	get delete(): Promise<Record<string, unknown>[]> {
		const { sql, params } = buildDeleteSQL(this.#state, "sqlite");
		return this.#execute(sql, params);
	}

	upsert(data: Record<string, unknown>, conflictOn?: string[]): Promise<Record<string, unknown>[]> {
		const { sql, params } = buildUpsertSQL(this.#state, data, conflictOn, "sqlite");
		return this.#execute(sql, params);
	}

	migrate(migrations: Migration[]): Promise<MigrationResult> {
		return runSqliteMigrations(this.#db, migrations);
	}
}
