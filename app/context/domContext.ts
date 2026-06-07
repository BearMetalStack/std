import type { BMC } from "@bearmetal/jsx";
import type { ContextMap } from "./stackContext.ts";

const PROVIDER_KEY = Symbol("bm-context");

type ProviderMap = Map<string, unknown>;

function getProviderMap(el: BMC): ProviderMap {
	const existing = (el as any)[PROVIDER_KEY];
	if (existing) return existing;
	const map: ProviderMap = new Map();
	(el as any)[PROVIDER_KEY] = map;
	return map;
}

export function provide<K extends keyof ContextMap>(
	el: BMC,
	key: K,
	value: ContextMap[K],
): void;
export function provide(el: BMC, key: string, value: unknown): void;
export function provide(el: BMC, key: string, value: unknown) {
	getProviderMap(el).set(key, value);
}

export function inject<K extends keyof ContextMap>(
	el: BMC,
	key: K,
): ContextMap[K] | undefined;
export function inject<T>(el: BMC, key: string): T | undefined;
export function inject(el: BMC, key: string): unknown {
	let current: Element | null = el;
	while (current) {
		const map: ProviderMap | undefined = (current as any)[PROVIDER_KEY];
		if (map?.has(key)) return map.get(key);
		current = current.parentElement;
	}
	return undefined;
}

export function injectOrThrow<K extends keyof ContextMap>(
	el: BMC,
	key: K,
): ContextMap[K];
export function injectOrThrow<T>(el: BMC, key: string): T;
export function injectOrThrow(el: BMC, key: string): unknown {
	const value = inject(el, key);
	if (value === undefined) {
		throw new Error(`No provider found for context key '${key}'`);
	}
	return value;
}
