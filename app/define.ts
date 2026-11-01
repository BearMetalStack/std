import type { BMC } from "@bearmetal/jsx";
import { onDomChanged } from "@bearmetal/jsx";
import { hotStandIn, hotSwap, isHotEnabled } from "./hmr.ts";
import { isBrowser } from "./util/environment.ts";
import { beginConstruction, endConstruction } from "./util/construction.ts";

type BmElementConstructor = {
	new (...args: any[]): BMC;
	tag: string;
	stylesheet?: string | CSSStyleSheet;
};

const stylesheetRegistry = new Map<string, string>();

/**
 * Every `@define`d component, whether or not a registry has taken it yet.
 *
 * A class decorator runs when its module is evaluated. In a browser there is a
 * `customElements` by then; on a server the microdom is not installed until the
 * first render, which is much later — so a decorator that could only register
 * *now* would silently register nothing, and every component would serialize as
 * an empty tag.
 */
const definitions = new Map<string, CustomElementConstructor>();

/** Registers everything not already registered. Safe to call repeatedly. */
function defineAll(): void {
	if (typeof customElements === "undefined") return;
	for (const [tag, ctor] of definitions) {
		if (customElements.get(tag)) continue;
		const registered = isHotEnabled() ? hotStandIn(tag, ctor) : ctor;
		customElements.define(tag, registered);
	}
}

// Runs now, and again whenever a DOM appears. Between the two, the order of
// "install the microdom" and "import the components" stops mattering.
onDomChanged(defineAll);

export function getTagStylesheet(tag: string): string | undefined {
	return stylesheetRegistry.get(tag);
}
export function getAllStylesheets(): string {
	return stylesheetRegistry.values().toArray().join("\n");
}

/**
 * Names a component and registers it as a custom element.
 *
 * The tag is normalized (see {@linkcode normalizeComponentName}) and set as the
 * class's `static tag`, so `${this.tag}` in a stylesheet and `<my-thing />` in a
 * template always agree.
 *
 * There is no second argument. `@define` used to take `import.meta` so that the
 * server renderer could look up a tag's module and bundle it — the client bundle
 * is now built from the components directory in one pass instead of assembled
 * per page, so there is nothing to look up. See the
 * [components directory](https://bear-metal.dev/getting-started/components/component-directory).
 *
 * @example
 * ```tsx
 * @define("counter")
 * export class Counter extends BMElement {
 *   get template() { return <span>{this.count}</span>; }
 * }
 * ```
 */
export function define(
	tag: string,
): <T extends BmElementConstructor>(target: T, context: ClassDecoratorContext) => T {
	return function <T extends BmElementConstructor>(
		original: T,
		context: ClassDecoratorContext,
	): T {
		tag = normalizeComponentName(tag);
		original.tag = tag;

		// Constructing through a frame is what lets a class field initializer
		// call `createEffect()` and have the element own it. See
		// `./util/construction.ts`.
		const target = {
			[original.name]: class extends original {
				// `super()` inside `try` is deliberate: the frame must close even
				// when a constructor throws.
				// deno-lint-ignore no-explicit-any constructor-super
				constructor(...args: any[]) {
					const prev = beginConstruction();
					try {
						super(...args);
					} finally {
						endConstruction(prev);
					}
				}
			},
		}[original.name] as T;

		// Register the element wherever there is a registry to register it with.
		// A server has one now — the microdom's — and that is precisely what lets
		// one component render on both sides, so this is no longer gated on
		// `typeof document`. If no registry exists yet, `defineAll` picks it up
		// when one does.
		context.addInitializer(() => register(tag, target as unknown as CustomElementConstructor));

		// The stylesheet the server inlines for this tag. Recorded unconditionally
		// — the cost is a Map entry, and the alternative is a component that
		// silently ships without styles depending on where it was first imported.
		const s = target.stylesheet;
		if (typeof s === "string") stylesheetRegistry.set(tag, s.replaceAll(/:scope/gm, tag));

		// Adopting a stylesheet into `document.head`, on the other hand, is only
		// meaningful in a browser. Doing it server-side would pile every
		// component's CSS into one long-lived microdom that no response ever
		// serializes.
		if (!isBrowser() || !s || isHotEnabled() && definitions.has(tag)) return target;

		if (!document.head.querySelector(`style#${tag}`)) {
			if (s instanceof CSSStyleSheet) {
				document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
			} else {
				const style = document.createElement("style");
				style.textContent = s.replaceAll(/:scope/gm, tag);
				style.id = tag;
				document.head.appendChild(style);
			}
		}
		return target;
	};
}

/** Records a definition and registers it, or hot-swaps it in if it is a reload. */
function register(tag: string, ctor: CustomElementConstructor): void {
	const hot = isHotEnabled() && definitions.has(tag);
	definitions.set(tag, ctor);
	if (hot) hotSwap(tag, ctor);
	else defineAll();
}

/**
 * Registers any `HTMLElement` subclass as a custom element: `@define` without
 * the `BMElement` machinery (no construction frame, no stylesheet registry).
 * For thin elements whose look is CSS keyed on the tag and whose behaviour,
 * if any, is a few lines of plain DOM.
 *
 * It registers wherever `@define` does (a server's microdom included) and
 * hot-swaps the same way. Each application wraps the class in its own
 * subclass, because one constructor can only be registered under one name, so
 * stacking several gives one class several tags.
 *
 * @example
 * ```ts
 * @element("bm-panel")
 * @element("bm-card")
 * export class Surface extends HTMLElement {
 *   connectedCallback() { this.setAttribute("role", "group"); }
 * }
 * ```
 */
export function element(
	tag: string,
): <T extends new (...args: any[]) => HTMLElement>(
	target: T,
	context: ClassDecoratorContext,
) => T {
	return function <T extends new (...args: any[]) => HTMLElement>(
		original: T,
		context: ClassDecoratorContext,
	): T {
		const name = normalizeComponentName(tag);
		const target = { [original.name]: class extends original {} }[original.name] as
			& T
			& { tag: string };
		target.tag = name;
		context.addInitializer(() => register(name, target as unknown as CustomElementConstructor));
		return target;
	};
}

function isValidComponentName(tag: string) {
	return /^[a-z][a-z0-9]+(-[a-z0-9]+)+$/.test(tag);
}

/**
 * Coerces a user-supplied tag into a valid custom element name.
 *
 * Punctuation and camelCase boundaries become word breaks, words are joined
 * with hyphens, and a `my-` prefix is added if the result still lacks the
 * hyphen that the custom element spec requires.
 *
 * Already-valid names pass through unchanged.
 *
 * @example
 * normalizeComponentName("My Component");            // "my-component"
 * normalizeComponentName("My *very cool* Component") // "my-very-cool-component"
 * normalizeComponentName("component");               // "my-component"
 */
export function normalizeComponentName(tag: string): string {
	const words = tag
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.trim()
		.toLowerCase();

	if (!words) {
		throw new Error(
			`@define("${tag}") does not contain any alphanumeric characters to build a tag name from.`,
		);
	}

	const normalized = words.replace(/\s+/g, "-");
	if (isValidComponentName(normalized)) return normalized;

	const prefixed = `my-${normalized}`;
	if (isValidComponentName(prefixed)) return prefixed;

	throw new Error(
		`@define("${tag}") normalizes to "${prefixed}", which is not a valid custom element name.`,
	);
}
