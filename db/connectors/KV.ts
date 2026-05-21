import { Connector } from "@connectors";
import type { DBOptions, Queryable, TableIdentifier } from "../types.d.ts";
import type { Migration, MigrationResult } from "@migrations";

export class KVConnector extends Connector {
  constructor(opts: DBOptions) {
    super(opts);
  }

  table(_identifier: TableIdentifier): Queryable {
    throw new Error("Not Implemented");
  }

  select(_fields: string[]): Queryable {
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

  get query(): Promise<unknown> {
    throw new Error("Not Implemented");
  }

  get delete(): Promise<unknown> {
    throw new Error("Not Implemented");
  }

  upsert(
    _data: Record<string, unknown>,
    _conflictOn?: string[],
  ): Promise<unknown> {
    throw new Error("Not Implemented");
  }

  migrate(_migrations: Migration[]): Promise<MigrationResult> {
    throw new Error("Not Implemented");
  }
}
