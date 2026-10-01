import type { ColorInput, RGBA } from "../types.ts";

const NAMED: Record<string, string> = {
	black: "#000000",
	white: "#ffffff",
	red: "#ff0000",
	green: "#008000",
	lime: "#00ff00",
	blue: "#0000ff",
	yellow: "#ffff00",
	cyan: "#00ffff",
	magenta: "#ff00ff",
	orange: "#ffa500",
	purple: "#800080",
	gray: "#808080",
	grey: "#808080",
	silver: "#c0c0c0",
	navy: "#000080",
	teal: "#008080",
};

const cache = new Map<string, RGBA>();

/**
 * Parses a {@linkcode ColorInput} into straight-alpha channels in `0..1`.
 * Throws on anything it does not recognize.
 */
export function parseColor(input: ColorInput): RGBA {
	if (typeof input !== "string") {
		return [input[0], input[1], input[2], input[3] ?? 1];
	}
	const hit = cache.get(input);
	if (hit) return [...hit];
	const parsed = parseString(input.trim().toLowerCase());
	if (!parsed) throw new Error(`anodized: unrecognized color ${JSON.stringify(input)}`);
	cache.set(input, parsed);
	return [...parsed];
}

function parseString(s: string): RGBA | null {
	if (s === "transparent" || s === "none") return [0, 0, 0, 0];
	if (NAMED[s]) s = NAMED[s];
	if (s.startsWith("#")) return parseHex(s.slice(1));
	const m = /^rgba?\((.*)\)$/.exec(s);
	if (m) {
		const parts = m[1].split(/[\s,/]+/).filter(Boolean);
		if (parts.length < 3 || parts.length > 4) return null;
		const ch = parts.slice(0, 3).map((p) =>
			p.endsWith("%") ? parseFloat(p) / 100 : parseFloat(p) / 255
		);
		const a = parts[3] === undefined
			? 1
			: parts[3].endsWith("%")
			? parseFloat(parts[3]) / 100
			: parseFloat(parts[3]);
		const out = [...ch, a] as RGBA;
		return out.every((v) => Number.isFinite(v)) ? out : null;
	}
	return null;
}

function parseHex(h: string): RGBA | null {
	if (!/^[0-9a-f]+$/.test(h)) return null;
	if (h.length === 3 || h.length === 4) {
		h = [...h].map((c) => c + c).join("");
	}
	if (h.length !== 6 && h.length !== 8) return null;
	const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
	return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
}
