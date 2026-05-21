// deno-lint-ignore no-import-prefix
import { $ } from "jsr:@david/dax@0.45.0";
import { createBundles } from "./Bundle.ts";
import { walkDir } from "@bearmetal/miscellanea";

const BUCKET = "cggtestbucket";

const { version } = JSON.parse(await Deno.readTextFile("deno.json")) as {
	version: string;
};

const prod = Deno.args.includes("--prod");

const dir = await createBundles({
	prod,
	version,
});

for await (const entry of walkDir(dir)) {
	if (!entry.isFile) continue;
	console.log(`${prod ? "Publishing" : "Would publish"} ${entry.path}`);

	if (Deno.args.includes("--dry-run")) continue;

	const ext = entry.name.split(".").pop();
	const contentType = {
		css: "text/css",
		js: "application/javascript",
		svg: "image/svg+xml",
	}[ext ?? ""] ?? "application/octet-stream";

	await $`wrangler r2 object put ${BUCKET}/webbies/${version}/${entry.name} \
    --file ${dir}/${entry.name} \
    --content-type ${contentType} \
    --cache-control "public, max-age=31536000, immutable"`;

	console.log(`Uploaded ${entry.name}`);
}
