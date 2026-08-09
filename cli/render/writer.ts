/**
 * The output sink every renderer writes through.
 *
 * Routing all terminal writes past one small interface is what makes the render
 * layer testable without a TTY — and it is the only place that has to know
 * `Deno.consoleSize()` throws when nothing is connected to a terminal.
 * @module
 */

/** Somewhere styled terminal output can be written, with a known size. */
export interface TerminalWriter {
	write(s: string): void;
	readonly columns: number;
	readonly rows: number;
	readonly isTTY: boolean;
}

/**
 * The terminal size, or a usable guess.
 *
 * `Deno.consoleSize()` throws outright when stdin, stdout and stderr are all
 * detached — piping output is enough to trigger it — so every caller needs this
 * rather than the raw API.
 */
export function safeConsoleSize(): { columns: number; rows: number } {
	try {
		return Deno.consoleSize();
	} catch {
		// Fall through to the environment, then to the classic default.
	}
	const columns = Number(readEnv("COLUMNS"));
	const rows = Number(readEnv("LINES"));
	return {
		columns: Number.isFinite(columns) && columns > 0 ? columns : 80,
		rows: Number.isFinite(rows) && rows > 0 ? rows : 24,
	};
}

function readEnv(name: string): string | undefined {
	try {
		if (Deno.permissions?.querySync?.({ name: "env", variable: name }).state !== "granted") {
			return undefined;
		}
		return Deno.env.get(name);
	} catch {
		return undefined;
	}
}

const encoder = new TextEncoder();

/**
 * A {@linkcode TerminalWriter} over stdout.
 *
 * The size is cached rather than read per write; {@linkcode StdoutWriter.refresh}
 * re-reads it, which the session does on `SIGWINCH`.
 */
export class StdoutWriter implements TerminalWriter {
	#columns: number;
	#rows: number;
	readonly isTTY: boolean;

	constructor() {
		const size = safeConsoleSize();
		this.#columns = size.columns;
		this.#rows = size.rows;
		this.isTTY = (() => {
			try {
				return Deno.stdout.isTerminal();
			} catch {
				return false;
			}
		})();
	}

	write(s: string) {
		Deno.stdout.writeSync(encoder.encode(s));
	}

	get columns(): number {
		return this.#columns;
	}

	get rows(): number {
		return this.#rows;
	}

	/** Re-reads the terminal size after a resize. */
	refresh() {
		const size = safeConsoleSize();
		this.#columns = size.columns;
		this.#rows = size.rows;
	}
}

let shared: StdoutWriter | null = null;

/** The process-wide stdout writer. */
export function stdoutWriter(): StdoutWriter {
	return shared ??= new StdoutWriter();
}
