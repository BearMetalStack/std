const target = Deno.args[0];
const out = Deno.args[1];

if (!target || !out) {
	throw new Error("target and out are required");
}

const theme = { color: {} } as any;

const css = await Deno.readTextFile(target);

const colorRx = /--color-.*?:.*?;/g;
// const colorRx = /--color-.*?#.*?;/g;

for (const match of css.matchAll(colorRx)) {
	const [, name, value] = match[0].match(/--color-(.*?):\s?(.*?);/)!;
	if (value.includes("var")) {
		handleAlias(name, value);
		continue;
	}
	let [namespace, color, variant, step] = name.split("-");
	if (color === "muted") {
		step = variant;
		variant = color;
		color = "";
	}
	if (!variant) {
		variant = color;
		color = "";
	}
	if (!step) {
		step = variant;
		variant = "";
	}
	if (!theme.color[namespace]) {
		theme.color[namespace] = {};
	}
	if (!theme.color[namespace][color]) {
		theme.color[namespace][color] = {};
	}
	if (!theme.color[namespace][color][variant]) {
		theme.color[namespace][color][variant] = {};
	}

	theme.color[namespace][color][variant][step] = value;
}

function handleAlias(name: string, value: string) {
	const levels = name.split("-");
	let layer = theme.color;
	while (levels.length) {
		const level = levels.shift()!;
		if (!layer[level]) layer[level] = {};
		layer = layer[level];
	}
	const match = value.match(/var\(--(color-.*?)\)/);
	if (match) {
		layer["$ref"] = "$" + match[1].replace(/-/g, ".");
	}
}

await Deno.writeTextFile(out, JSON.stringify(theme, null, "\t"));
