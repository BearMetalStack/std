import { assertEquals } from "@std/assert";
import { dotBearmetalDirUrl, dotBearmetalFileUrl, dotBearmetalUrl } from "./dotBearmetalUrl.ts";

async function makeTree(paths: Record<string, string | null>): Promise<string> {
	const root = await Deno.makeTempDir({ prefix: "dot_bearmetal_url_test" });
	for (const [path, content] of Object.entries(paths)) {
		const full = `${root}/${path}`;
		if (content === null) {
			await Deno.mkdir(full, { recursive: true });
		} else {
			await Deno.mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
			await Deno.writeTextFile(full, content);
		}
	}
	return root;
}

function moduleUrl(root: string, relPath: string): URL {
	return new URL(`file://${root}/${relPath}`);
}

Deno.test("dotBearmetalUrl finds .bearmetal in an ancestor directory", async () => {
	const root = await makeTree({
		".bearmetal/drip/config.json": "{}",
		"src/deep": null,
	});
	try {
		const url = await dotBearmetalUrl(moduleUrl(root, "src/deep/mod.ts"), "drip");
		assertEquals(url.pathname, `${root}/.bearmetal/drip/`);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("dotBearmetalUrl finds .bearmetal in a sibling branch of the bearmetal package", async () => {
	// compiled-binary layout: the package lives in a `bearmetal` subdirectory
	// and .bearmetal lives in a directory next to it, not in an ancestor
	const root = await makeTree({
		"bearmetal/drip": null,
		"app/.bearmetal/drip/config.json": "{}",
	});
	try {
		const url = await dotBearmetalUrl(moduleUrl(root, "bearmetal/drip/mod.ts"), "drip");
		assertEquals(url.pathname, `${root}/app/.bearmetal/drip/`);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("dotBearmetalUrl scans siblings at a deno-compile virtual root", async () => {
	const root = await makeTree({
		"deno-compile-myapp/vendor/pkg": null,
		"deno-compile-myapp/app/.bearmetal/drip": null,
	});
	try {
		const url = await dotBearmetalUrl(
			moduleUrl(root, "deno-compile-myapp/vendor/pkg/mod.ts"),
			"drip",
		);
		assertEquals(url.pathname, `${root}/deno-compile-myapp/app/.bearmetal/drip/`);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("dotBearmetalUrl prefers the deepest .bearmetal on the walk up", async () => {
	const root = await makeTree({
		".bearmetal": null,
		"pkg/.bearmetal": null,
		"pkg/src": null,
	});
	try {
		const url = await dotBearmetalUrl(moduleUrl(root, "pkg/src/mod.ts"), "drip");
		assertEquals(url.pathname, `${root}/pkg/.bearmetal/drip/`);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("dotBearmetalUrl joins array namespaces into nested segments", async () => {
	const root = await makeTree({ ".bearmetal": null });
	try {
		const url = await dotBearmetalUrl(moduleUrl(root, "mod.ts"), ["drip", "themes"]);
		assertEquals(url.pathname, `${root}/.bearmetal/drip/themes/`);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("dotBearmetalFileUrl reads text and json, undefined/empty when missing", async () => {
	const root = await makeTree({
		".bearmetal/drip/config.json": '{"defaultTheme":"bearmetal"}',
	});
	try {
		const base = moduleUrl(root, "mod.ts");
		const file = await dotBearmetalFileUrl(base, "drip", "config.json");
		assertEquals(file.url.pathname, `${root}/.bearmetal/drip/config.json`);
		assertEquals(await file.read(), '{"defaultTheme":"bearmetal"}');
		assertEquals(await file.readJson(), { defaultTheme: "bearmetal" });

		const missing = await dotBearmetalFileUrl(base, "drip", "nope.json");
		assertEquals(await missing.read(), undefined);
		assertEquals(await missing.readJson(), {});
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("dotBearmetalDirUrl lists entries, undefined when missing", async () => {
	const root = await makeTree({
		".bearmetal/drip/themes/a.theme.json": "{}",
		".bearmetal/drip/themes/b.theme.json": "{}",
	});
	try {
		const base = moduleUrl(root, "mod.ts");
		const dir = await dotBearmetalDirUrl(base, ["drip", "themes"]);
		const entries = await dir.read();
		assertEquals(entries?.map((e) => e.name).sort(), ["a.theme.json", "b.theme.json"]);

		const missing = await dotBearmetalDirUrl(base, ["drip", "nope"]);
		assertEquals(await missing.read(), undefined);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});
