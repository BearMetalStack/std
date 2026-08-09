/**
 * The lifetime of an interactive run.
 *
 * A session owns the things that outlive any one widget: who currently receives
 * keys, whether the alternate screen is in use, and — most importantly — putting
 * the terminal back the way it was found.
 *
 * The alternate screen is a property of the *session*, never of a region. Regions
 * emit identical bytes either way. Anchoring alt mode to the screen's home
 * position would rebuild exactly the coupling this layer exists to remove, and
 * would stop ordinary printed output from interleaving correctly once inside it.
 * @module
 */

import { type KeyEvent, keyReader, type KeySource } from "../input/mod.ts";
import { Region, type RegionOptions } from "./region.ts";
import { StdoutWriter, stdoutWriter, type TerminalWriter } from "./writer.ts";

/** How interactive output is presented. */
export type InteractiveMode =
	/** Render in place, below existing output. The default. */
	| "inline"
	/** Take over the alternate screen for the session's lifetime. */
	| "alt"
	/** No cursor control at all — for pipes and redirects. */
	| "plain";

/** Something that can receive keys while focused. */
export interface Widget {
	handleKey(event: KeyEvent): void;
	/** Repaint after a terminal resize. */
	refresh?(): void;
	/** Called if the session tears down while this widget is still live. */
	cancel?(): void;
}

/** Configuration for {@linkcode startCliSession}. */
export interface SessionOptions {
	/** Defaults to `"inline"`, downgraded to `"plain"` when stdout is not a terminal. */
	mode?: InteractiveMode;
	/** Output sink. Defaults to stdout; pass a buffer to test. */
	writer?: TerminalWriter;
	/** Key source. Defaults to the process-wide reader. */
	reader?: KeySource;
	/**
	 * What Ctrl+C does. `"exit"` restores the terminal and exits 130, matching a
	 * normal CLI; `"event"` cancels the focused widget and returns control.
	 */
	interrupt?: "exit" | "event";
	/**
	 * Route `console.log`/`warn`/`error`/`info` through {@linkcode CliSession.log}
	 * for the session's lifetime, so printed output cannot land in the middle of a
	 * live frame. Off by default — patching `console` is surprising.
	 */
	captureConsole?: boolean;
}

/** An interactive run. */
export interface CliSession {
	readonly mode: InteractiveMode;
	readonly out: TerminalWriter;
	/** Rows a widget may use before it has to escalate or window its content. */
	readonly availableRows: number;
	/** Creates a region owned by this session. */
	region(opts?: RegionOptions): Region;
	/** Gives `widget` keyboard focus. */
	push(widget: Widget): void;
	/** Removes `widget` from the focus stack. */
	pop(widget: Widget): void;
	/** Prints without corrupting a live frame. */
	log(...args: unknown[]): void;
	/** Shows the terminal cursor. */
	showCursor(): void;
	/** Hides the terminal cursor. */
	hideCursor(): void;
	/**
	 * Switches to the alternate screen because content does not fit inline.
	 *
	 * @returns whether the alternate screen is now in use.
	 */
	escalate(): boolean;
	/** Undoes one {@linkcode CliSession.escalate}. */
	deescalate(): void;
	/** Restores the terminal and ends the session. */
	cleanup(): void;
	[Symbol.dispose](): void;
}

const ALT_ENTER = "\x1b[?1049h\x1b[2J\x1b[H";
const ALT_EXIT = "\x1b[?1049l";
const PASTE_ON = "\x1b[?2004h";
const PASTE_OFF = "\x1b[?2004l";

const stack: Session[] = [];

/** The innermost active session, if any. */
export function currentSession(): CliSession | null {
	return stack.at(-1) ?? null;
}

class Session implements CliSession {
	readonly out: TerminalWriter;
	readonly mode: InteractiveMode;
	readonly implicit: boolean;

	#reader: KeySource;
	#widgets: Widget[] = [];
	#regions = new Set<Region>();
	#unsubscribe: (() => void) | null = null;
	#teardown: (() => void)[] = [];
	#interrupt: "exit" | "event";
	#inAlt = false;
	#escalations = 0;
	#restored = false;

