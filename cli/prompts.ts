/**
 * Text prompts.
 *
 * Each prompt owns a single-row region, repainted in place and collapsed to a
 * one-line summary once answered, so a sequence of prompts reads back as a clean
 * transcript rather than a trail of half-erased frames.
 * @module
 */

import { type CliSession, currentSession, getOrCreateSession, runWidget } from "./render/mod.ts";
import { colorize, displayWidth } from "./style.ts";

/** Options for {@linkcode cliPrompt}. */
export interface PromptOptions {
	/** Value used when the input is left empty. Shown greyed out as a placeholder. */
	default?: string;
	/** Session to render in. Defaults to the ambient session, or a transient one. */
	session?: CliSession;
	/**
	 * Rejects a character before it is inserted.
	 *
	 * Replaces the old approach of registering a competing listener that called
	 * `stopImmediatePropagation`, which only worked because of the order the
	 * listeners happened to be registered in.
	 */
	filter?(char: string, current: string): boolean;
	/** Returns an error message to re-prompt, or `null` to accept. */
	validate?(value: string): string | null;
}

/** Raised when an interactive widget is used without a terminal. */
export class NotInteractiveError extends Error {
	override readonly name = "NotInteractiveError";
	constructor(what: string) {
		super(`${what} requires an interactive terminal`);
	}
}

const decoder = new TextDecoder();

/**
 * Buffered leftovers from the last read.
 *
 * A read returns whatever the pipe had available, which is usually every
 * remaining answer at once. Without holding the remainder, the first prompt
 * consumes the lot and every prompt after it silently falls back to its default.
 */
let pending = "";
let exhausted = false;

/** Reads one line from stdin, for when there is no terminal to draw on. */
async function readLine(): Promise<string> {
	const buf = new Uint8Array(4096);
	while (true) {
		const at = pending.indexOf("\n");
		if (at >= 0) {
			const line = pending.slice(0, at).replace(/\r$/, "");
			pending = pending.slice(at + 1);
			return line;
		}
		if (exhausted) {
			const rest = pending.replace(/\r$/, "");
			pending = "";
			return rest;
		}
		const n = await Deno.stdin.read(buf);
		if (n === null) {
			exhausted = true;
			continue;
		}
		// Safe to stream here: this path is plain bytes, with none of the escape
		// sequences that make a persistent decoder desync in raw mode.
		pending += decoder.decode(buf.subarray(0, n), { stream: true });
	}
}

function normalize(arg?: string | PromptOptions): PromptOptions {
	if (typeof arg === "string") return { default: arg };
	return arg ?? {};
}

/**
 * Asks for a line of text.
 *
 * ```ts
 * const name = await cliPrompt("Project name?", "my-app");
 * ```
 */
