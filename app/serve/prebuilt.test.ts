import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { joinPath } from "@bearmetal/miscellanea";
import { Router } from "@bearmetal/router";
import { headContributions, routeHeadContributions } from "../ssr/head.ts";
import { buildApp, manifestName, serverEntryName } from "./build.ts";
import { prebuiltApp } from "./prebuilt.tsx";

async function tempTree(files: Record<string, string>): Promise<string> {
	const root = await Deno.makeTempDir();
	for (const [rel, contents] of Object.entries(files)) {
		const path = joinPath(root, rel);
		await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
		await Deno.writeTextFile(path, contents);
	}
	return root;
}

function html(nodes: unknown[]): string {
	return nodes.map((n) => (n as Element).outerHTML).join("");
}

Deno.test("a client built ahead of time is served from its directory alone", async () => {
	const project = await tempTree({
		"components/counter.ts": `globalThis.counterLoaded = "counter-module";\n`,
		"pages/users/_id.ts": `globalThis.pageLoaded = "users-page";\n`,
	});
	const outDir = joinPath(project, "dist");
	try {
		const manifest = await buildApp({
			componentsDir: joinPath(project, "components"),
			appDir: joinPath(project, "missing-app"),
			pagesDir: joinPath(project, "pages"),
			outDir,
			minify: false,
		});
		assert(manifest);
		assert(manifest.hasDefault);
		assertEquals(manifest.pageKeys, ["users/_id"]);

		const server = await Deno.readTextFile(joinPath(outDir, serverEntryName));
		assertStringIncludes(server, `import "../components/counter.ts";`);
		assert(await Deno.stat(joinPath(outDir, manifestName)));

		// Nothing left to discover: the prebuilt module reads `dist/` and only that.
		await Deno.remove(joinPath(project, "components"), { recursive: true });
		await Deno.remove(joinPath(project, "pages"), { recursive: true });

		const router = new Router().use(prebuiltApp(new URL(`file://${outDir}/`)));
		const info = {} as Deno.ServeHandlerInfo<Deno.NetAddr>;
		const res = await router.handle(
			new Request("http://localhost/@bearmetal/components/index"),
			info,
		);
		assertEquals(res.status, 200);
		const bundle = await res.text();
		assertStringIncludes(bundle, "counter-module");
		assertStringIncludes(bundle, "users-page");

		const head = html(headContributions());
		assertStringIncludes(head, `/@bearmetal/components/index?v=${manifest.version}`);
		assertEquals(
			html(routeHeadContributions("/users/:id")),
			`<meta name="bm-page" content="users/_id">`,
		);
	} finally {
		await Deno.remove(project, { recursive: true }).catch(() => {});
	}
});
