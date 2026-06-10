import { ansiTruecolor } from "./style.ts";

const bold = "\x1b[1m";
const reset = "\x1b[0m";
const encoder = new TextEncoder();

export function writeRow(
	chars: string[],
	colors: string[],
	opts?: { bold?: boolean; fg?: string },
): void {
	let row = "";
	for (let i = 0; i < chars.length; i++) {
		row += ansiTruecolor(opts?.fg ?? "#ffffff", false) + ansiTruecolor(colors[i % colors.length]) +
			(opts?.bold ? bold : "") + chars[i];
	}
	row += reset + "\n";
	Deno.stdout.writeSync(encoder.encode(row));
}
