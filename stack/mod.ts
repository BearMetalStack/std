import { buildBundle } from "@bearmetal/app/ssr";
import { Module, NotFound, Script, Style } from "@bearmetal/router";
import { walkDir } from "@bearmetal/miscellanea/fs";
import { isDev } from "@bearmetal/miscellanea/environment";
import { html } from "@bearmetal/miscellanea";

const scriptFiles = ["js", "ts", "jsx", "tsx"];
export function createStack(): Module {
	const bus = new EventTarget();
	let compBundle = "";
	let compStyles = "";
	const mod = new Module();
	mod.onStart(async () => {
		const modules = new Set<string>();
		for await (const m of walkDir("components")) {
			if (m.isFile && scriptFiles.includes(m.name.split(".").pop()!)) {
				modules.add("file://" + await Deno.realPath(m.path));
			}
		}

		[compBundle, compStyles] = await buildBundle(modules.values().toArray());
		if (isDev()) {
			bus.addEventListener("modify", async () => {
				[compBundle, compStyles] = await buildBundle(modules.values().toArray());
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
						compStyles ? `<link rel="stylesheet" href="/styles/components.css">` : ""
					}<script type="module" src="/scripts/components.js"></script></head>`,
				);
				return new Response(updated, res);
			}
			return res;
		});
	mod.route("/scripts/components.js")
		.get(() => Script(compBundle));
	mod.route("/styles/components.css")
		.get(() => compStyles ? Style(compStyles) : NotFound());

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
									        console.log("server reset")
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
