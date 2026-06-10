import { Connector } from "@connectors";
import type { DBOptions, Queryable, TableIdentifier } from "../types.d.ts";
import type { Migration, MigrationResult } from "@migrations";

export class KVConnector extends Connector {
  constructor(opts: DBOptions) {
    super(opts);
  }

  table<T = Record<string, unknown>>(_identifier: TableIdentifier): Queryable<T> {
    throw new Error("Not Implemented");
  }

  select<F extends string>(_fields: F[]): Queryable<Pick<Record<string, unknown>, F>> {
    throw new Error("Not Implemented");
  }

  where(_condition: unknown): Queryable {
    throw new Error("Not Implemented");
  }

  join(
    _otherTableIdentifier: TableIdentifier,
    _on: { localTable?: string; local: string; foreign: string },
    _type?: "inner" | "left",
  ): Queryable {
    throw new Error("Not Implemented");
  }

  orderBy(_field: string, _direction?: "asc" | "desc"): Queryable {
    throw new Error("Not Implemented");
  }

  groupBy(_fields: string[]): Queryable {
    throw new Error("Not Implemented");
  }

  limit(_count?: number): Queryable {
    throw new Error("Not Implemented");
  }

  offset(_skipCount: number): Queryable {
    throw new Error("Not Implemented");
  }

  get query(): Promise<Record<string, unknown>[]> {
    throw new Error("Not Implemented");
  }

  get delete(): Promise<Record<string, unknown>[]> {
    throw new Error("Not Implemented");
  }

  upsert(
    _data: Record<string, unknown>,
    _conflictOn?: string[],
  ): Promise<Record<string, unknown>[]> {
    throw new Error("Not Implemented");
  }

  migrate(_migrations: Migration[]): Promise<MigrationResult> {
    throw new Error("Not Implemented");
  }
}
