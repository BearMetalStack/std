// import type { ServiceActions } from "@bearmetal/router";

export type TableIdentifier = string | { name: string };

export interface TableRegistry {
	bma_users: {
		id: string;
		alias: string;
		password?: string;
		google_id?: string;
		discord_id?: string;
		github_id?: string;
	};
	bma_sessions: { token: string; data?: string };
	bma_passkeys: {
		credential_id: string;
		user_id: string;
		public_key: string;
		counter: number;
	};
}

export interface Queryable<T = Record<string, unknown>> {
	select<F extends keyof T & string>(fields: F[]): Queryable<Pick<T, F>>;
	where(condition: Partial<T>): Queryable<T>;
	join(
		otherTableIdentifier: TableIdentifier,
		on: { localTable?: string; local: string; foreign: string },
		type?: "inner" | "left",
	): Queryable<T>;
	orderBy(field: keyof T & string, direction?: "asc" | "desc"): Queryable<T>;
	groupBy(fields: (keyof T & string)[]): Queryable<T>;
	limit(count?: number): Queryable<T>;
	offset(skipCount: number): Queryable<T>;
	readonly query: Promise<T[]>;
	readonly delete: Promise<T[]>;
	upsert(
		data: Partial<T>,
		conflictOn?: (keyof T & string)[],
	): Promise<T[]>;
}

export type DBOptions<T = unknown> =
	& T
	& (ConnString | ConnOpts | ConnFromENV);
type ConnString = {
	_type: "string";
	connectionString: string;
};
type ConnOpts = {
	_type: "opts";
	host: string;
	user: string;
	password: string;
	port: number;
	database: string;
};
type ConnFromENV = {
	_type: "env";
	database: string;
};
export type PostgresOptions = {
	poolSize?: number;
};
export type KVOptions = {
	KV: true;
};

// declare module "@bearmetal/router" {
//   interface Service<T extends ServiceActions> {
//     invoke<K extends keyof TableRegistry>(action: "table", identifier: K): Queryable<TableRegistry[K]>;
//     invoke(action: "table", identifier: string): Queryable;
//   }
// }
