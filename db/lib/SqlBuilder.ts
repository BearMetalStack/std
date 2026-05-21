export interface QueryState {
  table: string;
  fields: string[];
  conditions: Array<[string, unknown]>;
  joins: Array<{
    table: string;
    on: { localTable?: string; local: string; foreign: string };
    type: "inner" | "left";
  }>;
  groupBys: string[];
  orderBys: Array<{ field: string; direction: "asc" | "desc" }>;
  limitCount?: number;
  offsetCount?: number;
}

export function emptyState(): QueryState {
  return {
    table: "",
    fields: [],
    conditions: [],
    joins: [],
    groupBys: [],
    orderBys: [],
  };
}

export function buildPostgresSQL(
  state: QueryState,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const fields = state.fields.length > 0 ? state.fields.join(", ") : "*";

  let sql = `SELECT ${fields} FROM ${state.table}`;

  for (const { table, on, type } of state.joins) {
    const leftTable = on.localTable ?? state.table;
    sql +=
      ` ${type.toUpperCase()} JOIN ${table} ON ${leftTable}.${on.local} = ${table}.${on.foreign}`;
  }

  if (state.conditions.length > 0) {
    const clauses = state.conditions.map(([col, val]) => {
      params.push(val);
      return `${col} = $${params.length}`;
    });
    sql += ` WHERE ${clauses.join(" AND ")}`;
  }

  if (state.groupBys.length > 0) {
    sql += ` GROUP BY ${state.groupBys.join(", ")}`;
  }

  if (state.orderBys.length > 0) {
    const parts = state.orderBys.map(({ field, direction }) =>
      `${field} ${direction.toUpperCase()}`
    );
    sql += ` ORDER BY ${parts.join(", ")}`;
  }

  if (state.limitCount !== undefined) {
    params.push(state.limitCount);
    sql += ` LIMIT $${params.length}`;
  }

  if (state.offsetCount !== undefined) {
    params.push(state.offsetCount);
    sql += ` OFFSET $${params.length}`;
  }

  return { sql, params };
}

export function buildPostgresDeleteSQL(
  state: QueryState,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let sql = `DELETE FROM ${state.table}`;

  if (state.conditions.length > 0) {
    const clauses = state.conditions.map(([col, val]) => {
      params.push(val);
      return `${col} = $${params.length}`;
    });
    sql += ` WHERE ${clauses.join(" AND ")}`;
  }

  return { sql, params };
}

export function buildPostgresUpsertSQL(
  state: QueryState,
  data: Record<string, unknown>,
  conflictOn?: string[],
): { sql: string; params: unknown[] } {
  const columns = Object.keys(data);
  const params = Object.values(data);
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");

  let sql = `INSERT INTO ${state.table} (${
    columns.join(", ")
  }) VALUES (${placeholders})`;

  if (conflictOn && conflictOn.length > 0) {
    const updateCols = columns.filter((c) => !conflictOn.includes(c));
    sql += ` ON CONFLICT (${conflictOn.join(", ")})`;
    sql += updateCols.length > 0
      ? ` DO UPDATE SET ${
        updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(", ")
      }`
      : ` DO NOTHING`;
  } else {
    sql += ` ON CONFLICT DO NOTHING`;
  }

  return { sql, params };
}
