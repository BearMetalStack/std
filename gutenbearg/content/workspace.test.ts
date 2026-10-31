import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { docsVersion, findWorkspace, fitsScheme, linkPackage } from "./workspace.ts";
import { loadContent } from "./load.ts";
import { fixture } from "./fixture_test_util.ts";

const repo = () =>
	fixture({
		"deno.json": JSON.stringify({ workspace: ["./*"] }),
		"router/deno.json": JSON.stringify({ name: "@x/router", version: "0.3.2" }),
		"odd-dir/deno.json": JSON.stringify({ name: "@x/core", version: "1.0.0-beta.2" }),
		"tools/deno.json": JSON.stringify({ name: "tools" }),
		"docs/.bearmetal/gutenbearg/packages/router/0.3/0000-learn/0000-a.md": "# A",
		"docs/.bearmetal/gutenbearg/packages/odd-dir/index.md": '---\npackage: "@x/core"\n---\n',
		"docs/.bearmetal/gutenbearg/packages/odd-dir/1.0/0000-learn/0000-a.md": "# A",
	});

Deno.test("workspace: found by walking up, members by glob", async () => {
	const root = await repo();
	const ws = await findWorkspace(join(root, "docs/.bearmetal/gutenbearg"));
	assertEquals(ws?.root, root);
	assertEquals(ws?.members.map((m) => m.name).sort(), ["@x/core", "@x/router", "tools"]);
	assertEquals(linkPackage(ws, "router")?.version, "0.3.2");
	assertEquals(linkPackage(ws, "tools")?.name, "tools");
	assertEquals(linkPackage(ws, "odd-dir")?.name, "@x/core");
	assertEquals(linkPackage(ws, "core", "@x/router")?.name, "@x/router");
	assertEquals(linkPackage(ws, "nope"), undefined);
	assertEquals(linkPackage(null, "router"), undefined);
});

Deno.test("workspace: loaded packages carry their source", async () => {
	const root = await repo();
	const c = await loadContent(join(root, "docs/.bearmetal/gutenbearg"));
	const byId = Object.fromEntries(c.packages.map((p) => [p.id, p]));
	assertEquals(byId.router.name, "@x/router");
	assertEquals(byId.router.source?.version, "0.3.2");
	assertEquals(byId["odd-dir"].name, "@x/core");
	assertEquals(c.diagnostics, []);
});

Deno.test("workspace: version schemes", () => {
	assertEquals(docsVersion("0.3.2"), "0.3");
	assertEquals(docsVersion("v1.10.0-beta.1"), "1.10");
	assertEquals(docsVersion("1.2.3", "major"), "1");
	assertEquals(docsVersion("1.2.3-dev.4", "exact"), "1.2.3-dev.4");
	assertEquals(fitsScheme("0.3"), true);
	assertEquals(fitsScheme("0.3.2"), false);
	assertEquals(fitsScheme("2", "major"), true);
	assertEquals(fitsScheme("1.2.3-dev.1", "exact"), true);
});
