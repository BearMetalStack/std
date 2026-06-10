import type { DBOptions, Queryable, TableIdentifier } from "../types.d.ts";
import type { Migration, MigrationResult } from "@migrations";

export abstract class Connector implements Queryable {
  constructor(protected opts: DBOptions) {}

  abstract select<F extends string>(fields: F[]): Queryable<Pick<Record<string, unknown>, F>>;
  abstract where(condition: unknown): Queryable;
  abstract join(
    otherTableIdentifier: TableIdentifier,
    on: { localTable?: string; local: string; foreign: string },
    type?: "inner" | "left",
  ): Queryable;
  abstract orderBy(field: string, direction?: "asc" | "desc"): Queryable;
  abstract groupBy(fields: string[]): Queryable;
  abstract limit(count?: number): Queryable;
  abstract offset(skipCount: number): Queryable;
  abstract get query(): Promise<Record<string, unknown>[]>;
  abstract get delete(): Promise<Record<string, unknown>[]>;
  abstract upsert(
    data: Record<string, unknown>,
    conflictOn?: string[],
  ): Promise<Record<string, unknown>[]>;
  abstract migrate(migrations: Migration[]): Promise<MigrationResult>;
}
