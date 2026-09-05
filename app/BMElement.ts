import {
	BMC,
	Fragment,
	getCurrentOwner,
	isServerRendering,
	setCurrentOwner,
	trackPending,
} from "@bearmetal/jsx";
import type { Signal as Signals } from "@signals";
import { Signal } from "@signals";
import type { ContextMap } from "./context/mod.ts";
import { inject, injectOrThrow, provide } from "./context/mod.ts";
import { effect } from "./signals.ts";
import { coerceProp, declaredProps } from "./prop.ts";
import { declaredState } from "./state.ts";
import { STATE_ATTRIBUTE, takeServerState } from "./hydration.ts";
import { each } from "./built-ins/For.ts";
import type { BMTemplate, RefSignals } from "./types.ts";

export { STATE_ATTRIBUTE } from "./hydration.ts";

function isSignal(S: unknown): S is Signals.State<unknown> | Signals.Computed<unknown> {
	return S instanceof Signal.State || S instanceof Signal.Computed;
}

/**
 * Turns whatever a `template` resolved to into something attachable.
 *
 * A template may legitimately be `null`/`undefined` — a ternary that renders
 * nothing — and DOM APIs disagree about what that means: `appendChild` throws
 * on it, `replaceChildren` stringifies it into the text `"null"`. So "nothing"
 * becomes an empty text node here, once.
 *
 * Anything else that is not already a node goes through the JSX runtime's own
 * child handling, which is what makes `Html` and plain strings work as
 * templates and keeps their escaping rules identical to a child's.
 */