	constructor(opts: SessionOptions & { implicit?: boolean } = {}) {
		this.out = opts.writer ?? stdoutWriter();
		this.#reader = opts.reader ?? keyReader();
		this.#interrupt = opts.interrupt ?? "exit";
		this.implicit = opts.implicit ?? false;

		// Never emit screen-control sequences into a pipe.
		const requested = opts.mode ?? "inline";
		this.mode = this.out.isTTY ? requested : "plain";

		this.#unsubscribe = this.#reader.subscribe((event) => this.#onKey(event));
		this.#installRestoreHooks();

		if (this.mode !== "plain") {
			this.out.write(PASTE_ON);
			this.#teardown.push(() => this.out.write(PASTE_OFF));
		}
		if (this.mode === "alt") this.#enterAlt();

		if (opts.captureConsole) this.#captureConsole();
		stack.push(this);
	}

	get availableRows(): number {
		return Math.max(1, this.out.rows - 1);
	}

	region(opts: RegionOptions = {}): Region {
		const region = new Region(this.out, opts);
		this.#regions.add(region);
		return region;
	}

	/** Stops tracking a region once its widget is done with it. */
	forget(region: Region) {
		this.#regions.delete(region);
	}

	push(widget: Widget) {
		this.#widgets.push(widget);
		this.#reader.claim(widget);
	}

	pop(widget: Widget) {
		const at = this.#widgets.lastIndexOf(widget);
		if (at >= 0) this.#widgets.splice(at, 1);
		this.#reader.release(widget);
	}

