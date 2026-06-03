import { effect } from "./signals.ts"; // your effect impl from earlier
import { BMC, setCurrentOwner, setEffectImpl } from "@bearmetal/jsx/client";
import { inject, injectOrThrow, provide } from "./context/mod.ts";
import type { ContextMap } from "./context/mod.ts";
import type { Signal as Signals } from "@signals";
const { Signal } = await import("@signals");

setEffectImpl(effect);

export abstract class BmElement extends BMC {
	static register() {
		if (typeof customElements === "undefined") return;
		if (!this.tag) throw new Error(`${this.name} must define a static tag`);
		if (customElements.get(this.tag)) return;
		customElements.define(this.tag, this as unknown as CustomElementConstructor);
		return this;
	}

	#cleanups: Array<() => void> = [];

	signals: Record<string, Signals.State<unknown>> = {};

	registerCleanup(fn: () => void) {
		this.#cleanups.push(fn);
	}

	connectedCallback() {
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

		setCurrentOwner(this);
		try {
			this.render();
		} finally {
			setCurrentOwner(null);
		}
	}

	disconnectedCallback() {
		for (const cleanup of this.#cleanups) cleanup();
		this.#cleanups = [];
	}

	// Subclasses override this
	protected abstract render(): void;

	protected addEffect(fn: () => (() => void) | void) {
		this.#cleanups.push(effect(fn));
	}

	protected signal<T>(initialValue: T) {
		return new Signal.State(initialValue);
	}

	protected computed<T>(fn: () => T) {
		return new Signal.Computed(fn);
	}

	provide<K extends keyof ContextMap>(key: K, value: ContextMap[K]) {
		provide(this, key, value);
	}

	inject<K extends keyof ContextMap>(key: K) {
		return inject(this.parentElement ?? this, key);
	}

	injectOrThrow<K extends keyof ContextMap>(key: K) {
		return injectOrThrow(this.parentElement ?? this, key);
	}
}
