/**
 * @example Modifying
 * ```
 * // in your app code
 * declare module "@bearmetal/app/context" {
 *   interface ContextMap {
 *     theme: "light" | "dark";
 *     user: User;
 *   }
 * }
 */
export interface ContextMap {
	[key: string]: unknown;
}

type ContextStore = Partial<ContextMap> & Record<string, unknown>;

const defaultContext: ContextStore = {};
const contextStack: ContextStore[] = [defaultContext];

export function setDefaultContext(context: ContextStore) {
	Object.assign(defaultContext, context);
}

export function withContext<T>(context: ContextStore, fn: () => T): T {
	contextStack.push(context);
	try {
		return fn();
	} finally {
		contextStack.pop();
	}
}

export const ctx: ContextMap = new Proxy({} as ContextMap, {
	get(_, prop: string) {
		for (let i = contextStack.length - 1; i >= 0; i--) {
			if (prop in contextStack[i]) return contextStack[i][prop];
		}
		throw new Error(`Context variable '${prop}' not found.`);
	},
	set(_, prop: string, value: unknown) {
		const frame = contextStack.at(-1) ?? defaultContext;
		frame[prop] = value;
		return true;
	},
});

export function getContextItem<K extends keyof ContextMap>(prop: K): ContextMap[K];
export function getContextItem<T>(prop: string): T;
export function getContextItem(prop: string) {
	return ctx[prop];
}

export function getContextItemOrDefault<T>(prop: string, fallback: T): T {
	try {
		return ctx[prop] as T;
	} catch {
		return fallback;
	}
}

export function setContextItem<K extends keyof ContextMap>(
	prop: K,
	value: ContextMap[K],
): void;
export function setContextItem(prop: string, value: unknown): void;
export function setContextItem(prop: string, value: unknown) {
	ctx[prop] = value;
}
