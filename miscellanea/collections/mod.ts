export class CollectionMap<K, V> extends Map<K, Set<V>> {
	add(key: K, value: V): this {
		if (!super.has(key)) super.set(key, new Set());
		super.get(key)!.add(value);
		return this;
	}

	remove(key: K, value: V): this {
		super.get(key)?.delete(value);
		if (super.get(key)?.size === 0) super.delete(key);
		return this;
	}

	hasValue(key: K, value: V): boolean {
		return super.get(key)?.has(value) ?? false;
	}

	valuesOf(key: K): Set<V> {
		return super.get(key) ?? new Set();
	}

	merge(key: K, values: Iterable<V>): this {
		for (const value of values) this.add(key, value);
		return this;
	}

	flat(): V[] {
		return [...super.values()].flatMap((set) => [...set]);
	}

	toJSON(): { __type: string; __id: unknown; data: (K | V[])[][] } {
		let __id = undefined;
		if ("key" in this) __id = this.key;
		const item = {
			__type: this.constructor.name,
			__id,
			data: [...super.entries()].map(([k, v]) => [k, [...v]]),
		};
		return item;
	}

	static fromJSON<K, V>(data: [K, V[]][]): CollectionMap<K, V> {
		const map = new CollectionMap<K, V>();
		for (const [k, values] of data) map.merge(k, values);
		return map;
	}
}

export class IndexedCollectionMap<K, V> extends CollectionMap<K, V> {
	private index = new Map<K, V>();
	private key: keyof V;

	constructor(key: keyof V = "id" as keyof V) {
		super();
		this.key = key;
	}

	override add(key: K, value: V): this {
		super.add(key, value);
		const id = value[this.key] as unknown as K;
		if (id !== undefined && !this.index.has(id)) this.index.set(id, value);
		return this;
	}

	byId(id: K): V | undefined {
		return this.index.get(id);
	}

	static override fromJSON<K, V>(
		data: [K, V[]][],
		key?: keyof V,
	): IndexedCollectionMap<K, V> {
		const map = new IndexedCollectionMap<K, V>(key);
		for (const [k, values] of data) map.merge(k, values);
		return map;
	}
}

const deserializers = {
	"CollectionMap": CollectionMap.fromJSON,
	"IndexedCollectionMap": IndexedCollectionMap.fromJSON,
};

export function deserialize(raw: unknown): unknown {
	if (typeof raw === "object" && raw !== null && "__type" in raw) {
		const { __type, __key, data } = raw as {
			__type: string;
			__key: string | undefined;
			data: [];
		};
		const fn = deserializers[__type as keyof typeof deserializers];
		if (fn) return fn(data, __key);
	}
	return raw;
}
