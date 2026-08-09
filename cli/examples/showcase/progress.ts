/**
 * Live output that isn't a widget.
 *
 * A {@linkcode Region} is the repaintable block on its own, without keyboard
 * focus — the right tool for progress, spinners, and anything else that updates
 * while the program works. The rule that makes it composable: while a region is
 * live, other output goes through {@linkcode CliSession.log}, never straight to
 * stdout. The session erases the frame, prints, and repaints it.
 * @module
 */

import { type CliSession, colorize } from "@bearmetal/cli";

const FILLED = "█";
const EMPTY = "░";

/** Walks through `steps`, drawing a bar and logging each one as it completes. */
export async function runProgress(
	session: CliSession,
	steps: string[],
	stepMs = 250,
): Promise<number> {
	if (steps.length === 0) return 0;

	const region = session.region();
	session.hideCursor();

	try {
		for (let i = 0; i < steps.length; i++) {
			region.render(frame(session, steps, i));
			await new Promise((resolve) => setTimeout(resolve, stepMs));
			// Straight `console.log` here would smear the frame — unless the session
			// was started with `captureConsole`, which routes it through this path
			// anyway. `main.ts` does exactly that; this call is the explicit form.
			session.log(`  ${colorize("✓", "green")} ${steps[i]}`);
		}

		// `commit` closes the region: the live frame is erased and these lines are
		// left behind as ordinary scrollback, cursor at column 0 of a fresh row.
		region.commit([`${colorize("✓", "green")} ${steps.length} steps complete`]);
	} finally {
		// If anything above threw, the region is still on screen. Take it down.
		if (!region.closed) region.clear();
		session.showCursor();
	}

	return 0;
}

/** One frame: a bar, and the step it belongs to. */
function frame(session: CliSession, steps: string[], current: number): string[] {
	// Ask the session's writer for the width every frame. A terminal that was
	// resized mid-run has already told the session; a cached width has not heard.
	const width = Math.max(10, Math.min(40, session.out.columns - 20));
	const done = current / steps.length;
	const filled = Math.round(done * width);

	return [
		`${colorize(FILLED.repeat(filled) + EMPTY.repeat(width - filled), "porple")} ${
			`${Math.round(done * 100)}%`.padStart(4)
		}`,
		colorize(`  ${steps[current]}`, "gray"),
	];
}
