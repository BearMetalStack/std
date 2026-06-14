import { justify, longestLine } from "@bearmetal/miscellanea";
import { sets } from "@/string/ascii/art/mod.ts";

export function combineAscii(ascii1: string, ascii2: string, spacing = 4): string {
	ascii1 = justify(ascii1);
	ascii2 = justify(ascii2);
	const a1Lines = ascii1.split("\n");
	const a2Lines = ascii2.split("\n");
	const lineCount = Math.max(a1Lines.length, a2Lines.length);
	if (a1Lines.length !== lineCount) {
		a1Lines.unshift(...Array(Math.floor((lineCount - a1Lines.length) / 2)).fill(""));
	}
	if (a2Lines.length !== lineCount) {
		a2Lines.unshift(...Array(Math.floor((lineCount - a2Lines.length) / 2)).fill(""));
	}
	let accum = "";
	for (let i = 0; i < lineCount; i++) {
		accum += justify(a1Lines[i] ?? "", longestLine(ascii1)) + "".padEnd(spacing) +
			justify(a2Lines[i] ?? "", longestLine(ascii2)) + "\n";
	}
	return accum;
}

export function selectSet(): string[] {
	const now = Temporal.Now.plainDateISO();
	if (now.month === 10) return sets.spooky;
	return sets.def;
}

export * from "./art/mod.ts";

// if (import.meta.main) {
// 	const { columns } = Deno.consoleSize();
// 	sets.def.forEach((a) => renderTitleAscii(a, { maxWidth: columns, pride: true }));
// }
