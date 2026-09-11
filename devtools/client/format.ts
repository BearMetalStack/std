/** Renders a binding's value for display in the panel. */
export function formatValue(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (typeof Element !== "undefined" && value instanceof Element) {
		return `<${value.tagName.toLowerCase()}>`;
	}
	if (typeof value === "function") return `ƒ ${value.name || "anonymous"}`;
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

/** Best-effort inverse for the inline `<input>`: try JSON, fall back to raw text. */
export function parseEdit(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/**
 * Reads a binding's value the way the panel displays it, without ever
 * throwing into a reactive computation.
 *
 * Stage 1's `brokenPrivateBinding` (a `#private` accessor field blocked by
 * the open swc#8557 decorator-transform bug) makes `get()` throw by design —
 * this turns that into an inline, per-row error string instead of taking the
 * rest of the panel down with it.
 */
export function safeFormat(binding: { get(): unknown }): string {
	try {
		return formatValue(binding.get());
	} catch (error) {
		return `⚠ ${(error as Error).message}`;
	}
}

/**
 * Adapts a `SignalBinding` for the JSX runtime's `$bind` — the same
 * duck-typed `{get, set}` shape the runtime already treats as a writable
 * signal (`jsx/lib/jsx.ts`'s `isWritableSignal`), so an `<input $bind={...}>`
 * gets a working two-way binding with no manual event wiring.
 *
 * Reads through {@linkcode safeFormat} (consistent formatting, and immune to
 * the swc#8557 `#private`-binding throw) and writes back through
 * {@linkcode parseEdit}.
 */
export function toBindable(binding: { get(): unknown; set(value: unknown): void }): {
	get(): string;
	set(raw: unknown): void;
} {
	return {
		get: () => safeFormat(binding),
		set: (raw: unknown) => binding.set(parseEdit(String(raw))),
	};
}
