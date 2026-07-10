import { bundleEntrypoints } from "@bearmetal/app/ssr";
import { getAllStylesheets } from "@bearmetal/app";
import { type Module, Script, TrustedModule } from "@bearmetal/router";
import { walkDir } from "@bearmetal/miscellanea/fs";
import { isDev } from "@bearmetal/miscellanea/environment";
import { html, joinPath } from "@bearmetal/miscellanea";

export * from "./optimization/fonts/google.tsx"

const scriptFiles = ["js", "ts", "jsx", "tsx"];

/** Directories searched, in order, for the components directory. */
const componentDirs = ["components", "src/components"];

/** Matches `manifest.ts` (the default bundle) and `<subset>.manifest.ts` (a named one). */
const manifestRx = /^(?:(?<subset>.+)\.)?manifest\.(?:js|ts|jsx|tsx)$/;

/** URL prefix that every component bundle and shared chunk is served under. */
export const componentsEndpoint = "/@bearmetal/components";

/** Served name of the default bundle, the one injected into every page. */
const defaultBundleName = "index";

/**
 * Bundled alongside the component entrypoints so that the shared chunks emitted
 * here are byte-identical to the ones `Page()`'s own `buildBundle` emits — and
 * therefore carry the same content-hashed filenames.
 *
 * `Page()` inlines its scripts, and those scripts import their chunks by a
 * relative specifier that resolves to the site root. Serving the raw outputs at
 * the root (see the `/:script` route) is what makes those imports resolve.
 * Drop these entrypoints and `Page()`'s islands stop hydrating.
 */
const pageRuntimeEntrypoints = ["jsr:@bearmetal/app", "jsr:@bearmetal/app/signals"];

type Entrypoint = {
	/** Path handed to the bundler. */
	path: string;
	/** Output filename the bundler emits for it, named after the entrypoint's basename. */
	output: string;
	/** Name it is served under, after the endpoint prefix. */
	served: string;
};

async function findComponentsDir(): Promise<string | null> {
	for (const dir of componentDirs) {
		try {
			if ((await Deno.stat(dir)).isDirectory) return dir;
		} catch {
			// not this one
		}
	}
	return null;
}

function outputName(file: string): string {
	return file.replace(/\.(?:js|ts|jsx|tsx)$/, ".js");
}

async function fileUrl(path: string): Promise<string> {
	return "file://" + await Deno.realPath(path);
}

type Resolved = {
	entrypoints: Entrypoint[];
	/** Modules to import for their `@define` side effects, so stylesheets register. */
	sideEffects: string[];
	/** Temp directory holding a synthesized entry, when there is no `manifest.ts`. */
	tempDir?: string;
};

/**
 * Works out what to bundle.
 *
 * A `manifest.ts` in the components directory *replaces* the default glob of
 * every component under it. Each `<subset>.manifest.ts` becomes its own bundle,
 * served under its subset name. With no `manifest.ts`, a temporary entry that
 * imports every component in the directory stands in for it.
 */
async function resolveEntrypoints(dir: string): Promise<Resolved> {
	const subsets: Entrypoint[] = [];
	let defaultEntry: Entrypoint | undefined;

	for await (const entry of Deno.readDir(dir)) {
		if (!entry.isFile) continue;
		const match = entry.name.match(manifestRx);
		if (!match) continue;

		const subset = match.groups?.subset;
		const resolved: Entrypoint = {
			path: joinPath(dir, entry.name),
			output: outputName(entry.name),
			served: subset ?? defaultBundleName,
		};
		if (subset) subsets.push(resolved);
		else defaultEntry = resolved;
	}

	if (defaultEntry) {
		const paths = [defaultEntry, ...subsets].map((e) => e.path);
		return {
			entrypoints: [defaultEntry, ...subsets],
			sideEffects: await Promise.all(paths.map(fileUrl)),
		};
	}

	const components: string[] = [];
	for await (const entry of walkDir(dir)) {
		if (!entry.isFile) continue;
		if (manifestRx.test(entry.name)) continue;
		if (!scriptFiles.includes(entry.name.split(".").pop()!)) continue;
		components.push(await fileUrl(entry.path));
	}

	if (components.length === 0) {
		return {
			entrypoints: subsets,
			sideEffects: await Promise.all(subsets.map((e) => fileUrl(e.path))),
		};
	}

	const tempDir = await Deno.makeTempDir();
	// Named distinctly: outputs are keyed by entrypoint basename, and a bare
	// `index.ts` would collide with `@bearmetal/app/signals`'s own index.ts.
	const synthesized = joinPath(tempDir, "bearmetal-components.ts");
	await Deno.writeTextFile(
		synthesized,
		components.map((url) => `import "${url}";`).join("\n"),
	);

	return {
		entrypoints: [
			{ path: synthesized, output: "bearmetal-components.js", served: defaultBundleName },
			...subsets,
		],
		sideEffects: [...components, ...await Promise.all(subsets.map((e) => fileUrl(e.path)))],
		tempDir,
	};
}

