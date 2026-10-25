/**
 * @module
 * The icons gutenbearg's chrome and blocks draw, and the sprite sheet that holds them.
 *
 * Every name is a Phosphor symbol; a `-fill` suffix picks the filled weight. The served sprite is
 * built per site from the sheets in `assets/phosphor` (copied in by `deno task bm:icons`): these,
 * plus whatever icons the content names.
 */

/** Every icon the sprite sheet carries. */
export const ICONS = [
	"arrow-left",
	"arrow-right",
	"book-bookmark",
	"book-open",
	"brackets-curly",
	"calendar-blank",
	"caret-down",
	"caret-right",
	"check",
	"clock",
	"clock-counter-clockwise",
	"copy",
	"cube",
	"file-code",
	"fire-fill",
	"footprints",
	"funnel-simple",
	"git-branch",
	"github-logo",
	"house",
	"info-fill",
	"lightbulb",
	"lightbulb-fill",
	"lightning",
	"magnifying-glass",
	"moon",
	"path",
	"paw-print",
	"paw-print-fill",
	"pencil-simple",
	"rocket",
	"signpost",
	"stack",
	"sun",
	"tag",
	"terminal-window",
	"tree-structure",
	"warning-fill",
	"x",
] as const;

/** A symbol id in the sprite sheet. */
export type IconName = typeof ICONS[number];

const SYMBOL = /<symbol\b[^>]*\sid="([^"]+)"[\s\S]*?<\/symbol>/g;

let sheets: Promise<{ regular: Map<string, string>; fill: Map<string, string> }> | null = null;

function loadSheets() {
	const read = async (weight: string) => {
		const svg = await fetch(new URL(`./assets/phosphor/${weight}.svg`, import.meta.url)).then((r) =>
			r.text()
		);
		return new Map([...svg.matchAll(SYMBOL)].map((m) => [m[1], m[0]]));
	};
	return sheets ??= Promise.all([read("regular"), read("fill")]).then(([regular, fill]) => ({
		regular,
		fill,
	}));
}

/**
 * A sprite sheet holding {@linkcode ICONS} and `extra`, and the names that matched no symbol. A
 * name ending in `-fill` takes the filled weight.
 */
export async function buildSprite(
	extra: Iterable<string> = [],
): Promise<{ sheet: string; missing: string[] }> {
	const { regular, fill } = await loadSheets();
	const names = [...new Set([...ICONS, ...extra])].sort();
	const symbols: string[] = [];
	const missing: string[] = [];
	for (const name of names) {
		const filled = name.endsWith("-fill");
		const symbol = filled ? fill.get(name.slice(0, -5)) : regular.get(name);
		if (!symbol) missing.push(name);
		else symbols.push(symbol.replace(/\sid="[^"]+"/, ` id="${name}"`));
	}
	return {
		sheet: `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join("\n")}\n</svg>\n`,
		missing,
	};
}