	log(...args: unknown[]) {
		const live = [...this.#regions].filter((r) => r.height > 0);
		if (live.length === 0) {
			console.log(...args);
			return;
		}
		// Erase the live frames, print underneath them, then put them back — so the
		// message ends up in scrollback rather than smeared across the widget.
		const snapshots = live.map((region) => [...region.rows]);
		for (const region of [...live].reverse()) region.clear();
		console.log(...args);
		live.forEach((region, i) => region.render(snapshots[i]));
	}

	showCursor() {
		if (this.mode !== "plain") this.out.write("\x1b[?25h");
	}

	hideCursor() {
		if (this.mode !== "plain") this.out.write("\x1b[?25l");
	}

	escalate(): boolean {
		if (this.mode === "plain") return false;
		if (this.mode === "alt") return true;
		this.#escalations++;
		if (!this.#inAlt) this.#enterAlt();
		return true;
	}

	deescalate() {
		if (this.mode !== "inline") return;
		this.#escalations = Math.max(0, this.#escalations - 1);
		if (this.#escalations === 0 && this.#inAlt) this.#exitAlt();
	}

	#enterAlt() {
		if (this.#inAlt) return;
		this.#inAlt = true;
		this.out.write(ALT_ENTER);
		for (const region of this.#regions) region.forget();
	}

	#exitAlt() {
		if (!this.#inAlt) return;
		this.#inAlt = false;
		for (const region of this.#regions) region.forget();
		this.out.write(ALT_EXIT);
	}

	#onKey(event: KeyEvent) {
		if (event.name === "char" && event.ctrl && event.char === "c") {
			this.#onInterrupt();
			return;
		}
		// Only the top of the stack hears anything. Routing by focus rather than by
		// listener registration order is what removes the need for widgets to fight
		// each other with stopImmediatePropagation.
		this.#widgets.at(-1)?.handleKey(event);
	}

	#onInterrupt() {
		if (this.#interrupt === "event") {
			this.#widgets.at(-1)?.cancel?.();
			return;
		}
		this.cleanup();
		Deno.exit(130);
	}

	#onResize = () => {
		if (this.out instanceof StdoutWriter) this.out.refresh();

		const live = [...this.#regions].filter((r) => r.height > 0);
		const snapshots = live.map((region) => [...region.rows]);

		if (this.#inAlt) this.out.write("\x1b[2J\x1b[H");
		// The terminal has already reflowed what is on screen, so the recorded
		// heights no longer describe reality; rewinding over them would corrupt
		// whatever is there now.
		for (const region of live) region.forget();

		const focused = this.#widgets.at(-1);
		if (focused?.refresh) {
			focused.refresh();
			return;
		}
		live.forEach((region, i) => {
			try {
				region.render(snapshots[i]);
			} catch {
				// The frame no longer fits. Its owner will repaint on the next key.
			}
		});
	};

	#installRestoreHooks() {
		// Closures, not unbound method references: the previous implementation
		// registered a static method directly, so `this` was undefined when the
		// signal fired and the handler threw instead of restoring the terminal.
		const restore = () => this.cleanup();

		addEventListener("unload", restore);
		this.#teardown.push(() => removeEventListener("unload", restore));

		const signals: Deno.Signal[] = Deno.build.os === "windows" ? ["SIGINT"] : ["SIGINT", "SIGTERM"];
		for (const signal of signals) {
			try {
				Deno.addSignalListener(signal, restore);
				this.#teardown.push(() => {
					try {
						Deno.removeSignalListener(signal, restore);
					} catch {
						// Already gone.
					}
				});
			} catch {
				// Signal unsupported on this platform.
			}
		}

		if (this.mode !== "plain" && Deno.build.os !== "windows") {
			try {
				Deno.addSignalListener("SIGWINCH", this.#onResize);
				// Must be removed on teardown: a live signal listener keeps the event
				// loop alive and the process would never exit.
				this.#teardown.push(() => {
					try {
						Deno.removeSignalListener("SIGWINCH", this.#onResize);
					} catch {
						// Already gone.
					}
				});
			} catch {
				// SIGWINCH unsupported.
			}
		}
	}

	#captureConsole() {
		const original = {
			log: console.log,
			warn: console.warn,
			error: console.error,
			info: console.info,
		};
		const route = (fn: (...a: unknown[]) => void) => (...args: unknown[]) => {
			const live = [...this.#regions].filter((r) => r.height > 0);
			if (live.length === 0) {
				fn(...args);
				return;
			}
			const snapshots = live.map((region) => [...region.rows]);
			for (const region of [...live].reverse()) region.clear();
			fn(...args);
			live.forEach((region, i) => region.render(snapshots[i]));
		};
		console.log = route(original.log);
		console.warn = route(original.warn);
		console.error = route(original.error);
		console.info = route(original.info);
		this.#teardown.push(() => Object.assign(console, original));
	}

	/**
	 * Puts the terminal back, exactly once.
	 *
	 * Order matters: live frames come down before the alternate screen is left, and
	 * raw mode is dropped synchronously rather than waiting for the read loop to
	 * notice, because the caller may be about to exit the process.
	 */
	cleanup() {
		if (this.#restored) return;
		this.#restored = true;

		for (const widget of [...this.#widgets].reverse()) {
			widget.cancel?.();
			this.#reader.release(widget);
		}
		this.#widgets = [];

		for (const region of [...this.#regions].reverse()) {
			if (!region.closed) region.clear();
		}
		this.#regions.clear();

		for (const fn of this.#teardown.reverse()) {
			try {
				fn();
			} catch {
				// Teardown is best-effort; one failure must not block the rest.
			}
		}
		this.#teardown = [];

		if (this.mode !== "plain") {
			// Always leave the cursor visible: a hidden cursor is the most obvious way
			// to leave someone's terminal broken.
			this.out.write("\x1b[?25h");
			if (this.#inAlt) {
				this.#inAlt = false;
				this.out.write(ALT_EXIT);
			}
		}

		this.#unsubscribe?.();
		this.#unsubscribe = null;
		this.#reader.suspendRaw();

		const at = stack.lastIndexOf(this);
		if (at >= 0) stack.splice(at, 1);
	}

	[Symbol.dispose]() {
		this.cleanup();
	}
}

/**
 * Begins an interactive session.
 *
 * Mirrors {@linkcode startCliTheme}: dispose it with `using`, or call
 * {@linkcode CliSession.cleanup} directly.
 *
 * ```ts
 * using session = startCliSession({ mode: "alt" });
 * ```
 */
export function startCliSession(opts: SessionOptions = {}): CliSession {
	return new Session(opts);
}

/**
 * The session a widget should use.
 *
 * Widgets that are called on their own — a bare `await cliPrompt(...)` — get a
 * transient session that never touches the alternate screen and disposes as soon
 * as the widget is done, so standalone use needs no ceremony.
 */
export function getOrCreateSession(
	explicit?: CliSession,
): { session: CliSession; release: () => void } {
	if (explicit) return { session: explicit, release: () => {} };
	const ambient = currentSession();
	if (ambient) return { session: ambient, release: () => {} };
	const session = new Session({ implicit: true });
	return { session, release: () => session.cleanup() };
}

/** Internal: lets widgets drop a finished region from the session's tracking. */
export function forgetRegion(session: CliSession, region: Region) {
	if (session instanceof Session) session.forget(region);
}
