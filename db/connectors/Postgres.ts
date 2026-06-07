import { Connector } from "@connectors";
import { Client, Pool } from "@db/postgres";
import type { DBOptions, PostgresOptions, Queryable, TableIdentifier } from "../types.d.ts";
import {
	buildPostgresDeleteSQL,
	buildPostgresSQL,
	buildPostgresUpsertSQL,
	emptyState,
	type QueryState,
} from "@lib/SqlBuilder.ts";
import { runMigrations } from "@migrations";
import type { Migration, MigrationResult } from "@migrations";
import { isDev } from "@bearmetal/miscellanea/environment";

function resolveIdentifier(id: TableIdentifier): string {
	return typeof id === "string" ? id : id.name;
}

export class PostgresConnector extends Connector {
	#pool: Pool;
	#state: QueryState;

	constructor(opts: DBOptions<PostgresOptions>) {
		super(opts);
		let config;
		switch (opts._type) {
			case "string":
				config = opts.connectionString;
				break;
			case "opts":
				config = {
					database: opts.database,
					user: opts.user,
					password: opts.password,
					hostname: opts.host,
					port: opts.port,
				};
				break;
			case "env": {
				const pgPort = Deno.env.get("PGPORT");
				config = {
					user: Deno.env.get("PGUSER"),
					password: Deno.env.get("PGPASSWORD"),
					hostname: Deno.env.get("PGHOST"),
					port: pgPort !== undefined ? parseInt(pgPort, 10) : undefined,
					database: opts.database,
				};
				break;
			}
		}
		this.#pool = new Pool(config, opts.poolSize ?? 2, true);
		this.#state = emptyState();
	}

	async #execute(sql: string, params: unknown[]): Promise<unknown> {
		const client = await this.#pool.connect();
		try {
			const result = await client.queryObject(sql, params);
			return result.rows;
		} finally {
			client.release();
		}
	}

	table(identifier: TableIdentifier): Queryable {
		this.#state = { ...emptyState(), table: resolveIdentifier(identifier) };
		return this;
	}

	select(fields: string[]): Queryable {
		this.#state.fields = fields;
		return this;
	}

	where(condition: unknown): Queryable {
		if (condition && typeof condition === "object") {
			for (
				const [col, val] of Object.entries(condition as Record<string, unknown>)
			) {
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
		this.#state.joins.push({
			table: resolveIdentifier(otherTableIdentifier),
			on,
			type,
		});
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

	get query(): Promise<unknown> {
		const { sql, params } = buildPostgresSQL(this.#state);
		return this.#execute(sql, params);
	}

	get delete(): Promise<unknown> {
		const { sql, params } = buildPostgresDeleteSQL(this.#state);
		return this.#execute(sql, params);
	}

	upsert(
		data: Record<string, unknown>,
		conflictOn?: string[],
	): Promise<unknown> {
		const { sql, params } = buildPostgresUpsertSQL(
			this.#state,
			data,
			conflictOn,
		);
		return this.#execute(sql, params);
	}

	async migrate(migrations: Migration[]): Promise<MigrationResult> {
		if (isDev()) {
			// Best-effort: proactively create the DB before the pool touches it.
			// If the admin connection itself fails, fall through - runMigrations will
			// surface the real error.
			await this.#ensureDatabaseExists().catch(() => {});
		}

		return runMigrations(this.#pool, migrations);
	}

	async #ensureDatabaseExists(): Promise<void> {
		const dbName = this.#getTargetDatabase();
		const adminConfig = this.#buildAdminConfig();
		if (!dbName || !adminConfig) return;

		const client = new Client(adminConfig);
		await client.connect();
		try {
			const { rows } = await client.queryObject<{ exists: boolean }>(
				`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists`,
				[dbName],
			);
			if (!rows[0].exists) {
				await client.queryObject(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
			}
		} finally {
			await client.end();
		}
	}

	#getTargetDatabase(): string | null {
		switch (this.opts._type) {
			case "string": {
				try {
					return new URL(this.opts.connectionString).pathname.slice(1) || null;
				} catch {
					return null;
				}
			}
			case "opts":
			case "env":
				return this.opts.database;
		}
	}

	#buildAdminConfig(): string | Record<string, unknown> | null {
		switch (this.opts._type) {
			case "string": {
				try {
					const url = new URL(this.opts.connectionString);
					url.pathname = "/postgres";
					return url.toString();
				} catch {
					return null;
				}
			}
			case "opts":
				return {
					database: "postgres",
					user: this.opts.user,
					password: this.opts.password,
					hostname: this.opts.host,
					port: this.opts.port,
				};
			case "env": {
				const pgPort = Deno.env.get("PGPORT");
				return {
					database: "postgres",
					user: Deno.env.get("PGUSER"),
					password: Deno.env.get("PGPASSWORD"),
					hostname: Deno.env.get("PGHOST"),
					port: pgPort !== undefined ? parseInt(pgPort, 10) : undefined,
				};
			}
		}
	}
}
