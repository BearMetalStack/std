import type { ObjectSchema, Schema, SchemaShape } from "@bearmetal/router";

export type IndexDef = {
  columns: string[];
  unique?: boolean;
  name?: string;
};

export type MigrationOp =
  | {
    kind: "createTable";
    table: string;
    schema: ObjectSchema<SchemaShape>;
    primaryKey?: string | string[];
    indexes?: IndexDef[];
  }
  | { kind: "dropTable"; table: string }
  | {
    kind: "addColumn";
    table: string;
    column: string;
    schema: Schema<unknown>;
  }
  | { kind: "dropColumn"; table: string; column: string }
  | { kind: "renameColumn"; table: string; from: string; to: string }
  | {
    kind: "retypeColumn";
    table: string;
    column: string;
    schema: Schema<unknown>;
    using?: (col: string) => string;
  }
  | {
    kind: "addIndex";
    table: string;
    columns: string[];
    unique?: boolean;
    name?: string;
  }
  | { kind: "dropIndex"; name: string }
  | { kind: "raw"; sql: string; params?: unknown[] }
  | {
    kind: "extendTable";
    table: string;
    schema: ObjectSchema<SchemaShape>;
    allowDrop?: boolean;
  };

export interface Migration {
  id: string;
  ops: MigrationOp[];
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export interface MigrationOps {
  create(id: string, opts: {
    table: string;
    schema: ObjectSchema<SchemaShape>;
    primaryKey?: string | string[];
    indexes?: IndexDef[];
  }): Migration;

  change(id: string, ops: MigrationOp[]): Migration;

  addColumn(
    table: string,
    column: string,
    schema: Schema<unknown>,
  ): MigrationOp;

  dropColumn(table: string, column: string): MigrationOp;

  renameColumn(table: string, from: string, to: string): MigrationOp;

  retypeColumn(
    table: string,
    column: string,
    schema: Schema<unknown>,
    opts?: { using?: (col: string) => string },
  ): MigrationOp;

  dropTable(table: string): MigrationOp;

  addIndex(
    table: string,
    columns: string[],
    opts?: { unique?: boolean; name?: string },
  ): MigrationOp;

  dropIndex(name: string): MigrationOp;

  raw(sql: string, params?: unknown[]): MigrationOp;
}

export const m: MigrationOps = {
  create(id: string, opts: {
    table: string;
    schema: ObjectSchema<SchemaShape>;
    primaryKey?: string | string[];
    indexes?: IndexDef[];
  }): Migration {
    return { id, ops: [{ kind: "createTable", ...opts }] };
  },

  change(id: string, ops: MigrationOp[]): Migration {
    return { id, ops };
  },

  addColumn(
    table: string,
    column: string,
    schema: Schema<unknown>,
  ): MigrationOp {
    return { kind: "addColumn", table, column, schema };
  },

  dropColumn(table: string, column: string): MigrationOp {
    return { kind: "dropColumn", table, column };
  },

  renameColumn(table: string, from: string, to: string): MigrationOp {
    return { kind: "renameColumn", table, from, to };
  },

  retypeColumn(
    table: string,
    column: string,
    schema: Schema<unknown>,
    opts?: { using?: (col: string) => string },
  ): MigrationOp {
    return { kind: "retypeColumn", table, column, schema, using: opts?.using };
  },

  dropTable(table: string): MigrationOp {
    return { kind: "dropTable", table };
  },

  addIndex(
    table: string,
    columns: string[],
    opts?: { unique?: boolean; name?: string },
  ): MigrationOp {
    return { kind: "addIndex", table, columns, ...opts };
  },

  dropIndex(name: string): MigrationOp {
    return { kind: "dropIndex", name };
  },

  raw(sql: string, params?: unknown[]): MigrationOp {
    return { kind: "raw", sql, params };
  },
};
