/**
 * A typed `EventTarget` view of the keyboard.
 *
 * This used to be both the byte decoder and the renderer: it wrote absolute
 * cursor-positioning escapes to stdout from inside its read loop, on every arrow
 * key and every printable character. That is why cursor placement was unreliable
 * — the thing decoding input was also moving the cursor, before the widget that
 * owned the frame had decided anything.
 *
 * Decoding now lives in {@linkcode KeyDecoder}, stdin ownership in
 * {@linkcode KeyReader}, and drawing in `render/`. What remains here is a
 * convenience surface for passive observers. Widgets should take input through
 * the session's focus stack instead, which routes keys to one owner at a time
 * rather than relying on listener registration order.
 * @module
 */

import { type KeyEvent, keyReader } from "./input/mod.ts";

/** Events dispatched by {@linkcode InputManager}. */
export interface EventMap {
	/** Every decoded key, whatever it was. */
	key: CLIKeyEvent;
	/** A key with no more specific event of its own. */
	keypress: CLIKeypressEvent;
	/** Text input. */
	char: CLICharEvent;
	activate: Event;
	deactivate: Event;
	/** Ctrl+C. */
	exit: Event;
	enter: Event;
	backspace: Event;
	escape: Event;
	delete: Event;
	tab: Event;
	home: Event;
	end: Event;
	pageup: Event;
	pagedown: Event;
	paste: CLIPasteEvent;
	"arrow-left": Event;
	"arrow-right": Event;
	"arrow-up": Event;
	"arrow-down": Event;
}

interface EventDetailMap {
	keypress: {
		key: number;
		sequence?: Uint8Array;
	};
	char: EventDetailMap["keypress"] & {
		char: string;
	};
}

/** An `EventTarget` constructor with a per-event-name typed listener signature. */
export type TypedEventTarget<EventMap extends object> = {
	new (): IntermediateEventTarget<EventMap>;
};

/** The typed `addEventListener`/`removeEventListener` pair. */
export interface IntermediateEventTarget<EventMap> extends EventTarget {
	addEventListener<K extends keyof EventMap>(
		type: K,
		listener: (
			event: EventMap[K] extends Event ? EventMap[K] : Event,
		) => EventMap[K] extends Event ? void : never,
		options?: boolean | AddEventListenerOptions,
	): void;

	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;

	removeEventListener<K extends keyof EventMap>(
		type: K,
		listener: (
			event: EventMap[K] extends Event ? EventMap[K] : Event,
		) => EventMap[K] extends Event ? void : never,
		options?: boolean | AddEventListenerOptions,
	): void;

	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;
}

const ManagerEventTarget = EventTarget as TypedEventTarget<EventMap>;

/** Carries the full decoded key, modifiers included. */
export class CLIKeyEvent extends CustomEvent<KeyEvent> {
	constructor(detail: KeyEvent) {
		super("key", { detail, cancelable: true });
	}
}

/** Text input. */
export class CLICharEvent extends CustomEvent<EventDetailMap["char"]> {
	constructor(detail: EventDetailMap["char"]) {
		super("char", { detail, cancelable: true });
	}
}

/** A key with no more specific event. */
export class CLIKeypressEvent extends CustomEvent<EventDetailMap["keypress"]> {
	constructor(detail: EventDetailMap["keypress"]) {
		super("keypress", { detail, cancelable: true });
	}
}

/** A bracketed-paste burst, delivered whole. */
export class CLIPasteEvent extends CustomEvent<{ text: string }> {
	constructor(text: string) {
		super("paste", { detail: { text }, cancelable: true });
	}
}

/** Named keys that map straight onto an event of the same name. */
const DIRECT_EVENTS = new Set([
	"enter",
	"backspace",
	"escape",
	"delete",
	"tab",
	"home",
	"end",
	"pageup",
	"pagedown",
]);

/** Arrow keys keep their historical `arrow-` prefixed event names. */
const ARROW_EVENTS: Record<string, string> = {
	up: "arrow-up",
	down: "arrow-down",
	left: "arrow-left",
	right: "arrow-right",
};

const encoder = new TextEncoder();

/** Re-publishes decoded keys as DOM events. */
export class InputManager extends ManagerEventTarget {
	static #instance: InputManager | null = null;
	#subscribed = false;

	static getInstance(): InputManager {
		return this.#instance ??= new InputManager();
	}

	static addEventListener: InputManager["addEventListener"] = (
		...args: Parameters<InputManager["addEventListener"]>
	) => InputManager.getInstance().addEventListener(...args);

	static removeEventListener: InputManager["removeEventListener"] = (
		...args: Parameters<InputManager["removeEventListener"]>
	) => InputManager.getInstance().removeEventListener(...args);

	static dispatchEvent: InputManager["dispatchEvent"] = (
		...args: Parameters<InputManager["dispatchEvent"]>
	) => InputManager.getInstance().dispatchEvent(...args);

	/** Claims stdin on behalf of `token`, starting the reader if it was idle. */
	claim(token: object) {
		this.#ensureSubscribed();
		const wasActive = keyReader().active;
		keyReader().claim(token);
		if (!wasActive) this.dispatchEvent(new Event("activate"));
	}

	/** Drops `token`'s claim; the reader parks once the last one goes. */
	release(token: object) {
		keyReader().release(token);
		if (!keyReader().active) this.dispatchEvent(new Event("deactivate"));
	}

	/** Resolves on the next event of `type`. */
	once<T extends keyof EventMap | string>(type: T): Promise<Event> {
		return new Promise((resolve) => {
			const handler = (event: Event) => {
				this.removeEventListener(type as string, handler);
				resolve(event);
			};
			this.addEventListener(type as string, handler);
		});
	}

	#ensureSubscribed() {
		if (this.#subscribed) return;
		this.#subscribed = true;
		keyReader().subscribe((event) => this.#publish(event));
	}

	#publish(event: KeyEvent) {
		this.dispatchEvent(new CLIKeyEvent(event));

		if (event.name === "char") {
			// Ctrl+C is announced rather than acted on. Exiting from here would skip
			// every terminal-restore path the session owns.
			if (event.ctrl && event.char === "c") {
				this.dispatchEvent(new Event("exit"));
				return;
			}
			this.dispatchEvent(
				new CLICharEvent({
					key: event.char?.codePointAt(0) ?? 0,
					char: event.char ?? "",
					sequence: encoder.encode(event.sequence),
				}),
			);
			return;
		}

		if (event.name === "paste") {
			this.dispatchEvent(new CLIPasteEvent(event.text ?? ""));
			return;
		}

		if (DIRECT_EVENTS.has(event.name)) {
			this.dispatchEvent(new Event(event.name));
			return;
		}

		const arrow = ARROW_EVENTS[event.name];
		if (arrow) {
			this.dispatchEvent(new Event(arrow));
			return;
		}

		this.dispatchEvent(
			new CLIKeypressEvent({
				key: event.sequence.codePointAt(0) ?? 0,
				sequence: encoder.encode(event.sequence),
			}),
		);
	}
}
