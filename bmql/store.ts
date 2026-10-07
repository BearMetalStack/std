/**
 * @module
 * A reactive table store queried and written with BMQL.
 *
 * ```ts
 * import { Store } from "@bearmetal/bmql/store";
 * import { computeValues } from "@bearmetal/bmql";
 * import { f } from "@bearmetal/forge";
 *
 * const store = new Store();
 * const characters = store.table("characters", f.object({ name: f.string(), level: f.number() }));
 * characters.insert({ name: "Sel", level: 5 });
 *
 * store.merge("characters{name:Sel}", { level: 6 });
 * store.values("characters{level:>5}.name"); // ["Sel"]
 * computeValues(store.root, "characters.name"); // live
 * ```
 */

import { Signal } from "@bearmetal/app/signals";
import type { Schema, ValidationIssue } from "@bearmetal/forge";
import { SchemaError } from "@bearmetal/forge";
import { evaluate, values } from "./evaluate.ts";
import { parse } from "./parser.ts";
import type { EvaluateOptions, Location, Query, Update, WriteOptions } from "./types.ts";
import { WriteBatch } from "./write.ts";

export { WriteBatch };

type Apply = (batch: WriteBatch, location: Location) => boolean;

/**
 * Named tables of rows, all reachable from one reactive `root`.
 *
 * Every write is one batch: matches are found first, then written, then any
 * row that changed is checked against its table's schema. A failure puts every
 * signal back as it was and throws the `SchemaError`.
 *
 * Writes apply to **every** match unless `limit` says otherwise; narrow the
 * query with a slice (`characters{name:Sel}[0]`) to write one.
 */
export class Store {
	/**
	 * `{ [table]: rows }`, as signals. Pass it to `compute`, `computeText` or
	 * `bmqlRules` to query the store reactively.
	 */
	readonly root: Signal.State<Record<string, Signal.State<unknown[]>>> = new Signal.State({});
	#tables = new Map<string, Table<unknown>>();

	/**
	 * The table called `name`, created on first use. A schema can only be
	 * given when the table is created.
	 */
	table<T = Record<string, unknown>>(name: string, schema?: Schema<T>): Table<T> {
		const existing = this.#tables.get(name);
		if (existing) {
			if (schema) throw new Error(`bmql: table "${name}" already exists`);
			return existing as Table<T>;
		}
		const table = new Table<T>(this, name, schema);
		this.#tables.set(name, table as Table<unknown>);
		this.root.set({ ...this.root.get(), [name]: table.rows as Signal.State<unknown[]> });
		return table;
	}

	/** The names of every table, in creation order. */
	get tables(): string[] {
		return [...this.#tables.keys()];
	}

	/** Every location `query` lands on, from the store's root. */
	query(query: string | Query, options?: EvaluateOptions): Location[] {
		return evaluate(this.root, query, options);
	}

	/** Every value `query` lands on, from the store's root. */
	values(query: string | Query, options?: EvaluateOptions): unknown[] {
		return values(this.root, query, options);
	}

	/** Replaces each match with `value`, or with what `value(current)` returns. Returns the count. */
	update(query: string | Query, value: Update, options?: WriteOptions): number {
		return this.write(this.root, query, options, updating(value));
	}

	/** Shallow-merges `patch` into each match that is an object. Returns how many were merged. */
	merge(query: string | Query, patch: object, options?: WriteOptions): number {
		return this.write(this.root, query, options, merging(patch));
	}

	/** Removes each match from its container. Returns how many were removed. */
	delete(query: string | Query, options?: WriteOptions): number {
		return this.write(this.root, query, options, removing);
	}

	/** Runs one write batch against `root`, then validates and commits it. Used by `Table`. */
	write(
		root: unknown,
		query: string | Query,
		options: WriteOptions = {},
		apply: Apply,
	): number {
		const parsed = typeof query === "string" ? parse(query) : query;
		const matches = Signal.subtle.untrack(() => evaluate(root, parsed, options))
			.slice(0, options.limit ?? Infinity);
		const batch = new WriteBatch();
		let written = 0;
		try {
			for (const location of matches) if (apply(batch, location)) written++;
			batch.commit();
			this.#validate(batch);
		} catch (error) {
			batch.rollback();
			throw error;
		}
		return written;
	}

	#validate(batch: WriteBatch) {
		const issues: ValidationIssue[] = [];
		for (const table of this.#tables.values()) {
			const rows = table.rows as Signal.State<unknown>;
			if (!table.schema || !batch.changed.has(rows)) continue;
			const before = new Set(batch.changed.get(rows) as unknown[]);
			for (const [index, row] of table.rows.get().entries()) {
				if (before.has(row)) continue;
				const result = table.schema.safeParse(row);
				if (result.success) continue;
				for (const issue of result.issues) {
					issues.push({ ...issue, path: [table.name, index, ...issue.path] });
				}
			}
		}
		if (issues.length) throw new SchemaError(issues);
	}
}

/**
 * One table of a `Store`. Its queries start at its rows, so `{name:Sel}`
 * filters them directly; store-wide queries name the table first.
 */
export class Table<T> {
	/** The rows, as a signal. Replaced, never mutated, on every write. */
	readonly rows: Signal.State<T[]> = new Signal.State<T[]>([]);

	constructor(
		readonly store: Store,
		readonly name: string,
		readonly schema?: Schema<T>,
	) {}

	/** Appends rows, parsing each through the schema if there is one. Returns them as stored. */
	insert(...rows: T[]): T[] {
		const parsed = this.schema ? rows.map((row) => this.schema!.parse(row)) : rows;
		this.rows.set([...this.rows.get(), ...parsed]);
		return parsed;
	}

	/** Every location `query` lands on, from this table's rows. */
	query(query: string | Query, options?: EvaluateOptions): Location[] {
		return evaluate(this.rows, query, options);
	}

	/** Every value `query` lands on, from this table's rows. */
	values(query: string | Query, options?: EvaluateOptions): unknown[] {
		return values(this.rows, query, options);
	}

	/** `Store.update`, from this table's rows. */
	update(query: string | Query, value: Update, options?: WriteOptions): number {
		return this.store.write(this.rows, query, options, updating(value));
	}

	/** `Store.merge`, from this table's rows. */
	merge(query: string | Query, patch: Partial<T> & object, options?: WriteOptions): number {
		return this.store.write(this.rows, query, options, merging(patch));
	}

	/** `Store.delete`, from this table's rows. */
	delete(query: string | Query, options?: WriteOptions): number {
		return this.store.write(this.rows, query, options, removing);
	}
}

function updating(value: Update): Apply {
	return (batch, location) => {
		batch.set(location, typeof value === "function" ? value(location.value, location) : value);
		return true;
	};
}

function merging(patch: object): Apply {
	return (batch, location) => {
		const current = location.value;
		if (current === null || typeof current !== "object" || Array.isArray(current)) return false;
		batch.set(location, { ...current, ...patch });
		return true;
	};
}

const removing: Apply = (batch, location) => {
	batch.remove(location);
	return true;
};
