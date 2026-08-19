import { joinPath } from "@bearmetal/miscellanea";

export async function DevServer() {
	const assetMap = new Map<string, [string, string]>();
	const associationMap = new Map<string, Set<string>>();

	const serveDir = await Deno.realPath(Deno.args[0] ?? ".");

	const bus = new EventTarget();

	watch().catch();

	Deno.serve({ port: 8345 }, async (req) => {
		const url = new URL(req.url);
		if (url.pathname === "/events") {
			let listener: (e: Event) => void;
			const body = new ReadableStream({
				start(controller) {
					listener = () => {
						const ev = `event: reload\ndata: ${Date.now()}\n\n`;
						controller.enqueue(new TextEncoder().encode(ev));
					};
					bus.addEventListener("reload", listener);
				},
				cancel() {
					bus.removeEventListener("reload", listener);
				},
			});
			return new Response(body, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					"Connection": "keep-alive",
				},
			});
		}
		try {
			const path = joinPath(serveDir, url.pathname === "/" ? "index.html" : url.pathname);

			let asset = assetMap.get(path);
			if (!asset && isBundlable(path)) asset = await bundleAndCache(path);
			try {
				if (!asset) asset = [mimeType(path), await Deno.readTextFile(path)];
			} catch {
				return new Response(null, { status: 404 });
			}

			if (asset[0] === "text/html") {
				asset[1] = asset[1].replace(
					/<head>/,
					`<head><script>new EventSource("/events").addEventListener("reload", () => location.reload());</script>`,
				);
			}

			return new Response(asset[1], { headers: { "Content-Type": asset[0] } });
		} catch (e) {
			console.log(e);
			return new Response(null, { status: 404 });
		}
	});

	function mimeType(path: string) {
		const ext = path.split(".").pop();
		switch (ext) {
			case "js":
			case "ts":
			case "jsx":
			case "tsx":
				return "text/javascript";
			case "htm":
			case "html":
				return "text/html";
			case "css":
				return "text/css";
			case "json":
				return "application/json";
			case "svg":
				return "image/svg+xml";
			case "jpg":
			case "jpeg":
				return "image/jpeg";
			case "png":
				return "image/png";
			default:
				return "text/plain";
		}
	}

	function isBundlable(path: string) {
		return ["text/javascript"].includes(mimeType(path));
	}

	async function bundleAndCache(
		path: string,
	): Promise<[string, string] | undefined> {
		const filename = path.split("/").pop();
		path = await Deno.realPath(path);
		console.log(`Bundler: Bundling ${filename}...`);
		const start = performance.now();

		const b = await Deno.bundle({
			entrypoints: [path],
			write: false,
			outputDir: ".",
			sourcemap: "inline",
			platform: "browser",
			inlineImports: true,
			packages: "bundle",
			codeSplitting: false,
		});

		const end = performance.now();
		console.log(
			`Bundler: Bundled ${filename} in ${Math.round(end - start)}ms - ${
				b.outputFiles?.length ?? 0
			} files generated.`,
		);
		const ass = new Set<string>();

		for (const file of b.outputFiles ?? []) {
			const sourceMap = extractSourceMap(file.text());
			for (const source of sourceMap?.sources ?? []) {
				if (source.startsWith("http")) continue;
				let tail = source.replace(/^(\.\.\/)+/, "");
				let absSource: string;
				if (tail === source) {
					if (tail.startsWith(serveDir.split("/").at(-1) ?? "[[NO PATH]]")) {
						tail = "./" + tail.split("/").slice(1).join("/");
					}
					absSource = await Deno.realPath(joinPath(serveDir, tail));
				} else absSource = await Deno.realPath(joinPath("/home/emma/repos/bearmetal", tail));
				const associations = associationMap.get(absSource) ?? new Set<string>();
				associations.add(file.path);
				assetMap.set(absSource, [mimeType(absSource), file.text()]);
				associationMap.set(absSource, associations);
				ass.add(absSource);
			}
			const associations = associationMap.get(file.path) ?? new Set<string>();
			associations.add(path);
			ass.add(file.path);
			assetMap.set(file.path, [mimeType(file.path), file.text()]);
			associationMap.set(file.path, associations);
			console.log(`  Cached :: ${file.path}`);
		}

		associationMap.set(path, ass);

		return assetMap.get(path);
	}

	async function watch() {
		for await (const fEvent of Deno.watchFs(serveDir, { recursive: true })) {
			if (fEvent.kind === "modify") {
				console.log(`  Modified :: ${fEvent.paths.join(", ")}`);
				invalidateCacheEntries(new Set<string>(fEvent.paths));
			}
		}
	}

	function invalidateCacheEntries(paths: Set<string>) {
		let invs = 0;
		for (const path of paths) {
			console.log(`    Invalidating :: ${path}`);
			associationMap.get(path)?.forEach(paths.add.bind(paths));
			associationMap.delete(path);
			if (assetMap.delete(path)) invs++;
		}
		bus.dispatchEvent(new Event("reload"));
		console.log(`  Invalidated ${invs} entries`);
	}

	function extractSourceMap(text: string): { sources: string[] } | undefined {
		const rx = /^\/\/# sourceMappingURL=data:application\/json;base64,(.*?)$/m;
		const m = text.match(rx);
		const b64 = m?.[1];
		return b64 ? JSON.parse(atob(b64)) : undefined;
	}
}

export async function bundle(serveDir: string, entryPoint: string): Promise<string> {
	const tmp = await Deno.makeTempDir();
	const cmd = new Deno.Command("deno", {
		args: [
			"bundle",
			"--outdir",
			tmp,
			"--platform=browser",
			"--sourcemap=inline",
			"-o",
			entryPoint.replace(/\.tsx?$/, ".js"),
			entryPoint,
		],
		cwd: serveDir,
		stdout: "piped",
		stderr: "piped",
	});
	const r = await cmd.output();
	if (!r.success) throw new Error("Unable to bundle " + entryPoint);
	return tmp;
}

if (import.meta.main) {
	DevServer();
}
