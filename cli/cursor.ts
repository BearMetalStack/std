/**
 * Cursor visibility.
 *
 * Deliberately small. Three things that used to live here are gone:
 *
 * - `getPosition()` asked the terminal where the cursor was (`DSR`) and read the
 *   reply straight off stdin, which races whatever is already reading keys and
 *   reset raw mode underneath it. The render layer tracks position relative to
 *   its own output instead, so nothing needs to ask.
 * - `savePosition()`/`restorePosition()` used `DECSC`/`DECRC`, which is a single
 *   global slot. Two widgets nesting silently corrupted each other.
 * - The alternate screen belongs to the session, which is the only thing that
 *   knows when an interactive run starts and ends — and the only thing that can
 *   restore the terminal on the way out.
 * @module
 */

import { stdoutWriter, type TerminalWriter } from "./render/writer.ts";

/** Show/hide the cursor, with a stack so nested widgets restore correctly. */
export class Cursor {
	static #visible = true;
	static #stack: boolean[] = [];

	static #out(): TerminalWriter {
		return stdoutWriter();
	}

	/** Whether the cursor is currently shown. */
	static get visible(): boolean {
		return this.#visible;
	}

	static show() {
		this.#visible = true;
		this.#out().write("\x1b[?25h");
	}

	static hide() {
		this.#visible = false;
		this.#out().write("\x1b[?25l");
	}

	/** Records the current visibility so it can be put back. */
	static saveVisibility() {
		this.#stack.push(this.#visible);
	}

	/** Restores the visibility recorded by the matching {@linkcode Cursor.saveVisibility}. */
	static restoreVisibility() {
		if (this.#stack.pop() ?? true) this.show();
		else this.hide();
	}
}
