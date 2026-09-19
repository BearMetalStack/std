import type { Infer, ObjectSchema, SchemaShape } from "@bearmetal/forge";

interface Database {
	version: number;
	tables: Record<string, Table>;
}

interface Table<T extends Record<string, unknown> = Record<string, unknown>> {
	schema: ObjectSchema<SchemaShape>;
	indices: Record<string, Record<string, number>>;
	data: T[];
}

class Engine {
	#tables = new Map<string, EngineTable<unknown>>();

	table(name: string, schema?: ObjectSchema<SchemaShape>) {
		if (!schema) return this.#tables.get(name);

		const table = new EngineTable<Infer<typeof schema>>(schema);
		this.#tables.set(name, table);
		return table;
	}
}

type QueryString = string;

class EngineTable<T> {
	#data: T[] = [];
	constructor(private _schema: ObjectSchema<SchemaShape>) {}

	insert(record: T) {
		this.#data.push(record);
	}

	update(query: QueryString, data: unknown): boolean {
		const result = runQuery(this.#data, query, 1);
		if (!result.first) return false;
		const { parent, key } = result.first;
		parent[key] = data as typeof parent[typeof key];
		return true;
	}

	merge(query: QueryString, data: Partial<T>): boolean {
		const result = runQuery(this.#data, query, 1);
		if (!result.first) return false;
		const { parent, key, value } = result.first;
		parent[key] = { ...value as object, ...data };
		return true;
	}

	query(query: QueryString, limit = Infinity) {
		return runQuery(this.#data, query, limit);
	}

	delete(query: QueryString, limit = 1): number {
		const result = runQuery(this.#data, query, limit);

		let total = 0;
		for (const row of result.all) {
			if (Array.isArray(row.parent)) {
				row.parent.splice(row.key as number - total, 1);
				total++;
				continue;
			}
			delete row.parent[row.key];
			total++;
		}
		return total;
	}
}

interface QueryResult {
	parent: Record<string | number, unknown>; // todo: this should also support arrays
	key: keyof QueryResult["parent"];
	value: unknown;
}

function runQuery<T>(
	data: T[],
	query: QueryString,
	limit = Infinity,
): { first: QueryResult | null; all: QueryResult[] } {
	throw "Not implemented";
}
