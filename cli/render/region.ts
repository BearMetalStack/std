/**
 * A block of consecutive terminal rows a widget owns and repaints in place.
 *
 * The cursor is only ever moved *relative* to where the region last left it —
 * never with an absolute `CUP`, and never after asking the terminal where it is.
 * A saved absolute row goes stale the moment anything scrolls, and a
 * device-status query has to read stdin, which races whatever is already reading
 * keys. Relative movement has neither problem, which is what lets a widget render
 * inline instead of commandeering the alternate screen.
 * @module
 */

import { displayWidth, truncateToWidth, wrapToWidth } from "../style.ts";
import type { TerminalWriter } from "./writer.ts";

/** Raised when a frame needs more rows than the terminal has. */
export class RegionOverflowError extends Error {
	override readonly name = "RegionOverflowError";
	constructor(readonly required: number, readonly available: number) {
		super(`Frame needs ${required} rows but only ${available} are available`);
	}
}

/** How a region handles a line wider than the terminal. */
export interface RegionOptions {
	/**
	 * Wrap over-long lines onto continuation rows instead of truncating them.
	 *
	 * Off by default, deliberately. Display width is a heuristic — emoji, ZWJ
	 * sequences and combining marks are measured inconsistently across terminals —
	 * and a single mis-measured row desynchronises the region's bookkeeping, which
	 * corrupts every later frame. Truncating guarantees one row per line and makes
	 * that whole failure mode impossible.
	 */
	wrap?: boolean;
}

/**
 * A repaintable block of rows.
 *
 * `#cursorRow` — the region-relative row the real cursor currently sits on — is
 * the load-bearing invariant. Every emission updates it, and every movement is
 * computed from it.
 */
export class Region {
	#out: TerminalWriter;
	#wrap: boolean;
	#height = 0;
	#cursorRow = 0;
	#rows: string[] = [];
	#closed = false;

	constructor(out: TerminalWriter, opts: RegionOptions = {}) {
		this.#out = out;
		this.#wrap = opts.wrap ?? false;
	}

	/** Terminal rows the region currently occupies. */
	get height(): number {
		return this.#height;
	}

	/** Whether {@linkcode Region.commit} has already closed this region. */
	get closed(): boolean {
		return this.#closed;
	}

	/** The physical rows of the last rendered frame. */
	get rows(): readonly string[] {
		return this.#rows;
	}

	/** The end-of-line sequence — raw mode cannot rely on `\n` implying a carriage return. */
	get #eol(): string {
		return this.#out.isTTY ? "\r\n" : "\n";
	}

	/** Expands logical lines into the physical rows they will occupy. */
	#toRows(lines: string[]): string[] {
		const columns = this.#out.columns;
		if (!this.#wrap) return lines.map((line) => truncateToWidth(line, columns));
		return lines.flatMap((line) => wrapToWidth(line, columns));
	}

	/**
	 * Paints `lines`, replacing whatever the region showed before.
	 *
	 * @throws {RegionOverflowError} if the frame is taller than the terminal.
	 */
	render(lines: string[]) {
		if (!this.#out.isTTY) return;
		if (lines.length === 0) {
			this.clear();
			return;
		}

		const rows = this.#toRows(lines);
		const available = Math.max(1, this.#out.rows - 1);
		if (rows.length > available) throw new RegionOverflowError(rows.length, available);

		let out = this.#rewind();
		for (let i = 0; i < rows.length; i++) {
			out += "\x1b[2K" + rows[i];
			if (i < rows.length - 1) out += this.#eol;
		}

		const leftover = this.#height - rows.length;
		if (leftover > 0) {
			for (let i = 0; i < leftover; i++) out += this.#eol + "\x1b[2K";
			out += `\x1b[${leftover}A`;
		}

		this.#out.write(out);
		this.#rows = rows;
		this.#height = rows.length;
		this.#cursorRow = rows.length - 1;
	}

	/** Moves the cursor back to column 0 of the region's first row. */
	#rewind(): string {
		if (this.#height === 0) return "";
		return this.#cursorRow > 0 ? `\r\x1b[${this.#cursorRow}A` : "\r";
	}

	/**
	 * Places the cursor at a position inside the region.
	 *
	 * `col` is a display column, so callers can pass a measured width directly.
	 */
	cursorTo(row: number, col: number) {
		if (!this.#out.isTTY || this.#height === 0) return;
		const target = Math.max(0, Math.min(this.#height - 1, row));
		const dy = target - this.#cursorRow;
		let out = "";
		if (dy < 0) out += `\x1b[${-dy}A`;
		else if (dy > 0) out += `\x1b[${dy}B`;
		out += `\x1b[${Math.max(0, col) + 1}G`;
		this.#out.write(out);
		this.#cursorRow = target;
	}

	/**
	 * Erases every row and leaves the cursor at column 0 of where the region began.
	 *
	 * This is the "no longer rendered" path — after it, the region occupies nothing
	 * and ordinary output continues from where it started.
	 */
	clear() {
		if (!this.#out.isTTY || this.#height === 0) {
			this.#height = 0;
			this.#rows = [];
			this.#cursorRow = 0;
			return;
		}

		let out = this.#rewind();
		for (let i = 0; i < this.#height; i++) {
			out += "\x1b[2K";
			if (i < this.#height - 1) out += this.#eol;
		}
		if (this.#height > 1) out += `\x1b[${this.#height - 1}A`;
		out += "\r";

		this.#out.write(out);
		this.#height = 0;
		this.#cursorRow = 0;
		this.#rows = [];
	}

	/**
	 * Closes the region, leaving `lines` behind as ordinary scrollback.
	 *
	 * This is how an interactive widget collapses to a one-line summary: the live
	 * frame is erased, the summary is written as plain output, and the cursor ends
	 * at column 0 of a fresh row — exactly the state `console.log` expects, so
	 * printed output and interactive widgets compose.
	 */
	commit(lines: string[] = [...this.#rows]) {
		this.clear();
		if (lines.length > 0) {
			const rows = this.#out.isTTY ? this.#toRows(lines) : lines;
			this.#out.write(rows.join(this.#eol) + this.#eol);
		}
		this.#closed = true;
	}

	/**
	 * Drops the region's bookkeeping without emitting anything.
	 *
	 * Used after a resize: the terminal has already reflowed the rows on screen, so
	 * the recorded height no longer describes reality and trying to rewind over it
	 * would corrupt whatever is now there. The next `render` starts fresh at the
	 * current cursor position.
	 */
	forget() {
		this.#height = 0;
		this.#cursorRow = 0;
		this.#rows = [];
	}

	/** Width of a rendered row, in display columns. */
	widthOf(row: number): number {
		return displayWidth(this.#rows[row] ?? "");
	}

	[Symbol.dispose]() {
		if (!this.#closed) this.clear();
	}
}
