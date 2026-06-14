/**
 * @module Function extension methods for callable composiion
 */

/**
 * Extends Function to return a callable with 3 extension methods
 * @param f The function to extend
 */
export class Fn<TArgs extends unknown[], TReturn> extends Function {
	constructor(f: (...args: TArgs) => TReturn) {
		super();
		return Object.setPrototypeOf(f, Fn.prototype);
	}

	/** Extends the function with the provided callback, receiving the return value of the original function */
	follow<R>(
		callback: (value: TReturn) => R,
	): Fn<TArgs, R> {
		return new Fn((...args: TArgs) => callback(this(...args)));
	}

	/** Extends the function with the provided callback, receiving the returned ArgSet of the original function */
	pipe<A extends unknown[], R>(
		this: Fn<TArgs, ArgSet<A>>,
		callback: (...args: A) => R,
	): Fn<TArgs, R> {
		return new Fn((...args: TArgs) => callback(...this(...args) as A));
	}

	/** Extends the function with the provided callback, taking in its own parameters and returning an ArgSet that matches the original function */
	lead<LArgs extends unknown[] = TArgs>(callback: (...args: LArgs) => TArgs): Fn<LArgs, TReturn> {
		return new Fn((...args: LArgs) => this(...callback(...args)));
	}
}

/** Returns an extended function of the provided function */
export const fn = <TArgs extends unknown[], TReturn>(
	f: (...args: TArgs) => TReturn,
): Fn<TArgs, TReturn> => new Fn<TArgs, TReturn>(f);

export const arg_set = Symbol.for("argset");
export type ArgSet<T extends unknown[]> = T & { [arg_set]: true };

/** Creates a typed ArgSet of a given function */
// deno-lint-ignore no-explicit-any
export function argset<T extends (...args: any) => any>(
	...args: Parameters<T>
): ArgSet<Parameters<T>> {
	return Object.assign(args, { [arg_set]: true }) as ArgSet<Parameters<T>>;
}
