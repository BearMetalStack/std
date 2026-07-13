import {
	ansiTruecolor,
	BG_RESET,
	bgColorMap,
	colorMap,
	FG_RESET,
	getBGReset,
	getFGReset,
	type hexString,
	RESET,
	setBGReset,
	setFGReset,
} from "./style.ts";
import { writeRow } from "./write.ts";
import {
	bloody,
	boxIn,
	center,
	centerKeepAligned,
	combineAscii,
	cyber,
	doh,
	fender,
	graffiti,
	heart,
	isValidHex,
	longestLine,
	love,
	poison,
	rainbowPalette,
	random,
	slrel,
	stp,
	tmplr,
	vineskull,
} from "@bearmetal/miscellanea";

export * from "./write.ts";
export * from "./style.ts";
export * from "./argParser/mod.ts";
export * from "./prompts.ts";
export * from "./select.ts";

export function renderTitleAscii(
	ascii: string,
	{ maxWidth = longestLine(ascii), color = "white", background = "#0d0018", pride }: {
		maxWidth?: number;
		color?: string;
		background?: string;
		pride?: boolean;
	} = {},
): [string, string] {
	let notPridable = false;
	let bold = false;
	switch (ascii) {
		case bloody:
			notPridable = true;
			color = "red", background = "black";
			break;
		case poison:
			notPridable = true;
			color = "#a8d870", background = "#071200";
			ascii = combineAscii(poison, random(vineskull));
			break;
		case tmplr:
			ascii = boxIn(
				ascii.replace(/^\n/, "").replace(/^\s+/gm, "").split("\n").slice(0, -1).join("\n"),
			);
			break;
		case fender:
		case stp:
		case slrel:
		case doh:
		case graffiti:
		case cyber:
			bold = true;
			break;
	}

	// maxWidth = maxWidth === Infinity ? longestLine(ascii) : maxWidth;
	const old = ascii;
	if (pride && !notPridable) ascii = combineAscii(ascii, random(love, heart), 8);
	if (longestLine(ascii) > maxWidth) ascii = old;
	ascii = centerKeepAligned(ascii.replace(/^\n/, ""), maxWidth);
	if (pride && !notPridable) {
		// ascii = ascii.replace(
		// 	/[\n\s]*?$/,
		// );
		const colors = rainbowPalette(168, .5, .3);
		for (const row of ascii.split("\n")) {
			// if (!row.trim().length) continue;
			writeRow(row.split(""), colors, { bold });
			colors.push(colors.shift()!, colors.shift()!);
		}
		writeRow(
			center("Happy Pride Month to my fellow strays, gays and theys!", maxWidth).split(""),
			colors,
		);
		const transColors = ["#5BCEFA", "#F5A9B8", "#FFFFFF", "#F5A9B8", "#5BCEFA"].flatMap((e) =>
			Array.from({ length: Math.round(maxWidth / 5) }, () => e)
		);
		for (
			const row of center(
				"Trans rights are human rights\nWe will not go away\nWe will not be forgotten",
				maxWidth,
			).split("\n")
		) {
			writeRow(row.split(""), transColors, { fg: "#000000" });
		}
		return [color, background];
	}

	console.log(`%c${ascii}`, `color: ${color}; background-color: ${background};`);
	return [color, background];
}

export function startCliTheme(
	bgcolor: keyof typeof bgColorMap | hexString,
	fgcolor: keyof typeof colorMap | hexString = "white",
): { [Symbol.dispose](): void; cleanup(): void } {
	const currentFGReset = getFGReset();
	const currentBGReset = getBGReset();
	const isBase = currentFGReset === FG_RESET && currentBGReset === BG_RESET;
	const resetValue = isBase ? RESET : currentFGReset + currentBGReset;
	const reset = () => {
		console.log(resetValue);
		setFGReset(currentFGReset);
		setBGReset(currentBGReset);
	};
	if (isBase) {
		addEventListener("unload", reset, { once: true });
	}
	if (isValidHex(bgcolor)) bgcolor = ansiTruecolor(bgcolor);
	else bgcolor = bgColorMap[bgcolor];
	if (isValidHex(fgcolor)) fgcolor = ansiTruecolor(fgcolor, false);
	else fgcolor = colorMap[fgcolor];
	setFGReset(fgcolor);
	setBGReset(bgcolor);
	console.log(bgcolor + fgcolor + "\n");
	return {
		[Symbol.dispose]() {
			reset();
			removeEventListener("unload", reset);
		},
		cleanup() {
			reset();
			removeEventListener("unload", reset);
		},
	};
}
