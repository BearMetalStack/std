import { joinPath } from "@lib/joinPath.ts";
import { walkDir } from "@lib/walkDir.ts";

function processSVG(svg: string, name: string) {
	svg = svg.replace(/svg/g, "symbol")
		.replace(/xmlns=".*?" ?/, "").replace(
			"<symbol",
			`<symbol id="${name}"`,
		)
		.replace(/<[?!](xml|doctype).*?>/, "");

	if (!Deno.args.includes("--preserve-colors")) {
		svg = svg.replace(/(fill|stroke)=".*?"/g, (_, e) => `${e}="currentColor"`);
	}

	return svg;
}

const [path, name = "sprite"] = Deno.args;

if (!path) {
	throw "You must provide a path to the directory holding all of the svgs.";
}
const parts = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none">'];
for await (const entry of walkDir(path)) {
	if (!entry.isFile || !entry.name.endsWith(".svg")) continue;
	parts.push(
		processSVG(
			await Deno.readTextFile(entry.path),
			entry.name.replace(".svg", ""),
		),
	);
}
parts.push("</svg>");

const target = joinPath("./icons", name + ".svg");
await Deno.mkdir(target.split("/").slice(0, -1).join("/"), { recursive: true });
await Deno.writeTextFile(target, parts.join(""));