/**
 * Keys emitted files by the name they are served under. Entry outputs take
 * their entrypoint's served name; shared chunks keep their emitted filename, so
 * that the relative imports inside each entry resolve against the endpoint.
 */
function serveMap(entrypoints: Entrypoint[], scripts: Map<string, string>): Map<string, string> {
	const byOutput = new Map(entrypoints.map((e) => [e.output, e.served]));
	const served = new Map<string, string>();
	for (const [name, code] of scripts) served.set(byOutput.get(name) ?? name, code);
	return served;
}
/** Serves the client bundle at the reserved `/@bearmetal/components` endpoint. */
class StackComponentsModule extends TrustedModule {
	constructor() {
		super("@bearmetal/components");
	}
}

export function createStack(importfn: (specifier:string) => Promise<unknown>): Module {
	const bus = new EventTarget();
	/** Bundles keyed by the name they are served under at the components endpoint. */
	let compBundle: Map<string, string> = new Map();
	/** Every emitted file keyed by its raw output filename, served at the root. */
	let rawBundle: Map<string, string> = new Map();
	let compStyles = "";
	// Claims the `/@bearmetal/components` namespace, which the router reserves.
	// The class name is what the router reports, so it is declared rather than anonymous.
	const mod = new StackComponentsModule();
	mod.onStart(async () => {
		const dir = await findComponentsDir();
		if (!dir) return;

		const { entrypoints, sideEffects, tempDir } = await resolveEntrypoints(dir);
		if (entrypoints.length === 0) return;

		// Importing the components registers their stylesheets via `@define`.
		await Promise.all(sideEffects.map(importfn));
		const componentStyles = getAllStylesheets();

		const build = async () => {
			const { scripts, styles } = await bundleEntrypoints([
				...entrypoints.map((e) => e.path),
				...pageRuntimeEntrypoints,
			]);
			rawBundle = scripts;
			compBundle = serveMap(entrypoints, scripts);
			compStyles = componentStyles ? componentStyles + "\n" + styles : styles;
		};

		await build();

		if (isDev()) {
			bus.addEventListener("modify", async () => {
				await build();
				bus.dispatchEvent(new Event("reload"));
			});
			watch(dir).catch();
		} else if (tempDir) {
			await Deno.remove(tempDir, { recursive: true });
		}
	})
		.use(async (_, next) => {
			const res = await next();
			if (res.headers && res.headers.get("Content-Type")?.startsWith("text/html")) {
				const b = await res.text();
				const updated = b.replace(/<\/head>/, headTags() + "</head>");
				return new Response(updated, res);
			}
			return res;
		});
	mod.route(`${componentsEndpoint}/:bundle`)
		.get(async (ctx, next) => {
			const s = compBundle.get(ctx.params.bundle as string);
			if (s === undefined) return await next();
			return Script(s);
		});

	// `Page()` inlines its scripts, and those scripts import their shared chunks
	// by a relative specifier that resolves to the site root. Serving every raw
	// output here is what lets those imports resolve.
	mod.route("/:script")
		.get(async (ctx, next) => {
			const s = rawBundle.get(ctx.params.script as string);
			if (s === undefined) return await next();
			return Script(s);
		});

	/**
	 * The default bundle is the only script injected. Subset bundles are opt-in
	 * via their own script tag, and shared chunks are pulled in by the entries
	 * that import them.
	 */
	function headTags(): string {
		const style = compStyles ? `<style>${compStyles}</style>` : "";
		const script = compBundle.has(defaultBundleName)
			? `<script type="module" src="${componentsEndpoint}/${defaultBundleName}"></script>`
			: "";
		return style + script;
	}

	if (isDev()) {
		mod
			.use(async (_, next) => {
				const res = await next();
				if (res.headers && res.headers.get("Content-Type")?.startsWith("text/html")) {
					const body = await res.text();
					const n = body.replace(
						/<head>/,
						html`
						    <head>
								<script>
								    const ev = new EventSource("/__event/reload")
									ev.addEventListener("reload", () => location.reload());
									ev.onerror= (e) => {
									    if (ev.readyState === EventSource.CONNECTING) {
											setTimeout(() => location.reload(), 100);
										}
									}
								</script>`,
					);
					return new Response(n, res);
				}
				return res;
			})
			.route("/__event/reload")
			.get(() => {
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
			});
	}
	async function watch(dir: string) {
		for await (const fEvent of Deno.watchFs(dir, { recursive: true })) {
			if (fEvent.kind === "modify") {
				bus.dispatchEvent(new Event("modify"));
			}
		}
	}
	return mod;
}
