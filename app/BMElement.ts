import { BMC, getCurrentOwner, setCurrentOwner, setEffectImpl } from "@bearmetal/jsx/client";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal as Signals } from "@signals";
import { Signal } from "@signals";
import type { ContextMap } from "./context/mod.ts";
import { inject, injectOrThrow, provide } from "./context/mod.ts";
import { effect } from "./signals.ts";
import { coerceProp, declaredProps } from "./prop.ts";
import { each } from "./built-ins/For.ts";

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
			if (!inst.signals[`$${k}`]) inst.signals[`$${k}`] = new Signal.State(v);
			(inst as Record<string, unknown>)[k] = v;
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
		const signal = this.signals[`$${name}`];
		if (signal instanceof Signal.State) signal.set(coerceProp(type, value));
	}

	registerCleanup(fn: () => void): void {
		this.#cleanups.push(fn);
	}

	connectedCallback(): void {
		const raw = this.dataset.serverProps;
		if (raw) {
			const loaded = JSON.parse(atob(raw));
			for (const [key, value] of Object.entries(loaded)) {
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
			if (this.root.hasChildNodes()) {
				const t = this.template;
				if (t !== undefined && isSignal(t)) {
					this.addEffect(() => this.replaceChildren(toNode(t.get())));
				}

				for (const el of this.root.querySelectorAll("[ref]")) {
					this.registerRef(el.getAttribute("ref")!, el);
				}
				this.#runInit();
			} else {
				const t = this.template;
				if (t !== undefined) {
					if (isSignal(t)) {
						const frag = document.createDocumentFragment();
						frag.appendChild(toNode(t.get()));
						this.#runInit();
						this.root.appendChild(frag);
						this.addEffect(() => {
							this.replaceChildren(toNode(t.get()));
						});
					} else {
						const frag = document.createDocumentFragment();
						frag.appendChild(t as Node);
						this.#runInit();
						this.root.appendChild(frag);
					}
				} else {
					this.#runInit();
				}
			}
		} finally {
			setCurrentOwner(prevOwner);
		}
	}

	disconnectedCallback(): void {
		for (const cleanup of this.#cleanups) cleanup();
		this.#cleanups = [];
	}

	/**
	 * Defines the component's DOM structure.
	 *
	 * @remarks
	 * If you have `noImplicitOverride` enabled, use the `override` keyword:
	 * `protected override get template() { ... }`
	 */
	protected get template():
		| JSX.Element
		| Signals.State<JSX.Element | null>
		| Signals.Computed<JSX.Element | null>
		| undefined {
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

	/** Runs `init()` and registers any returned teardown function. */
	#runInit(): void {
		const cleanup = this.init();
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

	protected useShadow(mode: ShadowRootMode = "open"): ShadowRoot {
		return this.shadowRoot ?? this.attachShadow({ mode });
	}

	protected get root(): ShadowRoot | this {
		return this.shadowRoot ?? this;
	}

	each = each;

	protected adoptStyleSheet(css: CSSStyleSheet) {
		if (!this.shadowRoot) {
			console.warn(
				`${this.tagName}: setShadowStyle called but no shadow root exists. Call useShadow() first.`,
			);
			return;
		}
		this.shadowRoot.adoptedStyleSheets = [
			...this.shadowRoot.adoptedStyleSheets,
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
