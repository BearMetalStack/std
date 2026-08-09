/**
 * Test doubles for the interactive layer.
 *
 * Exported publicly on purpose: anything built on {@linkcode Region} needs the
 * same harness to test itself, and assertions against a rendered screen are far
 * more readable — and far more likely to catch a real bug — than assertions
 * against a string of escape codes.
 * @module
 */

import type { TerminalWriter } from "./render/writer.ts";
import { KeyDecoder, type KeyEvent } from "./input/keys.ts";

/**
 * A terminal emulator just complete enough to check a renderer against.
 *
 * Interprets the cursor movements, line erases and screen erases the render
 * layer emits, and ignores styling — colour is not what region bookkeeping gets
 * wrong.
 */
export class FakeScreen {
	readonly columns: number;
	readonly rows: number;
	grid: string[][];
	row = 0;
	col = 0;

	constructor(columns = 80, rows = 24) {
		this.columns = columns;
		this.rows = rows;
		this.grid = FakeScreen.#blank(columns, rows);
	}

	static #blank(columns: number, rows: number): string[][] {
		return Array.from({ length: rows }, () => Array.from({ length: columns }, () => " "));
	}

	/** Row `n`, with trailing blanks removed. */
	line(n: number): string {
		return (this.grid[n] ?? []).join("").replace(/\s+$/, "");
	}

	/** Every row up to the last non-blank one. */
	lines(): string[] {
		const all = this.grid.map((_, i) => this.line(i));
		let last = all.length - 1;
		while (last >= 0 && all[last] === "") last--;
		return all.slice(0, last + 1);
	}

	/** The visible screen as text. */
	toString(): string {
		return this.lines().join("\n");
	}

	/** Cursor position, for assertions. */
	get cursor(): { row: number; col: number } {
		return { row: this.row, col: this.col };
	}

	#scrollUp() {
		this.grid.shift();
		this.grid.push(Array.from({ length: this.columns }, () => " "));
		this.row = this.rows - 1;
	}

	#newline() {
		this.row++;
		if (this.row >= this.rows) this.#scrollUp();
	}

	#put(char: string) {
		if (this.col >= this.columns) {
			this.col = 0;
			this.#newline();
		}
		this.grid[this.row][this.col] = char;
		this.col++;
	}

	/** Feeds output to the screen, interpreting escapes. */
	write(text: string) {
		let i = 0;
		while (i < text.length) {
			const ch = text[i];

			if (ch === "\x1b") {
				const consumed = this.#escape(text, i);
				if (consumed > 0) {
					i += consumed;
					continue;
				}
				i++;
				continue;
			}
			if (ch === "\r") {
				this.col = 0;
				i++;
				continue;
			}
			if (ch === "\n") {
				this.#newline();
				i++;
				continue;
			}
			// Combining marks and other zero-width code points attach to the previous
			// cell rather than advancing the cursor.
			this.#put(ch);
			i++;
		}
	}

	/** Handles one escape sequence, returning how many characters it consumed. */
	#escape(text: string, start: number): number {
		if (text[start + 1] !== "[") {
			// Non-CSI escapes have no effect on layout; skip the two-character form.
			return 2;
		}
		let i = start + 2;
		while (i < text.length && /[0-?]/.test(text[i])) i++;
		while (i < text.length && /[ -/]/.test(text[i])) i++;
		if (i >= text.length) return text.length - start;

		const final = text[i];
		const params = text.slice(start + 2, i);
		const length = i + 1 - start;
		const nums = params.split(";").map((p) => (p === "" ? undefined : Number(p)));
		const n = nums[0] ?? 1;

		switch (final) {
			case "A":
				this.row = Math.max(0, this.row - n);
				break;
			case "B":
				this.row = Math.min(this.rows - 1, this.row + n);
				break;
			case "C":
				this.col = Math.min(this.columns - 1, this.col + n);
				break;
			case "D":
				this.col = Math.max(0, this.col - n);
				break;
			case "G":
				this.col = Math.max(0, Math.min(this.columns - 1, n - 1));
				break;
			case "H":
			case "f":
				this.row = Math.max(0, Math.min(this.rows - 1, (nums[0] ?? 1) - 1));
				this.col = Math.max(0, Math.min(this.columns - 1, (nums[1] ?? 1) - 1));
				break;
			case "K":
				this.#eraseLine(nums[0] ?? 0);
				break;
			case "J":
				this.#eraseScreen(nums[0] ?? 0);
				break;
			// SGR and private modes (cursor visibility, alt buffer, bracketed paste)
			// do not move the cursor or change cell contents.
			default:
				break;
		}
		return length;
	}

	#eraseLine(mode: number) {
		const row = this.grid[this.row];
		if (!row) return;
		const from = mode === 0 ? this.col : 0;
		const to = mode === 1 ? this.col + 1 : this.columns;
		for (let c = from; c < to; c++) row[c] = " ";
	}

	#eraseScreen(mode: number) {
		if (mode === 2) {
			this.grid = FakeScreen.#blank(this.columns, this.rows);
			return;
		}
		if (mode === 0) {
			this.#eraseLine(0);
			for (let r = this.row + 1; r < this.rows; r++) {
				this.grid[r] = Array.from({ length: this.columns }, () => " ");
			}
		}
	}
}

/** A {@linkcode TerminalWriter} backed by a {@linkcode FakeScreen}. */
export class BufferWriter implements TerminalWriter {
	readonly screen: FakeScreen;
	readonly isTTY: boolean;
	#raw = "";

	constructor(
		columns = 80,
		rows = 24,
		opts: { isTTY?: boolean } = {},
	) {
		this.screen = new FakeScreen(columns, rows);
		this.isTTY = opts.isTTY ?? true;
	}

	write(s: string) {
		this.#raw += s;
		this.screen.write(s);
	}

	get columns(): number {
		return this.screen.columns;
	}

	get rows(): number {
		return this.screen.rows;
	}

	/** Everything written so far, escapes included. */
	get raw(): string {
		return this.#raw;
	}

	/** The rendered screen, for assertions. */
	lines(): string[] {
		return this.screen.lines();
	}

	/** A single rendered row, for assertions. */
	line(n: number): string {
		return this.screen.line(n);
	}

	toString(): string {
		return this.screen.toString();
	}
}

/** Turns text into the key events a terminal would produce for it. */
export function keysFrom(text: string): KeyEvent[] {
	const decoder = new KeyDecoder();
	const bytes = new TextEncoder().encode(text);
	return [...decoder.push(bytes), ...decoder.flush()];
}
