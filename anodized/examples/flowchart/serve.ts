const here = new URL(".", import.meta.url);
const bundle = await Deno.bundle({
	entrypoints: [new URL("app.ts", here).pathname],
	write: false,
	platform: "browser",
	outputDir: "out",
});
const js = bundle.outputFiles?.find((f) => f.path.endsWith(".js"))?.text();
if (!js) throw new Error(`bundle failed: ${JSON.stringify(bundle.errors)}`);

const files: Record<string, [string, () => Promise<BodyInit>]> = {
	"/": ["text/html", () => Deno.readTextFile(new URL("index.html", here))],
	"/app.js": ["text/javascript", () => Promise.resolve(js)],
	"/Vera.ttf": ["font/ttf", () => Deno.readFile(new URL("../../testdata/Vera.ttf", here))],
};

Deno.serve({ hostname: "127.0.0.1", port: 8123 }, async (req) => {
	const file = files[new URL(req.url).pathname];
	if (!file) return new Response("not found", { status: 404 });
	return new Response(await file[1](), { headers: { "content-type": file[0] } });
});