function toNode(v: unknown): Node {
	if (v instanceof Node) return v;
	if (v == null) return document.createTextNode("");
	return Fragment({ children: v });
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

	static get stylesheet(): string | CSSStyleSheet | undefined {
		return undefined;
	}

	#cleanups: Array<() => void> = [];

	/**
	 * True from `disconnectedCallback()` until the deferred teardown it schedules
	 * either runs or is cancelled by a same-tick reconnect. See `disconnectedCallback`.
	 */
	#disconnectPending = false;

	#refs = new Map<string, Signal.State<Element | undefined>>();

	#refSignal(name: string): Signal.State<Element | undefined> {
		let sig = this.#refs.get(name);
		if (!sig) {
			sig = new Signal.State<Element | undefined>(undefined);
			this.#refs.set(name, sig);
		}
		return sig;
	}

	get refs(): RefSignals<TRefs> {
		return new Proxy({} as RefSignals<TRefs>, {
			get: (_, key: string) => this.#refSignal(key),
		});
	}

	registerRef(name: string, el: Element): void {
		this.#refSignal(name).set(el);
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

		const onServer = isServerRendering();

		// A client-only component is its tag and its attributes on the server and
		// nothing else. Whatever it needs — a canvas, a media element, a map — was
		// never going to survive serialization, so the browser builds it from
		// scratch when the element upgrades.
		if (onServer && (this.constructor as typeof BMElement).client) return;

		if (!onServer) this.#hydrateState();

		const prevOwner = getCurrentOwner();
		setCurrentOwner(this);
		try {
			// `serverInit()` starts before the template renders, so whatever it sets
			// synchronously — everything up to its first `await` — is already in
			// place for the first pass, and the rest arrives through the signals it
			// writes once the renderer has awaited it.
			if (onServer) this.#runServerInit();

			// `init()` runs before the template is ever evaluated, so refs are
			// never available synchronously in init() — only from inside an
			// effect it registers, once #registerRefs() below sets them. That's
			// not a special case for refs: init() runs once, up front, and
			// everything the template produces (nodes, refs) comes strictly
			// after it, mounted immediately with nothing else interposed.
			if (!onServer) this.#runInit();

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
				if (node) {
					this.#registerRefs(node);
					this.#attach(node);
				}
				return;
			}
			this.addEffect(() => {
				const node = toNode(t.get());
				this.#registerRefs(node);
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
	 * Each ref is a `Signal.State`, and this always runs after `init()` — so a
	 * ref is never set yet when `init()` runs. A consumer reads `this.refs.x`
	 * from inside an effect it registers there, which simply fires once this
	 * sets it, the same as any other signal. A reactive template calls this on
	 * every re-render, so a ref present in a previous render but missing from
	 * this one is reset to `undefined` rather than left pointing at a detached
	 * element.
	 */
	#registerRefs(node: Node): void {
		const found = new Set<string>();
		if (node.nodeType !== Node.TEXT_NODE) {
			(node as HTMLElement).querySelectorAll?.("[ref]")?.forEach((el) => {
				const name = el.getAttribute("ref")!;
				found.add(name);
				this.registerRef(name, el);
			});
		}
		for (const [name, sig] of this.#refs) {
			if (!found.has(name)) sig.set(undefined);
		}
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
	 * One template, built by one runtime, on a server and in a browser alike.
	 *
	 * @remarks
	 * If you have `noImplicitOverride` enabled, use the `override` keyword:
	 * `protected override get template() { ... }`
	 */
	protected get template(): BMTemplate {
		return undefined;
	}

	/**
	 * Called once when the component connects to the DOM **in a browser**,
	 * before the template has rendered anything. Override this to set up
	 * effects, refs, or one-time logic.
	 *
	 * Returning a function registers it as a cleanup, run on disconnect.
	 *
	 * This is the client half of the lifecycle, and it does not run during a
	 * server render: listeners, timers and subscriptions have nothing to attach
	 * to there, and a page that is about to be serialized and thrown away should
	 * not be starting them. Server-side work belongs in
	 * {@linkcode BMElement.serverInit}.
	 *
	 * Because this runs before the template renders, a `ref` it declares is not
	 * registered yet — `this.refs.name` reads `undefined` if you call `.get()`
	 * on it synchronously here. Read a ref from inside an effect instead; it
	 * fires once the template registers it, the same as any other signal.
	 *
	 * @example
	 * ```ts
	 * protected init() {
	 *   this.addEffect(() => console.log("mounted"));
	 *   this.addEffect(() => this.refs.input.get()?.focus());
	 *   const id = setInterval(tick, 1000);
	 *   return () => clearInterval(id);
	 * }
	 * ```
	 *
	 * @remarks You may use `override` if you have `noImplicitOverride` enabled.
	 */
	protected init(): void | (() => void) {}

	/**
	 * Called once when the component renders **on the server**. Override it to
	 * load whatever the markup needs.
	 *
	 * It is an ordinary async method on the instance, so it sets state directly
	 * — `this.rows.set(await db.rows())` — with no props bag to thread a return
	 * value back through. The renderer does not wait for it before rendering: it
	 * renders immediately, collects every `serverInit()` in the tree, awaits them
	 * together, and lets the signals they wrote patch the markup that already
	 * exists. That is what keeps rendering synchronous while still allowing real
	 * I/O, and it means sibling components load in parallel rather than in tree
	 * order.
	 *
	 * Mark anything you set here `@state` and the browser picks it up on
	 * hydration instead of fetching it a second time.
	 *
	 * @example
	 * ```ts
	 * @state() accessor rows = this.signal<Row[]>([]);
	 *
	 * override async serverInit() {
	 *   this.rows.set(await db.query("select * from rows"));
	 * }
	 * ```
	 */
	protected serverInit(): void | Promise<void> {}

	/** True between `init()`/`serverInit()` running and the teardown that ends it. */
	#initialized = false;

	/**
	 * Runs `init()` once per connection and registers any teardown it returns.
	 *
	 * Untracked, and guarded, and called before the template ever renders.
	 * `init()` is lifecycle, not rendering: a signal it reads must not become a
	 * dependency of the template that mounts after it, or an ordinary store
	 * update would re-render the component — and re-run `init`, which is
	 * documented to run once and is where subscriptions and fetches live.
	 */
	#runInit(): void {
		if (this.#initialized) return;
		this.#initialized = true;
		const cleanup = Signal.subtle.untrack(() => this.init());
		if (typeof cleanup === "function") this.registerCleanup(cleanup);
	}

	/**
	 * Starts `serverInit()` and hands the promise to the renderer.
	 *
	 * Untracked for the reason `init()` is: what it reads is its own business,
	 * not a dependency of whatever render happened to mount it.
	 */
	#runServerInit(): void {
		if (this.#initialized) return;
		this.#initialized = true;
		const work = Signal.subtle.untrack(() => this.serverInit());
		if (work) trackPending(work);
	}

	/** Every `@state` signal on this component, by name. */
	#stateSignals(): Array<[string, Signals.State<unknown>]> {
		const entries: Array<[string, Signals.State<unknown>]> = [];
		for (const name of declaredState(this.constructor)) {
			const signal = (this as unknown as Record<string, unknown>)[name];
			if (signal instanceof Signal.State) entries.push([name, signal]);
		}
		return entries;
	}

	/**
	 * Writes this component's `@state` into its own markup.
	 *
	 * The server renderer calls this once every `serverInit()` has settled — so
	 * the values recorded are the ones the browser should start from, not the
	 * empty ones the first pass rendered with.
	 */
	serializeState(): void {
		const entries = this.#stateSignals();
		if (entries.length === 0) return;
		const snapshot: Record<string, unknown> = {};
		for (const [name, signal] of entries) snapshot[name] = signal.get();
		this.setAttribute(STATE_ATTRIBUTE, JSON.stringify(snapshot));
	}

	/**
	 * Reads server-rendered `@state` back into its signals, before the first render.
	 *
	 * The attribute is the direct case: this element is the one the server sent.
	 * Failing that it asks {@linkcode takeServerState}, which is the same element
	 * one rebuild later — the server-rendered original was discarded when an
	 * ancestor re-rendered, and this is its replacement standing in the same
	 * place. See `./hydration.ts`.
	 */
	#hydrateState(): void {
		const raw = this.getAttribute(STATE_ATTRIBUTE) ?? takeServerState(this);
		if (raw == null) return;
		this.removeAttribute(STATE_ATTRIBUTE);

		let snapshot: Record<string, unknown>;
		try {
			snapshot = JSON.parse(raw);
		} catch (error) {
			console.warn(`${this.tag}: ignoring unparseable ${STATE_ATTRIBUTE}`, error);
			return;
		}

		for (const [name, signal] of this.#stateSignals()) {
			if (name in snapshot) signal.set(snapshot[name]);
		}
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
 * Reads the ref signals of the nearest owning component. This is how a
 * functional component reaches a `ref` it declared, since it has no
 * `this.refs` of its own.
 *
 * Each property is a `Signal.State<Element | undefined>` — read it from inside
 * a `computed()`/`effect()` the same way you'd read any other signal, rather
 * than assuming the element is already there.
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
 *   effect(() => refs.input.get()?.focus());
 *   return el;
 * }
 * ```
 */
export function getRefs<T extends Record<string, Element> = Record<string, Element>>(): RefSignals<
	T
> {
	const owner = getCurrentOwner();
	if (!owner?.refs) {
		console.warn(
			"getRefs() called without an owner — no refs are reachable.\n" +
				"Call getRefs() inside:\n" +
				"  • a functional component rendered by a BMElement\n" +
				"  • a BMElement.init() method\n" +
				"  • an each() render callback",
		);
		return {} as RefSignals<T>;
	}
	return owner.refs as RefSignals<T>;
}
