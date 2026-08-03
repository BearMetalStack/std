import { BMC, getCurrentOwner, setCurrentOwner, setEffectImpl } from "@bearmetal/jsx/client";
import type { Signal as Signals } from "@signals";
import { Signal } from "@signals";
import type { ContextMap } from "./context/mod.ts";
import { inject, injectOrThrow, provide } from "./context/mod.ts";
import { effect } from "./signals.ts";
import { coerceProp, declaredProps } from "./prop.ts";
import { each } from "./built-ins/For.ts";
import type { BMTemplate } from "./types.ts";

setEffectImpl(effect);

function isSignal(S: unknown): S is Signals.State<unknown> | Signals.Computed<unknown> {
	return S instanceof Signal.State || S instanceof Signal.Computed;
}

/**
 * A `template` signal may legitimately resolve to `null`/`undefined` (e.g. a
 * ternary that renders nothing). DOM APIs don't agree on what that means:
 * `appendChild` requires a real `Node` and throws on `null`, while
 * `replaceChildren` silently stringifies it into the text `"null"`. Route
 * every template value through here first so "nothing" reliably becomes an
 * empty text node instead of a crash or stray text.
 */
function toNode(v: unknown): Node {
	if (v instanceof Node) return v;
	return document.createTextNode("");
}

export abstract class BMElement<
	TRefs extends Record<string, Element> = Record<string, Element>,
