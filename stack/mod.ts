import { buildBundle } from "@bearmetal/app/ssr";
import { getAllStylesheets } from "@bearmetal/app";
import { Module, Script } from "@bearmetal/router";
import { walkDir } from "@bearmetal/miscellanea/fs";
import { isDev } from "@bearmetal/miscellanea/environment";
import { html } from "@bearmetal/miscellanea";

export * from "./optimization/fonts/google.tsx"

const scriptFiles = ["js", "ts", "jsx", "tsx"];
export function createStack(): Module {
	const bus = new EventTarget();
	let compBundle: Map<string, string> = new Map();
	let compStyles = "";
	const mod = new Module();
	mod.onStart(async () => {
		const modules = new Set<string>();
		for await (const m of walkDir("components")) {
			if (m.isFile && scriptFiles.includes(m.name.split(".").pop()!)) {
				const realPath = await Deno.realPath(m.path);
				modules.add("file://" + realPath);
				await import("file://" + realPath);
			}
		}

		const componentStyles = getAllStylesheets();
		[compBundle, compStyles] = await buildBundle(modules.values().toArray());
		if (componentStyles) compStyles = componentStyles + "\n" + compStyles;
		if (isDev()) {
			bus.addEventListener("modify", async () => {
				[compBundle, compStyles] = await buildBundle(modules.values().toArray());
				if (componentStyles) compStyles = componentStyles + "\n" + compStyles;
				bus.dispatchEvent(new Event("reload"));
			});
			watch().catch();
		}
	})
		.use(async (_, next) => {
			const res = await next();
			if (res.headers && res.headers.get("Content-Type")?.startsWith("text/html")) {
				const b = await res.text();
				const updated = b.replace(
					/<\/head>/,
					`${
						compStyles ? `<style>${compStyles}</style>` : ""
					}${compBundle.keys().filter((k) => !k.match(/-.*\.js/)).map((s) => `<script type="module" src="/${s}"></script>`).toArray().join("")}</head>`,
				);
				return new Response(updated, res);
			}
			return res;
		});
	mod.route("/:script")
		.get(async (ctx, next) => {
		    const s = compBundle.get(ctx.params.script as string)
			if (s === undefined) return await next();
		    const r = Script(s)
			return r;
		});

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
	async function watch() {
		for await (const fEvent of Deno.watchFs("components", { recursive: true })) {
			if (fEvent.kind === "modify") {
				bus.dispatchEvent(new Event("modify"));
			}
		}
	}
	return mod;
}
