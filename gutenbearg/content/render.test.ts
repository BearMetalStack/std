import { assert, assertStringIncludes } from "@std/assert";
import { renderToString } from "@bearmetal/app/ssr";
import { loadContent } from "./load.ts";
import { fixture } from "./fixture_test_util.ts";

const SOURCE = `---
title: Everything
---

Intro with **bold [[signal]]** and <Badge type="warn" text="careful"/>.

## Section one

::: tip Reads are *subscriptions*
Body of the tip.
:::

::: steps
### Install
::: code-group
\`\`\`sh [deno]
deno add x
\`\`\`
\`\`\`sh [npm]
npm i x
\`\`\`
:::
### Use
Some text.
\`\`\`ts [app.ts]
const a = 1;
\`\`\`
:::

\`\`\`signature [src/x.ts]
function x(): void
\`\`\`

\`\`\`diagram
a -[go]-> b -> c
\`\`\`

| Name | Type |
| --- | --- |
| \`a\` | string |

::: features
- lightning | Fast | Runs \`fast\`.
:::

::: details Custom kind
inside
:::
`;

async function render(): Promise<string> {
	const dir = await fixture({
		"index.md": "---\nsite:\n  sourceBase: https://src.example/\n---\n",
		"glossary/signal.md": "---\nterm: Signal\n---\nA value.",
		"guides/0000-g/0000-everything.md": SOURCE,
	});
	const c = await loadContent(dir);
	const t = c.routes.get("guides/g/everything");
	if (t?.kind !== "page") throw new Error("missing page");
	return await renderToString(() => t.page.body());
}

Deno.test("render: every block maps to its component", async () => {
	const html = await render();
	assertStringIncludes(html, '<strong>bold <span class="gb-term" data-term="signal"');
	assertStringIncludes(html, '<span class="tag warn gb-badge">careful</span>');
	assertStringIncludes(html, '<h2 id="section-one" data-text="Section one">');
	assertStringIncludes(html, '<aside class="gb-callout sq tip"');
	assertStringIncludes(html, "<em>subscriptions</em>");
	assertStringIncludes(html, '<ol class="gb-steps"');
	assertStringIncludes(html, 'data-text="Install"');
	assertStringIncludes(html, 'data-gb-tab="npm"');
	assertStringIncludes(html, '<span class="gb-file">');
	assertStringIncludes(html, 'href="https://src.example/src/x.ts"');
	assertStringIncludes(html, "<em>go</em>");
	assertStringIncludes(html, '<div class="gb-table sq"');
	assertStringIncludes(html, '<div class="gb-features">');
	assertStringIncludes(html, "<h3>Fast</h3>");
	assertStringIncludes(html, "<code>fast</code>");
	assertStringIncludes(html, '<div class="gb-container details">');
	assert(!html.includes("<p></p>"), "no empty paragraphs");
});
