/** Options for a {@link TokenReader}. */
export interface TokenReaderOptions {
	/**
	 * How long a resolved value is trusted, in milliseconds, before it is read from the
	 * document again. Known causes of change (theme stylesheets, `data-theme`/`class`/`style`
	 * attributes, the color scheme) invalidate immediately regardless; the TTL is the net for
	 * everything else. `Infinity` relies on invalidation alone. Defaults to `500`.
	 */
	ttl?: number;
	/**
	 * Watch the document for changes that invalidate every cached value. Defaults to `true`.
	 */
	observe?: boolean;
}

/** Options for a single lookup. */
export interface TokenLookupOptions {
	/**
	 * The element the token is resolved on, so a `data-theme` subtree resolves against its own
	 * variant. Defaults to `document.documentElement`.
	 */
	scope?: Element;
}

type Entry = { hex: string | undefined; generation: number; at: number };

/**
 * Resolves CSS custom properties to hex colors on the client, whatever they are written as —
 * `color-mix()`, `oklch()`, `var()` chains, `light-dark()`.
 *
 * Built for per-frame lookups: a hit is a map lookup and a clock read. A miss reads the
 * property's computed value and converts it through a 1×1 canvas, and that conversion is cached
 * by its input string forever, so a theme switch costs one style read per token rather than a
 * pixel readback.
 *
 * Returns `#rrggbb`, or `#rrggbbaa` when the color is not fully opaque, or `undefined` when the
 * token is not set or is not a color.
 *
 * @example
 * ```ts
 * const tokens = new TokenReader();
 * function frame() {
 *   ctx.fillStyle = tokens.hex("--color-primary-500") ?? "#000000";
 *   requestAnimationFrame(frame);
 * }
 * ```
 */
export class TokenReader {
	#ttl: number;
	#observe: boolean;
	#generation = 0;
	#cache = new WeakMap<Element, Map<string, Entry>>();
	#teardown?: () => void;

	constructor(options: TokenReaderOptions = {}) {
		this.#ttl = options.ttl ?? 500;
		this.#observe = options.observe ?? true;
	}

