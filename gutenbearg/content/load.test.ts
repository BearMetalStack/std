import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { renderToString } from "@bearmetal/app/ssr";
import { loadContent } from "./load.ts";
import { fixture } from "./fixture_test_util.ts";
import type { SiteContent } from "../types.ts";

const routes = (c: SiteContent) => [...c.routes.keys()].sort();
const pages = (c: SiteContent, pkg: string) =>
	c.packages.find((p) => p.id === pkg)!.versions.map((v) =>
		`${v.version}: ` +
		v.sections.map((s) => `${s.slug}[${s.pages.map((p) => `${p.slug}@${p.addedIn}`).join(",")}]`)
			.join(" ")
	);

Deno.test("load: versions inherit, override and tombstone", async () => {
	const dir = await fixture({
		"packages/core/0.8/0000-[book-open]-learn/0000-intro.md": "# Intro 0.8",
		"packages/core/0.8/0016-reference/0000-old.md": "# Old",
		"packages/core/0.8/0016-reference/0016-signal.md": "# Signal 0.8",
		"packages/core/0.9/0016-reference/0000-old.md": "---\nremoved: true\n---\n",
		"packages/core/0.9/0016-reference/0016-signal.md": "# Signal 0.9",
		"packages/core/0.9/0016-reference/0032-computed.md": "# Computed",
		"packages/core/0.10/0016-reference/0008-batch.md": "# Batch",
	});
	const c = await loadContent(dir);
	assertEquals(pages(c, "core"), [
		"0.10: learn[intro@0.8] reference[batch@0.10,signal@0.8,computed@0.9]",
		"0.9: learn[intro@0.8] reference[signal@0.8,computed@0.9]",
		"0.8: learn[intro@0.8] reference[old@0.8,signal@0.8]",
	]);
	const latest = c.packages[0].versions[0];
	assertEquals(latest.base, "core");
	assertEquals(latest.sections[0].icon, "book-open");
	const v09 = c.packages[0].versions[1];
	assertEquals(v09.base, "core/v0.9");
	const signal = v09.sections[1].pages[0];
	assertEquals(signal.title, "Signal 0.9");
	assertEquals(signal.route, "core/v0.9/reference/signal");
	assert(c.routes.has("core/reference/batch"));
	assert(!c.routes.has("core/v0.9/reference/old"));
	assert(c.routes.has("core/v0.8/reference/old"));
	assertEquals(c.diagnostics, []);
});

Deno.test("load: unversioned packages, guides, changelog and home", async () => {
	const dir = await fixture({
		"index.md":
			"---\nsite:\n  name: Test\n  layout: den\nname: Big\nprimary:\n  label: Go\n  href: guides/0000-start/0000-one.md\n---\nHello",
		"guides/0000-[rocket]-start/0000-one.md": "# One",
		"guides/0000-[rocket]-start/0016-two.md": "---\ntitle: Second\n---\nBody",
		"packages/cli/index.md": '---\nname: "@x/cli"\nstatus: alpha\n---\n',
		"packages/cli/0000-commands/0000-dev.md": "# dev",
		"packages/cli/changelog/1.0.0.md":
			"---\ndate: Oct 2, 2026\n---\n- added: `dev` command\n- fixed: crash\n- whatever",
		"packages/cli/changelog/1.1.0.md": "---\ndate: Oct 9, 2026\n---\n- breaking: renamed",
	});
	const c = await loadContent(dir);
	assertEquals(c.site.name, "Test");
	assertEquals(c.site.layout, "den");
	assertEquals(c.home.frontmatter.name, "Big");
	assertEquals(c.home.frontmatter.primary, { label: "Go", href: "/guides/start/one" });
	assertEquals(routes(c), [
		"",
		"changelog",
		"cli/changelog",
		"cli/commands/dev",
		"guides/start/one",
		"guides/start/two",
	]);
	assertEquals(c.guides[0].pages.map((p) => p.title), ["One", "Second"]);
	assertEquals(c.packages[0].name, "@x/cli");
	assertEquals(c.packages[0].status, "alpha");
	assertEquals(c.releases.map((r) => r.version), ["1.1.0", "1.0.0"]);
	assertEquals(c.releases[1].changes.map((ch) => ch.type), ["added", "fixed", "changed"]);
	assertEquals(c.diagnostics.map((d) => d.message), [
		'a change has no type (added, changed, fixed, deprecated, breaking); reading it as "changed"',
	]);
});

