const target = Deno.args[0];
const out = Deno.args[1];

if (!target || !out) {
	throw new Error("target and out are required");
}

const theme = { color: {} } as any;

const css = await Deno.readTextFile(target);

const colorRx = /--.*?:[\s\S]*?;/g;
// const colorRx = /--color-.*?#.*?;/g;

for (const match of css.matchAll(colorRx)) {
	console.log(match[0]);

	const [, name, value] = match[0].replaceAll("\n", " ").match(/--(.*?):\s?(.*?);/)!;
	console.log(name);
	if (/^calc\(/.test(value.trim())) {
		handleCalc(name, value);
		continue;
	}
	if (/^var\(--(.*?)\)$/.test(value.trim())) {
		handleAlias(name, value);
		continue;
	}
	if (!name.startsWith("color-")) {
		handleNoncolor(name, value);
		continue;
	}
	let [c, namespace, color, variant, step] = name.split("-");
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
	if (!theme[c][namespace]) {
		theme[c][namespace] = {};
	}
	if (!theme[c][namespace][color]) {
		theme[c][namespace][color] = {};
	}
	if (!theme[c][namespace][color][variant]) {
		theme[c][namespace][color][variant] = {};
	}

	theme[c][namespace][color][variant][step] = value;
}

function handleAlias(name: string, value: string) {
	const levels = name.split("-");
	const layer = createTree(theme, levels);
	const match = value.match(/var\(--(.*?)\)/);
	if (match) {
		layer["$ref"] = "$" + match[1].replace(/\./g, "__").replace(/-/g, ".");
	}
}
function handleNoncolor(name: string, value: string) {
	const levels = name.split("-");
	const key = levels.pop()!;
	const layer = createTree(theme, levels);
	layer[key] = value.replace(/\./g, "__");
}
function handleCalc(name: string, value: string) {
	const levels = name.split("-");
	const layer = createTree(theme, levels);
	const match = value.match(/calc\((.*)\)/);
	if (match) {
		const refstr = match[1].replace(
			/var\(--(.*?)\)/,
			(_, e) => "$" + e.replace(/\./g, "__").replace(/-/g, "."),
		);
		console.log(match[1], refstr);
		layer["$calc"] = (parseCalc(refstr) as any)["$calc"]!;
	}
}
type CalcNode =
	| { $calc: BinaryOp }
	| string // ref or raw value
	| number; // literal

type BinaryOp = {
	op: "+" | "-" | "*" | "/";
	left: CalcNode;
	right: CalcNode;
};
function parseCalc(input: string): CalcNode {
	const tokens = tokenize(input);
	let pos = 0;

	function peek() {
		return tokens[pos];
	}
	function consume() {
		return tokens[pos++];
	}

	function parseExpr(): CalcNode {
		let left = parseTerm();
		while (peek() === "+" || peek() === "-") {
			const op = consume() as "+" | "-";
			left = { $calc: { op, left, right: parseTerm() } };
		}
		return left;
	}

	function parseTerm(): CalcNode {
		let left = parsePrimary();
		while (peek() === "*" || peek() === "/") {
			const op = consume() as "*" | "/";
			left = { $calc: { op, left, right: parsePrimary() } };
		}
		return left;
	}

	function parsePrimary(): CalcNode {
		const token = consume();
		if (token === "(") {
			const node = parseExpr();
			consume(); // ")"
			return node;
		}
		if (token?.startsWith("$")) return token;
		const n = Number(token);
		if (!isNaN(n)) return n;
		throw new Error(`Unexpected token: ${token}`);
	}

	return parseExpr();
}

function createTree(root: any, levels: string[]) {
	let layer = root;
	let level = "";
	while (levels.length) {
		level = levels.shift()!;
		if (typeof layer[level] === "string") {
			const v = layer[level];
			layer[level] = { "": v };
		}
		if (!layer[level]) layer[level] = {};
		layer = layer[level];
	}
	return layer;
}

function tokenize(input: string): string[] {
	return input.match(/\$[\w.]+|[\d.]+|\S/g) ?? [];
}

await Deno.writeTextFile(out, JSON.stringify(theme, null, "\t"));