	/** Resolves `token` (with or without the leading `--`) to a hex color. */
	hex(token: string, options: TokenLookupOptions = {}): string | undefined {
		if (typeof document === "undefined") return undefined;
		if (this.#observe && !this.#teardown) this.#watch();
		const scope = options.scope ?? document.documentElement;
		const name = token.startsWith("--") ? token : `--${token}`;

		let tokens = this.#cache.get(scope);
		if (!tokens) this.#cache.set(scope, tokens = new Map());

		const now = performance.now();
		const hit = tokens.get(name);
		if (hit && hit.generation === this.#generation && now - hit.at < this.#ttl) return hit.hex;

		const hex = resolve(name, scope);
		tokens.set(name, { hex, generation: this.#generation, at: now });
		return hex;
	}

	/** Drops every cached value; the next lookup of each token reads the document again. */
	invalidate(): void {
		this.#generation++;
	}

	/** Stops watching the document. Lookups keep working, governed by the TTL alone. */
	dispose(): void {
		this.#teardown?.();
		this.#teardown = undefined;
		this.#observe = false;
	}

	#watch(): void {
		const invalidate = () => this.invalidate();
		const observer = new MutationObserver(invalidate);
		observer.observe(document.documentElement, {
			subtree: true,
			attributes: true,
			attributeFilter: ["class", "style", "data-theme"],
		});
		if (document.head) {
			observer.observe(document.head, { subtree: true, childList: true, characterData: true });
		}
		const scheme = matchMedia("(prefers-color-scheme: dark)");
		const contrast = matchMedia("(prefers-contrast: more)");
		scheme.addEventListener("change", invalidate);
		contrast.addEventListener("change", invalidate);
		this.#teardown = () => {
			observer.disconnect();
			scheme.removeEventListener("change", invalidate);
			contrast.removeEventListener("change", invalidate);
		};
	}
}

let shared: TokenReader | undefined;

/**
 * Resolves a token to a hex color through a shared {@link TokenReader} with default options.
 *
 * @example
 * ```ts
 * tokenHex("--color-primary-500"); // "#3b82f6"
 * tokenHex("btn-primary-bg", { scope: sidebar });
 * ```
 */
export function tokenHex(token: string, options?: TokenLookupOptions): string | undefined {
	return (shared ??= new TokenReader()).hex(token, options);
}

/** Drops every value cached by {@link tokenHex}. */
export function invalidateTokenHex(): void {
	shared?.invalidate();
}

//#region resolution

const converted = new Map<string, string | undefined>();
const CONVERTED_LIMIT = 1024;
/** Values whose color depends on the element (the canvas would resolve these against itself). */
const CONTEXTUAL = /light-dark\(|currentcolor/i;

function resolve(name: string, scope: Element): string | undefined {
	const value = getComputedStyle(scope).getPropertyValue(name).trim();
	if (!value) return undefined;
	if (CONTEXTUAL.test(value)) {
		const color = probeColor(name, scope);
		return color ? toHex(color) : undefined;
	}
	if (converted.has(value)) return converted.get(value);

	let hex = toHex(value);
	if (hex === undefined) {
		const color = probeColor(name, scope);
		if (color) hex = toHex(color);
	}
	if (converted.size >= CONVERTED_LIMIT) converted.delete(converted.keys().next().value!);
	converted.set(value, hex);
	return hex;
}

let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | undefined;

function context(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
	if (ctx) return ctx;
	const canvas = typeof OffscreenCanvas !== "undefined"
		? new OffscreenCanvas(1, 1)
		: Object.assign(document.createElement("canvas"), { width: 1, height: 1 });
	ctx = canvas.getContext("2d", { willReadFrequently: true }) as
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D;
	return ctx;
}

/** Converts a var-free CSS color to hex, or `undefined` if the canvas does not accept it. */
function toHex(color: string): string | undefined {
	const c = context();
	c.fillStyle = "#000";
	c.fillStyle = color;
	if (c.fillStyle === "#000000") {
		c.fillStyle = "#fff";
		c.fillStyle = color;
		if (c.fillStyle === "#ffffff") return undefined;
	}
	c.clearRect(0, 0, 1, 1);
	c.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = c.getImageData(0, 0, 1, 1).data;
	return formatHex(r, g, b, a);
}

/**
 * Resolves a value the canvas cannot parse on its own (`light-dark()`, `currentColor`, system
 * colors) by letting the element's own context compute it. A value that is not a color makes
 * `color` inherit, so the probe sits inside a parent with a sentinel color and a result equal to
 * the sentinel under two different sentinels means the token is not a color. Both are built
 * before they are attached, so the only mutations a reader's observer sees are child insertions
 * outside `<head>`, which it ignores.
 */
function probeColor(name: string, scope: Element): string | undefined {
	const probes = ["rgb(1,2,3)", "rgb(4,5,6)"].map((sentinel) => {
		const outer = document.createElement("span");
		const inner = document.createElement("span");
		outer.style.cssText = `display:none!important;color:${sentinel}`;
		inner.style.color = `var(${name})`;
		outer.appendChild(inner);
		return [outer, inner] as const;
	});
	scope.append(probes[0][0], probes[1][0]);
	const [a, b] = probes.map(([outer, inner]) => ({
		outer: getComputedStyle(outer).color,
		inner: getComputedStyle(inner).color,
	}));
	probes[0][0].remove();
	probes[1][0].remove();
	if (a.inner === a.outer && b.inner === b.outer) return undefined;
	return a.inner || undefined;
}

/** Formats 0–255 channels as `#rrggbb`, or `#rrggbbaa` when `a` is below 255. */
export function formatHex(r: number, g: number, b: number, a: number = 255): string {
	const hex = "#" + byte(r) + byte(g) + byte(b);
	return a < 255 ? hex + byte(a) : hex;
}

function byte(n: number): string {
	return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

//#endregion