Deno.test("load: links resolve by slug and follow the version being read", async () => {
	const dir = await fixture({
		"packages/core/0.8/0000-learn/0000-intro.md":
			"See [signal](../0016-[brackets-curly]-reference/0000-signal.md#returns) and [[signal]].",
		"packages/core/0.8/0016-[brackets-curly]-reference/0000-signal.md": "# Signal",
		"packages/core/0.9/0016-[brackets-curly]-reference/0000-signal.md": "# Signal 0.9",
		"guides/0000-start/0000-one.md":
			"[core intro](../../packages/core/0.8/0000-learn/0000-intro.md) and [nowhere](./missing.md)",
	});
	const c = await loadContent(dir);
	const html = async (route: string) => {
		const t = c.routes.get(route);
		if (t?.kind !== "page") throw new Error(route);
		return await renderToString(() => t.page.body());
	};
	assertStringIncludes(await html("core/learn/intro"), 'href="/core/reference/signal#returns"');
	assertStringIncludes(
		await html("core/v0.8/learn/intro"),
		'href="/core/v0.8/reference/signal#returns"',
	);
	assertStringIncludes(
		await html("core/v0.8/learn/intro"),
		'href="/core/v0.8/reference/signal">signal</a>',
	);
	assertStringIncludes(await html("guides/start/one"), 'href="/core/learn/intro"');
	assertEquals(c.diagnostics, [{
		level: "warn",
		file: "guides/0000-start/0000-one.md",
		message: 'link "./missing.md" leads nowhere',
	}]);
});

Deno.test("load: problems become diagnostics, not exceptions", async () => {
	const dir = await fixture({
		"guides/0000-start/0000-one.md": "# One",
		"guides/0000-start/0016-one.md": "# Dup",
		"guides/0000-start/loose.md": "# Loose",
		"guides/0000-start/0032-bad.md": "---\ntitle: [unclosed\n---\n",
		"packages/core/0.9/0000-a/0000-x.md": "# X",
		"packages/core/stray/0000-y.md": "# Y",
	});
	const c = await loadContent(dir);
	const messages = c.diagnostics.map((d) => `${d.level} ${d.file}: ${d.message.split(":")[0]}`);
	assertEquals(messages.sort(), [
		'error guides/0000-start/0016-one.md: another page in this section is also "one"',
		"error guides/0000-start/0032-bad.md: frontmatter line 1",
		"warn guides/0000-start/loose.md: has no order prefix (0000-); it sorts after the numbered entries",
		"warn packages/core/stray: is not a version; sections belong inside a version directory",
	]);
	assertEquals(c.guides[0].pages.map((p) => p.slug), ["one", "loose"]);
});

Deno.test("load: the parse cache notices edits", async () => {
	const dir = await fixture({ "guides/0000-s/0000-p.md": "# First" });
	const { ContentLoader } = await import("./load.ts");
	const loader = new ContentLoader(dir);
	assertEquals((await loader.load()).guides[0].pages[0].title, "First");
	await new Promise((r) => setTimeout(r, 20));
	await Deno.writeTextFile(`${dir}/guides/0000-s/0000-p.md`, "# Second");
	const later = new Date(Date.now() + 5000);
	await Deno.utime(`${dir}/guides/0000-s/0000-p.md`, later, later);
	assertEquals((await loader.load()).guides[0].pages[0].title, "Second");
});
