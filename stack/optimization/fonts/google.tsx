export type googleFont = {
	family: string;
	ital?: boolean;
	wght?: number | string | (string | number)[];
};

function buildFamilyString(f: googleFont): string {
	let str = f.family;
	if (f.ital || f.wght) str += ":";
	if (f.ital) str += "ital" + (f.wght ? "," : "");
	if (typeof f.wght === "string" || typeof f.wght === "number") str += `wght@${f.wght}`;
	else if (Array.isArray(f.wght)) str += `wght@${f.wght.join(";")}`;
	return str;
}

type GoogleFontsProps = {
	// href: string | string[];
	fonts: googleFont[];
	display?: string;
};

export async function GoogleFonts(
	{ fonts, display = "swap" }: GoogleFontsProps,
): Promise<Element | import("@bearmetal/jsx").Html> {
	const href = `https://fonts.googleapis.com/css2?family=${
		fonts.map(buildFamilyString).join("&family=")
	}&display=${display}`;
	const r = await fetch(href);
	const css = await r.text();
	return (
		<>
			<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
			<style $raw>
				{css}
			</style>
		</>
	);
}
