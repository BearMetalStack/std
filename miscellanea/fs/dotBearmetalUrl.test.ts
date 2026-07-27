import { assertEquals } from "@std/assert";
import {
	dotBearmetalDirUrl,
	dotBearmetalFileUrl,
	dotBearmetalRoots,
	dotBearmetalUrl,
} from "./dotBearmetalUrl.ts";

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

// The repo this test runs in has its own .bearmetal, so the cwd walk has to be
// off for the base-anchored cases to be the thing under test.
function from(root: string, relPath: string) {
	return { base: moduleUrl(root, relPath), searchCwd: false };
}

Deno.test("dotBearmetalUrl finds .bearmetal in an ancestor directory", async () => {
	const root = await makeTree({
		".bearmetal/drip/config.json": "{}",
		"src/deep": null,
	});
	try {
		const url = await dotBearmetalUrl("drip", from(root, "src/deep/mod.ts"));
		assertEquals(url?.pathname, `${root}/.bearmetal/drip/`);
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
		const url = await dotBearmetalUrl("drip", from(root, "bearmetal/drip/mod.ts"));
		assertEquals(url?.pathname, `${root}/app/.bearmetal/drip/`);
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
			"drip",
			from(root, "deno-compile-myapp/vendor/pkg/mod.ts"),
		);
		assertEquals(url?.pathname, `${root}/deno-compile-myapp/app/.bearmetal/drip/`);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("dotBearmetalUrl prefers the deepest .bearmetal on the walk up", async () => {
	const root = await makeTree({
		".bearmetal/drip": null,
		"pkg/.bearmetal/drip": null,
		"pkg/src": null,
	});
	try {
		const url = await dotBearmetalUrl("drip", from(root, "pkg/src/mod.ts"));
		assertEquals(url?.pathname, `${root}/pkg/.bearmetal/drip/`);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("dotBearmetalUrl joins array namespaces into nested segments", async () => {
	const root = await makeTree({ ".bearmetal": null });
	try {
		const url = await dotBearmetalUrl(["drip", "themes"], from(root, "mod.ts"));
		assertEquals(url?.pathname, `${root}/.bearmetal/drip/themes/`);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("a remote base contributes no root", async () => {
	// a package compiled in as a jsr:/https: dependency keeps a remote
	// import.meta.url, which is in no embedded file system
	const roots = await dotBearmetalRoots({
		base: "https://jsr.io/@bearmetal/drip/1.0.0/theme.ts",
		searchCwd: false,
	});
	assertEquals(roots.filter((r) => r.protocol !== "file:"), []);
});

Deno.test("dotBearmetalUrl returns null when no root is reachable", async () => {
	const root = await makeTree({ "src/deep": null });
	try {
		assertEquals(await dotBearmetalUrl("drip", from(root, "src/deep/mod.ts")), null);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("dotBearmetalFileUrl reads text and json, undefined/empty when missing", async () => {
	const root = await makeTree({
		".bearmetal/drip/config.json": '{"defaultTheme":"bearmetal"}',
	});
	try {
		const opts = from(root, "mod.ts");
		const file = await dotBearmetalFileUrl("drip", "config.json", opts);
		assertEquals(file.url?.pathname, `${root}/.bearmetal/drip/config.json`);
		assertEquals(await file.read(), '{"defaultTheme":"bearmetal"}');
		assertEquals(await file.readJson(), { defaultTheme: "bearmetal" });

		const missing = await dotBearmetalFileUrl("drip", "nope.json", opts);
		assertEquals(await missing.read(), undefined);
		assertEquals(await missing.readJson(), {});
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("dotBearmetalFileUrl fails soft when there is no .bearmetal at all", async () => {
	const root = await makeTree({ "src": null });
	try {
		const file = await dotBearmetalFileUrl("drip", "config.json", from(root, "src/mod.ts"));
		assertEquals(file.url, null);
		assertEquals(await file.read(), undefined);
		assertEquals(await file.readJson(), {});
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
		const opts = from(root, "mod.ts");
		const dir = await dotBearmetalDirUrl(["drip", "themes"], opts);
		const entries = await dir.read();
		assertEquals(entries?.map((e) => e.name).sort(), ["a.theme.json", "b.theme.json"]);

		const missing = await dotBearmetalDirUrl(["drip", "nope"], opts);
		assertEquals(await missing.read(), undefined);
	} finally {
		await Deno.remove(root, { recursive: true });
	}
});

Deno.test("the cwd root takes precedence over an embedded one", async () => {
	const project = await makeTree({ ".bearmetal/drip/config.json": '{"defaultTheme":"project"}' });
	const embedded = await makeTree({
		"deno-compile-app/app/.bearmetal/drip/config.json": '{"defaultTheme":"embedded"}',
	});
	const cwd = Deno.cwd();
	try {
		Deno.chdir(project);
		const file = await dotBearmetalFileUrl<{ defaultTheme: string }>("drip", "config.json", {
			base: moduleUrl(embedded, "deno-compile-app/pkg/mod.ts"),
		});
		assertEquals((await file.readJson()).defaultTheme, "project");
	} finally {
		Deno.chdir(cwd);
		await Deno.remove(project, { recursive: true });
		await Deno.remove(embedded, { recursive: true });
	}
});

Deno.test("an embedded root fills in files the cwd root lacks", async () => {
	const project = await makeTree({ ".bearmetal/drip/themes/mine.theme.json": "{}" });
	const embedded = await makeTree({
		"deno-compile-app/app/.bearmetal/drip/config.json": '{"defaultTheme":"embedded"}',
	});
	const cwd = Deno.cwd();
	try {
		Deno.chdir(project);
		const file = await dotBearmetalFileUrl<{ defaultTheme: string }>("drip", "config.json", {
			base: moduleUrl(embedded, "deno-compile-app/pkg/mod.ts"),
		});
		assertEquals((await file.readJson()).defaultTheme, "embedded");
	} finally {
		Deno.chdir(cwd);
		await Deno.remove(project, { recursive: true });
		await Deno.remove(embedded, { recursive: true });
	}
});