export function cliPrompt(message: string, defaultValue?: string): Promise<string>;
export function cliPrompt(message: string, options?: PromptOptions): Promise<string>;
export async function cliPrompt(
	message: string,
	arg?: string | PromptOptions,
): Promise<string> {
	const opts = normalize(arg);
	const { session, release } = getOrCreateSession(opts.session);

	// No terminal to draw on: print the question and read a line, so piped input
	// still answers the prompt and the output stays free of escape codes.
	if (session.mode === "plain") {
		try {
			session.out.write(`${message} `);
			const line = await readLine();
			const value = line.length > 0 ? line : opts.default ?? "";
			session.out.write(`${value}\n`);
			return value;
		} finally {
			release();
		}
	}
	release();

	/** Code points, so editing does not split a multi-byte character. */
	let chars: string[] = [];
	let cursor = 0;
	let error: string | null = null;

	const prefix = `${message} `;

	/** Cursor column within the frame, recomputed each paint. */
	let cursorCol = 0;

	const buildLine = (columns: number): string => {
		const prefixWidth = displayWidth(prefix);
		const available = Math.max(1, columns - prefixWidth - 1);

		if (chars.length === 0) {
			cursorCol = prefixWidth;
			return prefix + colorize(opts.default ?? "", "gray");
		}

		// Scroll horizontally rather than wrapping: a prompt that grows a second row
		// would move its own anchor, and readline-style scrolling is what a terminal
		// user expects anyway.
		let start = 0;
		while (displayWidth(chars.slice(start, cursor).join("")) > available) start++;
		let end = cursor;
		while (
			end < chars.length &&
			displayWidth(chars.slice(start, end + 1).join("")) <= available
		) end++;

		cursorCol = prefixWidth + displayWidth(chars.slice(start, cursor).join(""));
		return prefix + chars.slice(start, end).join("");
	};

	return await runWidget<string>({
		session: opts.session,
		frame: (ctl) => {
			const line = buildLine(ctl.session.out.columns);
			// The error only earns a second row if there is one to spare.
			if (!error || ctl.session.availableRows < 2) return [line];
			return [line, `  ${colorize("✗", "red")} ${colorize(error, "red")}`];
		},
		afterRender: (ctl) => {
			ctl.session.showCursor();
			ctl.region.cursorTo(0, cursorCol);
		},
		onKey: (event, ctl) => {
			const value = () => (chars.length > 0 ? chars.join("") : opts.default ?? "");

			switch (event.name) {
				case "enter": {
					const result = value();
					const message = opts.validate?.(result) ?? null;
					if (message) {
						error = message;
						ctl.rerender();
						return;
					}
					ctl.region.commit([prefix + result]);
					ctl.resolve(result);
					return;
				}
				case "backspace":
					if (cursor > 0) {
						chars.splice(cursor - 1, 1);
						cursor--;
					}
					break;
				case "delete":
					if (cursor < chars.length) chars.splice(cursor, 1);
					break;
				case "left":
					if (cursor > 0) cursor--;
					break;
				case "right":
					if (cursor < chars.length) cursor++;
					break;
				case "home":
					cursor = 0;
					break;
				case "end":
					cursor = chars.length;
					break;
				case "paste": {
					// A pasted newline must not submit; it becomes a space.
					const text = (event.text ?? "").replace(/\r?\n/g, " ");
					const accepted = [...text].filter((c) => opts.filter?.(c, chars.join("")) ?? true);
					chars.splice(cursor, 0, ...accepted);
					cursor += accepted.length;
					break;
				}
				case "char": {
					const char = event.char ?? "";
					if (event.ctrl) {
						switch (char) {
							case "a":
								cursor = 0;
								break;
							case "e":
								cursor = chars.length;
								break;
							case "u":
								chars = chars.slice(cursor);
								cursor = 0;
								break;
							case "k":
								chars = chars.slice(0, cursor);
								break;
							case "w": {
								let at = cursor;
								while (at > 0 && chars[at - 1] === " ") at--;
								while (at > 0 && chars[at - 1] !== " ") at--;
								chars.splice(at, cursor - at);
								cursor = at;
								break;
							}
							default:
								return;
						}
						break;
					}
					if (opts.filter && !opts.filter(char, chars.join(""))) return;
					chars.splice(cursor, 0, char);
					cursor++;
					break;
				}
				default:
					return;
			}

			error = null;
			ctl.rerender();
		},
	});
}

/** Options for {@linkcode cliConfirm}. */
export interface ConfirmOptions {
	session?: CliSession;
}

/**
 * Asks a yes/no question.
 *
 * Only the letters that can spell "yes" or "no" are accepted, enforced through
 * the prompt's `filter` rather than by racing another key listener.
 */
export async function cliConfirm(
	message: string,
	def = false,
	opts: ConfirmOptions = {},
): Promise<boolean> {
	const accepts = (char: string, current: string): boolean => {
		const next = (current + char).toLowerCase();
		return "yes".startsWith(next) || "no".startsWith(next);
	};

	const yn = colorize(def ? "Y/n" : "y/N", "cyan");
	const answer = await cliPrompt(`${colorize(message, "green")} (${yn})`, {
		session: opts.session,
		filter: accepts,
	});
	return answer ? answer.charAt(0).toLowerCase() === "y" : def;
}

/** Shows a message and waits for Enter. */
export async function cliAlert(message: string, opts: ConfirmOptions = {}): Promise<void> {
	await cliPrompt(message + colorize(" Press Enter to continue", "gray"), {
		session: opts.session,
		filter: () => false,
	});
}

/**
 * Prints without corrupting a live frame.
 *
 * Inside a session this erases any live widget, writes, and repaints — which is
 * the difference between output landing in scrollback and output being smeared
 * across a half-drawn menu.
 */
export function cliLog(message: unknown, ...rest: unknown[]): void {
	const session = currentSession();
	if (session) session.log(message, ...rest);
	else console.log(message, ...rest);
}
