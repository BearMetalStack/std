import { BMC, getCurrentOwner, setCurrentOwner, setEffectImpl } from "@bearmetal/jsx/client";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal as Signals } from "@signals";
import type { ContextMap } from "./context/mod.ts";
import { inject, injectOrThrow, provide } from "./context/mod.ts";
import { each, effect } from "./signals.ts";
import { Signal } from "@signals";

setEffectImpl(effect);

function isSignal(S: unknown): S is Signals.State<unknown> | Signals.Computed<unknown> {
	return S instanceof Signal.State || S instanceof Signal.Computed;
}

export abstract class BMElement<TRefs extends Record<string, Element> = Record<string, Element>>
	extends BMC {
	static register(): typeof BMElement | undefined {
		if (typeof customElements === "undefined") return;
		if (!this.tag) throw new Error(`${this.name} must define a static tag`);
		if (customElements.get(this.tag)) return;
		customElements.define(this.tag, this as unknown as CustomElementConstructor);
		return this;
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
					this.signal(value);
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
			if (t !== undefined) {
				if (isSignal(t)) {
					// render initial value into fragment for refs
					const frag = document.createDocumentFragment();
					frag.appendChild(t.get() as Node);
					this.init();
					this.root.appendChild(frag);
					// effect handles subsequent updates
					this.addEffect(() => {
						this.replaceChildren(t.get() as Node);
					});
				} else {
					// static JSX — render into fragment for refs
					const frag = document.createDocumentFragment();
					frag.appendChild(t as Node);
					this.init();
					this.root.appendChild(frag);
				}
			} else {
				this.init();
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
		| Signals.State<JSX.Element>
		| Signals.Computed<JSX.Element>
		| undefined {
		return undefined;
	}

	protected get shadowTemplate():
		| JSX.Element
		| Signals.State<JSX.Element>
		| Signals.Computed<JSX.Element>
		| undefined {
		return undefined;
	}

	/**
	 * Called once when the component connects to the DOM.
	 * Override this to set up effects, refs, or one-time logic.
	 *
	 * @example
	 * ```ts
	 * protected init() {
	 *   this.addEffect(() => console.log("mounted"));
	 * }
	 * ```
	 *
	 * @remarks You may use `override` if you have `noImplicitOverride` enabled.
	 */
	protected init(): void {}

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
