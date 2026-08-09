/**
 * Styling, and the width problem underneath it.
 *
 * This command is the one that works everywhere: no session mode is required, no
 * keys are read. Colour switches itself off when stdout is redirected or
 * `NO_COLOR` is set, so the same code produces clean text in a log file.
 * @module
 */

import {
	bgColorize,
	bgColorMap,
	bold,
	type CliSession,
	colorEnabled,
	colorize,
	colorMap,
	dim,
	displayWidth,
	italic,
	strikethrough,
	stripAnsi,
	styleMap,
	stylize,
	truncateToWidth,
	underline,
} from "@bearmetal/cli";

/** Prints the colours, the attributes, and what measuring styled text costs. */
export function printPalette(session: CliSession): number {
	session.log(colorize("\nForeground", "porple"));
	session.log(
		"  " + Object.keys(colorMap)
			.filter((name) => name !== "grey")
			.map((name) => colorize(name, name))
			.join(" "),
	);

	session.log(colorize("\nBackground", "porple"));
	session.log(
		"  " + Object.keys(bgColorMap)
			.filter((name) => name !== "grey")
			.map((name) => bgColorize(` ${name} `, name))
			.join(" "),
	);

	session.log(colorize("\nAttributes", "porple"));
	session.log(
		"  " + Object.keys(styleMap)
			.map((name) => stylize(name, name as keyof typeof styleMap))
			.join(" "),
	);

	// Truecolor takes a hex string anywhere a colour name is accepted.
	session.log(colorize("\nTruecolor", "porple"));
	session.log(`  ${colorize("#aa55ee", "#aa55ee")} ${bgColorize(" #1b1b2b ", "#1b1b2b")}`);

	session.log(colorize("\nComposition", "porple"));
	session.log(`  ${bold(colorize("bold + colour", "green"))}`);
	session.log(`  ${underline(italic("underline + italic"))}`);
	session.log(`  ${dim(strikethrough("dim + strikethrough"))}`);

	// The part that actually matters when you lay anything out: a styled string's
	// `.length` counts escape bytes, so it is never the width you want. Every
	// renderer in the package measures with `displayWidth`, which strips ANSI and
	// counts wide characters as two columns.
	//
	// The escape is written out literally rather than via `colorize` so the numbers
	// below hold even when colour is off.
	const styled = "\x1b[38;2;170;85;238mbear\x1b[39m 熊";
	session.log(colorize("\nMeasurement", "porple"));
	session.log(`  raw .length      ${styled.length}`);
	session.log(`  stripAnsi length ${stripAnsi(styled).length}`);
	session.log(`  displayWidth     ${displayWidth(styled)}   ← use this one`);
	// Truncation is width-aware and keeps the styling intact — shown stripped here
	// only so the escapes don't clutter the line.
	session.log(`  truncated to 6   "${stripAnsi(truncateToWidth(styled, 6, "…"))}"`);

	session.log(
		colorize(
			`\ncolour is ${
				colorEnabled() ? "on" : "off"
			} (TTY: ${session.out.isTTY}, mode: ${session.mode})`,
			"gray",
		),
	);
	return 0;
}
