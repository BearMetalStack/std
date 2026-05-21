import { walkDir } from "@lib/walkDir.ts";

export async function createBundles(
	{ prod, version }: { prod: boolean; version: string },
) {
	const entrypoints: string[] = [];
	for await (const dirEntry of walkDir("./components")) {
		if (dirEntry.name === "mod.ts" && dirEntry.isFile) {
			entrypoints.push(dirEntry.path);
		}
	}

	const dir = prod ? `prod/${version}` : "dist";

	const result = await Deno.bundle({
		entrypoints,
		outputDir: dir,
		platform: "browser",
		minify: prod,
		keepNames: prod,
		write: false,
	});

	for (const file of result.outputFiles!) {
		const extension = file.path.split(".").at(-1) ?? "js";
		let path = file.path.split("/").toSpliced(-1, 1).join("/") + "." +
			extension;
		if (
			path.endsWith("dist." + extension) ||
			path.endsWith(version + "." + extension)
		) {
			path = path.split("/").toSpliced(
				-1,
				1,
				prod ? version : "dist",
				"fullFat." + extension,
			).join("/");
		}
		console.log(`writing bundle ${path}`);
		Deno.mkdir(path.split("/").slice(0, -1).join("/"), { recursive: true });
		await Deno.writeTextFile(
			path,
			file.text(),
		);
	}

	return dir;
}
