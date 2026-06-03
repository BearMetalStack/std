import { effect } from "./signals.ts"; // your effect impl from earlier
import { BMC, setCurrentOwner, setEffectImpl } from "@bearmetal/jsx/client";
import { inject, injectOrThrow, provide } from "./context/mod.ts";
import type { ContextMap } from "./context/mod.ts";
import { Signal } from "@bearmetal/app/signals";

// Wire up the effect impl once at module load
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

	// Called by the JSX layer during render
	registerCleanup(fn: () => void) {
		this.#cleanups.push(fn);
	}

	connectedCallback() {
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
