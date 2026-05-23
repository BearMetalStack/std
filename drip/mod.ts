const OPEN_COMMENT = "/* ";
const CLOSE_COMMENT = " */";
const SEPARATOR = "═";
const TOPL = "╔";
const TOPR = "╗";
const BOTL = "╚";
const BOTR = "╝";
const SIDE = "║";

function boxIn(pair: string) {
	const separator = "".padEnd(pair.length + 2, SEPARATOR);

	return `\n${OPEN_COMMENT}\n\t${TOPL}${separator}${TOPR}\n\t${SIDE} ${pair} ${SIDE}\n\t${BOTL}${separator}${BOTR}${CLOSE_COMMENT}`;
}

export async function cssFromJson(theme: string, scope: string = ":root") {
	const res = await fetch(new URL(`./themes/${theme}.theme.json`, import.meta.url));
	const json = await res.json();
	const kvs: SectionedTokens = [];
	for (const [key, value] of Object.entries(json)) {
		kvs.push(...constructKeys(value as any, `--${key}-`));
	}

	const css = scope + " {\n" + kvs.map((pair) => {
		if (!pair) return "";
		if (typeof pair === "string") {
			return boxIn(pair);
		}
		return `\t${pair[0]}: ${
			pair[1].startsWith("$") ? `var(${pair[1].replace("$", "")})` : pair[1]
		};`;
	}).join("\n") + "\n}\n";
	return css;
}

type SectionedTokens = ([string, string] | string)[];

function constructKeys<
	T extends Record<string, string | T>,
>(
	theme: T,
	prefix: string = "--",
	path: string[] = [],
	depth: number = 0,
): SectionedTokens {
	const kvs: SectionedTokens = [];
	if (depth === 1 && path.at(-1) !== "bearmetal") {
		kvs.push(`${prefix.toUpperCase().replaceAll("-", " ").trim()}: ${path.at(-1)}`);
	}
	if (depth === 2 && path.at(-2) === "bearmetal") {
		kvs.push(
			`BearMetal ${prefix.toUpperCase().replaceAll("-", " ").trim()}: ${path.at(-1)}`.replace(
				/: $/,
				"",
			),
		);
	}
	if (Object.keys(theme).some((k) => !isNaN(Number(k))) && path.at(-1)) {
		kvs.push("");
	}

	for (const [key, value] of Object.entries(theme)) {
		if (typeof value === "string") {
			kvs.push([
				prefix + path.concat([key.replace("$ref", "")]).filter(Boolean).join("-"),
				value.replace("$", "$" + prefix).replaceAll(".", "-"),
			]);
		} else {
			kvs.push(...constructKeys(value, prefix, [...path, key], depth + 1));
		}
	}

	return kvs;
}

if (import.meta.main) {
	Deno.writeTextFile("temp.css", await cssFromJson("bearmetal"));
}
