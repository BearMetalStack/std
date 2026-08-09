/**
 * A custom widget.
 *
 * {@linkcode runWidget} is the whole contract: produce a frame, handle a key,
 * resolve. It takes care of acquiring the session, taking a region, claiming
 * keyboard focus, escalating to the alternate screen when the content is too tall
 * to fit inline, and putting all of that back afterwards.
 *
 * Note what the widget never does: it does not read stdin, does not set raw mode,
 * does not move the cursor absolutely, and does not register key listeners. One
 * widget has focus at a time, and it is handed its keys.
 * @module
 */

import { type CliSession, colorize, type KeyEvent, runWidget } from "@bearmetal/cli";

/** How many keys to keep on screen. */
const HISTORY = 8;

/** Shows decoded key events as they arrive, until Escape. */
export async function runKeyInspector(session: CliSession): Promise<number> {
	if (session.mode === "plain") {
		session.log(colorize("The key inspector needs a terminal.", "red"));
		return 1;
	}

	const history: string[] = [];

	await runWidget<void>({
		session,
		// What the widget wants if unconstrained. Exceeding the rows available
		// inline is what triggers the switch to the alternate screen — pass
		// `neverEscalate: true` to stay put instead.
		naturalHeight: () => HISTORY + 2,

		frame: () => {
			const lines = [colorize("Press keys. Escape quits.", "green")];
			for (const entry of history) lines.push(`  ${entry}`);
			// Keep the frame a fixed height so rows don't jump as it fills.
			while (lines.length < HISTORY + 1) lines.push("");
			return lines;
		},

		// Runs after every paint. Cursor placement belongs here, positioned
		// relative to the region — the frame decides where the cursor goes, not
		// the code that decoded the key.
		afterRender: (ctl) => ctl.session.hideCursor(),

		onKey: (event, ctl) => {
			if (event.name === "escape") {
				ctl.region.commit([
					`${colorize("keys", "green")} - ${history.length} events seen`,
				]);
				ctl.resolve();
				return;
			}

			history.push(describe(event));
			if (history.length > HISTORY) history.shift();
			// Nothing repaints on its own. State changed, so ask for a frame.
			ctl.rerender();
		},
	});

	return 0;
}

/** Renders one {@linkcode KeyEvent} as a row. */
function describe(event: KeyEvent): string {
	const parts = [colorize(event.name.padEnd(9), "porple")];

	if (event.char !== undefined) parts.push(`char ${JSON.stringify(event.char)}`);
	// A bracketed paste arrives as one event, not as a burst of characters.
	if (event.text !== undefined) parts.push(`text ${JSON.stringify(truncate(event.text, 24))}`);

	const mods = (["ctrl", "alt", "shift", "meta"] as const).filter((mod) => event[mod]);
	if (mods.length > 0) parts.push(colorize(mods.join("+"), "cyan"));

	parts.push(colorize(printable(event.sequence), "gray"));
	return parts.join("  ");
}

/** The raw bytes, with the control characters made visible. */
function printable(sequence: string): string {
	return [...sequence].map((char) => {
		const code = char.codePointAt(0) ?? 0;
		if (code === 0x1b) return "\\e";
		if (code < 0x20 || code === 0x7f) return `\\x${code.toString(16).padStart(2, "0")}`;
		return char;
	}).join("");
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