> extends BMC {
	static register(): typeof BMElement | undefined {
		if (typeof customElements === "undefined") return;
		if (!this.tag) throw new Error(`${this.name} must define a static tag`);
		if (customElements.get(this.tag)) return;
		customElements.define(this.tag, this as unknown as CustomElementConstructor);
		return this;
	}

	static override async serverRender(
		props: Record<string, unknown>,
		children: string,
	): Promise<string> {
		const inst = new (this as unknown as new () => BMElement)();
		for (const [k, v] of Object.entries(props)) {
			// SSR is a one-shot render with no owner to keep a binding alive, so
			// a signal prop is snapshotted rather than shared by reference.
			const value = isSignal(v) ? v.get() : v;
			// A `@prop`-declared field's accessor is already the signal; write
			// through it directly. Anything undeclared falls back to the signals
			// bag and a plain property, since there's no accessor to reach it by.
			const declared = (inst as Record<string, unknown>)[k];
			if (declared instanceof Signal.State) {
				declared.set(value);
				continue;
			}
			if (!inst.signals[`$${k}`]) inst.signals[`$${k}`] = new Signal.State(value);
			(inst as Record<string, unknown>)[k] = value;
		}
		// deno-lint-ignore no-explicit-any
		const tpl = await (inst as any).template;
		if (tpl == null) return children;
		return String(tpl);
	}

	static get stylesheet(): string | CSSStyleSheet | undefined {
		return undefined;
	}

	#cleanups: Array<() => void> = [];

	/**
	 * True from `disconnectedCallback()` until the deferred teardown it schedules
	 * either runs or is cancelled by a same-tick reconnect. See `disconnectedCallback`.
	 */
	#disconnectPending = false;

	signals: Record<string, Signals.State<unknown>> = {};

	#refs = new Map<string, Element>();

	get refs(): TRefs {
		return new Proxy({} as TRefs, {
			get: (_, key: string) => this.#refs.get(key),
		});
	}

	registerRef(name: string, el: Element): void {
		this.#refs.set(name, el);
	}

	get tag(): string {
		return (this.constructor as typeof BMElement).tag;
	}

	/**
	 * Attributes backing the props declared with `@prop`.
	 *
	 * `readonly` so subclasses may narrow with `as const` - a mutable `string[]`
	 * is invariant and rejects a `readonly [...]` literal.
	 */
	static get observedAttributes(): readonly string[] {
		return Object.keys(declaredProps(this));
	}

	/**
	 * Mirrors an observed attribute back into its prop signal. The JSX runtime
	 * writes strings, numbers, and booleans as attributes, so this is the path a
	 * parent's update takes to reach a child's `@prop`.
	 */
	attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
		const type = declaredProps(this.constructor)[name];
		if (!type) return;

		const signal = (this as unknown as Record<string, unknown>)[name];
		if (signal instanceof Signal.State) signal.set(coerceProp(type, value));
	}

	registerCleanup(fn: () => void): void {
		this.#cleanups.push(fn);
	}

	connectedCallback(): void {
		if (this.#disconnectPending) {
			this.#disconnectPending = false;
			return;
		}

		const raw = this.dataset.serverProps;
		if (raw) {
			const loaded = JSON.parse(atob(raw));
			for (const [key, value] of Object.entries(loaded)) {
				const declared = (this as unknown as Record<string, unknown>)[key];
				if (declared instanceof Signal.State) {
					declared.set(value);
					continue;
				}
				const sig = this.signals[`$${key}`];
				if (!sig) {
					this.signals[`$${key}`] = this.signal(value);
					continue;
				}
				if (sig instanceof Signal.State) {
					sig.set(value);
				}
			}
		}

		const prevOwner = getCurrentOwner();
		setCurrentOwner(this);
		try {
			const t = this.template;
			if (!isSignal(t)) {
				// One path for both "no template" and "static template", so `init()`
				// has a single call site and runs either way — a component may be pure
				// behaviour with nothing to render.
				//
				// A static template has nothing to re-render, so mounting it inside a
				// reactive effect buys nothing and costs two real bugs:
				//
				// - Every signal `init()` touches would become a dependency of the
				//   mount itself, so the first unrelated store update re-renders the
				//   whole component (and re-runs `init`).
				// - `t` is captured once, and appending a DocumentFragment *empties*
				//   it. A second pass would then `replaceChildren()` with an empty
				//   fragment and blank the component outright — which is what a
				//   fragment-templated view did the moment anything it read resolved.
				const node = t ? toNode(t) : null;
				if (node) this.#registerRefs(node);
				this.#runInit();
				if (node) this.#attach(node);
				return;
			}
			this.addEffect(() => {
				const node = toNode(t.get());
				this.#registerRefs(node);
				this.#runInit();
				this.#attach(node);
			});
		} catch (e) {
			console.log(this.tag, e);
		} finally {
			setCurrentOwner(prevOwner);
		}
	}

	/**
	 * Registers the `ref=` attributes in a rendered tree.
	 *
	 * Runs before `init()`, which is documented to reach them as `this.refs`.
	 */
	#registerRefs(node: Node): void {
		if (node.nodeType === Node.TEXT_NODE) return;
		(node as HTMLElement).querySelectorAll?.("[ref]")?.forEach((el) =>
			this.registerRef(el.getAttribute("ref")!, el)
		);
	}

	/** Puts a rendered tree in the root, replacing whatever was there. */
	#attach(node: Node): void {
		if (this.root.hasChildNodes()) {
			this.root.replaceChildren(node);
		} else {
			this.root.appendChild(node);
		}
	}

	disconnectedCallback(): void {
		this.#disconnectPending = true;
		queueMicrotask(() => {
			if (!this.#disconnectPending) return;
			this.#disconnectPending = false;
			this.#initialized = false;
			for (const cleanup of this.#cleanups) cleanup();
			this.#cleanups = [];
		});
	}

	/**
	 * Defines the component's DOM structure.
	 *
	 * @remarks
	 * If you have `noImplicitOverride` enabled, use the `override` keyword:
	 * `protected override get template() { ... }`
	 */
	protected get template(): BMTemplate {
		return undefined;
	}

	/**
	 * Called once when the component connects to the DOM.
	 * Override this to set up effects, refs, or one-time logic.
	 *
	 * Returning a function registers it as a cleanup, run on disconnect.
	 *
	 * @example
	 * ```ts
	 * protected init() {
	 *   this.addEffect(() => console.log("mounted"));
	 *   const id = setInterval(tick, 1000);
	 *   return () => clearInterval(id);
	 * }
	 * ```
	 *
	 * @remarks You may use `override` if you have `noImplicitOverride` enabled.
	 */
	protected init(): void | (() => void) {}

	/** True between `init()` running and the disconnect that tears it down. */
	#initialized = false;

	/**
	 * Runs `init()` once per connection and registers any teardown it returns.
	 *
	 * Untracked, and guarded. `init()` is lifecycle, not rendering: a signal it
	 * reads must not become a dependency of the template that mounted it, or an
	 * ordinary store update would re-render the component — and re-run `init`,
	 * which is documented to run once and is where subscriptions and fetches
	 * live.
	 */
	#runInit(): void {
		if (this.#initialized) return;
		this.#initialized = true;
		const cleanup = Signal.subtle.untrack(() => this.init());
		if (typeof cleanup === "function") this.registerCleanup(cleanup);
	}

	protected addEffect(fn: () => (() => void) | void): void {
		this.#cleanups.push(effect(fn));
	}

	protected signal<T>(initialValue: T): Signals.State<T> {
		return new Signal.State(initialValue);
	}

	protected computed<T>(fn: () => T): Signals.Computed<T> {
		return new Signal.Computed(fn);
	}

	provide<K extends keyof ContextMap>(key: K, value: ContextMap[K]): void {
		provide(this, key, value);
	}

	inject<K extends keyof ContextMap>(key: K): ContextMap[K] | undefined {
		return inject(this.parentElement ?? this, key);
	}

	injectOrThrow<K extends keyof ContextMap>(key: K): ContextMap[K] {
		return injectOrThrow(this.parentElement ?? this, key);
	}
	#shadowRootRef?: ShadowRoot;

	protected useShadow(mode: ShadowRootMode = "open"): ShadowRoot {
		if (this.#shadowRootRef) return this.#shadowRootRef;
		this.#shadowRootRef = this.attachShadow({ mode });
		return this.#shadowRootRef!;
	}

	protected get root(): ShadowRoot | this {
		return this.#shadowRootRef ?? this;
	}

	each = each;

	protected adoptStyleSheet(css: CSSStyleSheet) {
		if (!this.#shadowRootRef) {
			console.warn(
				`${this.tagName}: adoptStyleSheet called but no shadow root exists. Call useShadow() first.`,
			);
			return;
		}
		this.#shadowRootRef.adoptedStyleSheets = [
			...this.#shadowRootRef.adoptedStyleSheets,
			css,
		];
	}
}

/**
 * Reads the refs of the nearest owning component. This is how a functional
 * component reaches a `ref` it declared, since it has no `this.refs` of its own.
 *
 * The returned object is a live view: read from it after the JSX that declares
 * the ref has been evaluated, not before.
 *
 * Refs share one namespace per owning component, so two instances of the same
 * functional component under one parent will collide on the same ref name and
 * the last one registered wins. Name refs accordingly.
 *
 * @example
 * ```tsx
 * function Field() {
 *   const refs = getRefs<{ input: HTMLInputElement }>();
 *   const el = <input ref="input" />;
 *   queueMicrotask(() => refs.input.focus());
 *   return el;
 * }
 * ```
 */
export function getRefs<T extends Record<string, Element> = Record<string, Element>>(): T {
	const owner = getCurrentOwner();
	if (!owner?.refs) {
		console.warn(
			"getRefs() called without an owner — no refs are reachable.\n" +
				"Call getRefs() inside:\n" +
				"  • a functional component rendered by a BMElement\n" +
				"  • a BMElement.init() method\n" +
				"  • an each() render callback",
		);
		return {} as T;
	}
	return owner.refs as T;
}
