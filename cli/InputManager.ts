interface EventMap {
	keypress: CLIKeypressEvent;
	char: CLICharEvent;
	activate: Event;
	deactivate: Event;
	exit: Event;
	enter: Event;
	backspace: Event;
	escape: Event;
	delete: Event;
	"arrow-left": Event;
	"arrow-right": Event;
	"arrow-up": Event;
	"arrow-down": Event;
	// [key: string]: Event;
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

interface bounds {
	top?: number;
	left?: number;
	right?: number;
	bottom?: number;
	boundMode?: "relative" | "absolute";
}

export type TypedEventTarget<EventMap extends object> = {
	new (): IntermediateEventTarget<EventMap>;
};

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

export class CLICharEvent extends CustomEvent<EventDetailMap["char"]> {
	constructor(detail: EventDetailMap["char"]) {
		super("char", { detail, cancelable: true });
	}
}
export class CLIKeypressEvent extends CustomEvent<EventDetailMap["keypress"]> {
	constructor(detail: EventDetailMap["keypress"]) {
		super("keypress", { detail, cancelable: true });
	}
}

export class InputManager extends ManagerEventTarget {
	private static instance = new InputManager();
	private active = false;
	private raw = true;

	static getInstance(): InputManager {
		return this.instance ??= new InputManager();
	}

	static addEventListener = InputManager.prototype.addEventListener.bind(
		this.instance,
	);
	static removeEventListener = InputManager.prototype.removeEventListener.bind(
		this.instance,
	);
	static dispatchEvent = InputManager.prototype.dispatchEvent.bind(
		this.instance,
	);

	activate({ raw = true }: { raw?: boolean } = {}) {
		if (this.active) return;
		this.active = true;
		this.raw = raw;
		this.dispatchEvent(new Event("activate"));
		this.listen(raw);
	}

	#claims = new Set<unknown>();
	claim(t: unknown) {
		this.#claims.add(t);
		this.activate();
	}
	release(t: unknown) {
		this.#claims.delete(t);
		if (this.#claims.size === 0) this.deactivate();
	}

	deactivate({ dactivateRaw = true }: { dactivateRaw?: boolean } = {}) {
		if (!this.active) return;
		this.active = false;
		this.dispatchEvent(new Event("deactivate"));
		if (dactivateRaw) Deno.stdin.setRaw(false);
	}

	once<T extends string>(type: T): Promise<Event> {
		return new Promise((resolve) => {
			const handler = (event: Event) => {
				this.removeEventListener(type, handler);
				resolve(event);
			};
			this.addEventListener(type, handler);
		});
	}

	private async listen(raw: boolean) {
		if (raw) await Deno.stdin.setRaw(true);
		const buf = new Uint8Array(64);

		while (this.active) {
			const n = await Deno.stdin.read(buf);
			if (n === null) break;

			let i = 0;
			while (i < n) {
				const byte = buf[i];

				// Ctrl+C
				if (byte === 3) {
					this.dispatchEvent(new Event("exit"));
					await Deno.stdin.setRaw(false);
					Deno.exit(130);
				}

				// Enter
				if (byte === 13) {
					this.dispatchEvent(new Event("enter"));
					i++;
					continue;
				}

				// Backspace
				if (byte === 127 || byte === 8) {
					this.dispatchEvent(new Event("backspace"));
					i++;
					if (!this.isCursorAtBoundEnd()) this.moveCursor(-1, 0);
					continue;
				}

				if (byte === 27 && i + 1 >= n) {
					this.dispatchEvent(new Event("escape"));
					i++;
					continue;
				}

				// Escape sequences
				if (byte === 27 && i + 1 < n && buf[i + 1] === 91) {
					const code = buf[i + 2];
					switch (code) {
						case 65: // Up
							this.moveCursor(0, -1);
							this.dispatchEvent(new Event("arrow-up"));
							break;
						case 66: // Down
							this.moveCursor(0, 1);
							this.dispatchEvent(new Event("arrow-down"));
							break;
						case 67: // Right
							this.moveCursor(1, 0);
							this.dispatchEvent(new Event("arrow-right"));
							break;
						case 68: // Left
							this.moveCursor(-1, 0);
							this.dispatchEvent(new Event("arrow-left"));
							break;

						case 51:
							if (i + 3 < n && buf[i + 3] === 126) {
								this.dispatchEvent(new Event("delete"));
								i += 4;
								continue;
							}
							break;
					}
					i += 3;
					continue;
				}

				// Printable ASCII
				if (byte >= 32 && byte <= 126) {
					this.dispatchEvent(
						new CLICharEvent({ key: byte, char: String.fromCharCode(byte) }),
					);
					this.moveCursor(1, 0);
					i++;
					continue;
				}

				// Unknown
				this.dispatchEvent(
					new CLIKeypressEvent({ key: byte, sequence: buf.slice(i, i + 1) }),
				);
				i++;
			}
		}

		if (raw) await Deno.stdin.setRaw(false);
	}

	dispatchKey(key: string) {
		switch (key) {
			case "enter":
			case "backspace":
			case "arrow-up":
			case "arrow-down":
			case "arrow-right":
			case "arrow-left":
			case "delete":
			case "escape":
				this.dispatchEvent(new Event(key));
				break;
			default:
				this.dispatchEvent(
					new CLICharEvent({ key: key.charCodeAt(0), char: key }),
				);
		}
	}

	// Cursor management
	private cursor = { row: 0, col: 0 };

	initCursor(row: number, col: number) {
		this.cursor = { row, col };
	}
	private bounds: bounds = {};

	getCursor() {
		return { ...this.cursor };
	}

	getRelativeCursor() {
		const boundStart = (this.bounds.top ?? 0) * Deno.consoleSize().columns +
			(this.bounds.left ?? 0);
		const cursorPos = (this.cursor.row * Deno.consoleSize().columns) +
			this.cursor.col;
		return cursorPos - boundStart;
	}

	setCursor(row: number, col: number) {
		const { columns, rows } = Deno.consoleSize();
		const { top, bottom, left, right, boundMode } = {
			top: 0,
			bottom: rows - 1,
			left: 0,
			right: columns,
			boundMode: "relative",
			...this.bounds,
		} as bounds;

		switch (boundMode) {
			case "absolute":
				this.cursor.row = Math.max(
					top ?? -Infinity,
					Math.min(bottom ?? Infinity, row),
				);
				this.cursor.col = Math.max(
					left ?? -Infinity,
					Math.min(right ?? Infinity, col),
				);
				break;
			case "relative": {
				const boundStart = (top! * columns) + left!;
				const boundEnd = (bottom! * columns) + right!;
				let proposedPosition = (row * columns) + col;
				if (proposedPosition < boundStart) proposedPosition = boundStart;
				if (proposedPosition > boundEnd) proposedPosition = boundEnd;
				col = proposedPosition % columns;
				row = (proposedPosition - col) / columns;
				this.cursor.row = row;
				this.cursor.col = col;
			}
		}

		this.applyCursor();
	}

	isCursorAtBoundEnd() {
		const { columns, rows } = Deno.consoleSize();
		const { top, bottom, left, right, boundMode } = {
			top: 0,
			bottom: rows - 1,
			left: 0,
			right: columns,
			boundMode: "relative",
			...this.bounds,
		} as bounds;

		switch (boundMode) {
			case "absolute":
				return this.getCursor().col === right &&
					this.getCursor().row === bottom;
			case "relative": {
				const boundStart = (top! * columns) + left!;
				const boundEnd = (bottom! * columns) + right!;
				return this.getRelativeCursor() + boundStart === boundEnd;
			}
		}
	}

	moveCursor(dx: number, dy: number) {
		this.setCursor(this.cursor.row + dy, this.cursor.col + dx);
	}

	setBounds(
		bounds: { top?: number; left?: number; right?: number; bottom?: number },
	) {
		this.bounds = bounds;
		this.setCursor(this.cursor.row, this.cursor.col); // enforce bounds immediately
	}
	getBounds() {
		return { ...this.bounds };
	}
	updateBounds(
		bounds: { top?: number; left?: number; right?: number; bottom?: number },
	) {
		this.bounds = { ...this.bounds, ...bounds };
		this.setCursor(this.cursor.row, this.cursor.col);
	}
	resetBounds() {
		this.bounds = {};
		this.setCursor(this.cursor.row, this.cursor.col);
	}

	private applyCursor() {
		Deno.stdout.writeSync(
			new TextEncoder().encode(
				`\x1b[${this.cursor.row + 1};${this.cursor.col + 1}H`,
			),
		);
	}
}
