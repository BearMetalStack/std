export type TableIdentifier = string | { name: string };

export interface Queryable {
  select(fields: string[]): Queryable;
  where(condition: unknown): Queryable;
  join(
    otherTableIdentifier: TableIdentifier,
    on: { localTable?: string; local: string; foreign: string },
    type?: "inner" | "left",
  ): Queryable;
  orderBy(field: string, direction?: "asc" | "desc"): Queryable;
  groupBy(fields: string[]): Queryable;
  limit(count?: number): Queryable;
  offset(skipCount: number): Queryable;
  readonly query: Promise<unknown>;
  readonly delete: Promise<unknown>;
  upsert(
    data: Record<string, unknown>,
    conflictOn?: string[],
  ): Promise<unknown>;
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
