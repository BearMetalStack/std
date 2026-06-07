export function ansiTruecolor(hex: string, bg = true): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `\x1b[${bg ? 48 : 38};2;${r};${g};${b}m`;
}

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
