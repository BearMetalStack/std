type Group<T> = T[] & { __group?: string };
type Groups<T> = {
	[key: string]: Group<T>;
};
type MayPromise<T> = Promise<T> | T;

export class Chain<T> {
	#list: Group<T>[] = [];
	constructor(...lists: T[][]) {
		this.#list.push(...lists);
	}
	static from<T>(...lists: T[][]): Chain<T> {
		return new Chain<T>(...lists);
	}

	static async fromAsync<T>(
		...lists: (MayPromise<T[]> | AsyncGenerator<T>)[]
	): Promise<Chain<T>> {
		const l = [];
		for (const list of lists) {
			if ("then" in list) {
				l.push(list);
			} else if (Symbol.asyncIterator in list) {
				l.push(Array.fromAsync(list));
			}
		}
		return new Chain<T>(...await Promise.all(l));
	}

	*each(): Generator<T, void, unknown> {
		for (const list of this.#list) {
			for (const item of list) {
				yield item;
			}
		}
	}

	toArray(): T[] {
		return this.each().toArray();
	}

	toFiltered(callback: (e: T) => boolean): Chain<T> {
		return new Chain(this.each().filter(callback).toArray());
	}

	toSorted(compareFn?: ((a: T, b: T) => number) | undefined): T[] {
		return this.each().toArray().sort(compareFn);
	}

	groupBy(callback: (e: T) => string): Chain<T> {
		const groups = this.each().reduce((acc, e) => {
			const key = callback(e);
			if (!acc[key]) {
				acc[key] = [];
				acc[key]["__group"] = key;
			}
			acc[key].push(e);
			return acc;
		}, {} as Groups<T>);
		return new Chain<T>(...Object.values(groups));
	}

	get groups(): Group<T>[] {
		return this.#list;
	}

	[Symbol.iterator](): Generator<T, void, unknown> {
		return this.each();
	}
}
