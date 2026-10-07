import { assert, assertEquals } from "@std/assert";
import { flushEffects, Signal } from "@bearmetal/app/signals";
import {
	defaultRules,
	htmlToMarkdown,
	markdownWith,
	parse,
	toHtml,
	toMarkdown,
} from "@bearmetal/clawmark";
import { docxWriter } from "@bearmetal/clawmark/profiles/docx";
import { SlagDocument } from "@bearmetal/slag";
import { bindQueries, bmqlRules, bmqlValueRule } from "./clawmark.ts";

const state = <T>(value: T) => new Signal.State(value);

function world() {
	const backstory = state("Born in the Ashen Reach.");
	const selClass = state("rogue");
	const characters = state([
		{
			name: state("Sel"),
			class: selClass,
			properties: state([{ key: "backstory", value: backstory }]),
		},
		{ name: state("Vex"), class: state("rogue"), properties: state([]) },
		{ name: state("Orrin"), class: state("cleric"), properties: state([]) },
	]);
	return { root: { characters }, characters, backstory, selClass };
}

const rulesFor = (root: unknown) => [...bmqlRules(root), ...defaultRules()];
const MOTIVATING = "{{characters{name:Sel}.properties{key:backstory}.value}}";

Deno.test("a value tag renders as a bound span", () => {
	const { root } = world();
	assertEquals(
		toHtml(`Backstory: ${MOTIVATING}`, rulesFor(root)),
		'<p>Backstory: <span data-bmql="characters{name:Sel}.properties{key:backstory}.value">' +
			"Born in the Ashen Reach.</span></p>",
	);
});

Deno.test("value tags join many values with a comma and escape their text", () => {
	const root = { names: ["Sel", "<Vex>"] };
	assertEquals(
		toHtml("{{names}}", rulesFor(root)),
		'<p><span data-bmql="names">Sel, &lt;Vex&gt;</span></p>',
	);
	assertEquals(
		toHtml(`{{names >> " & "}}`, rulesFor(root)),
		'<p><span data-bmql="names &gt;&gt; &quot; &amp; &quot;">Sel &amp; &lt;Vex&gt;</span></p>',
	);
});

Deno.test("an empty result renders an empty span", () => {
	assertEquals(toHtml("{{nothing}}", rulesFor({})), '<p><span data-bmql="nothing"></span></p>');
});

Deno.test("html -> md restores the tag", () => {
	const { root } = world();
	const html = toHtml(`Backstory: ${MOTIVATING}`, rulesFor(root));
	assertEquals(
		htmlToMarkdown(html, { rules: [bmqlValueRule(root)] }).trim(),
		`Backstory: ${MOTIVATING}`,
	);
});

Deno.test("md -> md keeps the tag", () => {
	const { root } = world();
	const rules = rulesFor(root);
	const tree = parse(`a ${MOTIVATING} b`, rules);
	assertEquals(tree.children[0].children[1].tag, "bmql:value");
	assertEquals(toMarkdown(tree, rules).trim(), `a ${MOTIVATING} b`);
});

Deno.test("docx gets the value as text", () => {
	const { root } = world();
	const out = markdownWith(`Backstory: ${MOTIVATING}`, docxWriter(), rulesFor(root));
	assert(out.parts["word/document.xml"].includes("Born in the Ashen Reach."));
});

Deno.test("a template under a table header becomes rows of that table", () => {
	const { root } = world();
	const html = toHtml(
		"| Name | Class |\n|------|-------|\n{{characters{class:rogue} >> | $.name | $.class |}}",
		rulesFor(root),
	);
	assertEquals((html.match(/<tr>/g) ?? []).length, 3);
	assert(/>Sel<\/td>/.test(html) && />Vex<\/td>/.test(html));
	assert(!html.includes("Orrin"));
});

Deno.test("an inline template joins with a comma and its output is markup", () => {
	const root = { names: ["Sel", "Vex"] };
	assertEquals(
		toHtml("Party: {{names >> **$**}}.", rulesFor(root)),
		"<p>Party: <strong>Sel</strong>, <strong>Vex</strong>.</p>",
	);
});

Deno.test("\\{{ is a literal, in both stages", () => {
	const root = { a: "x" };
	assertEquals(
		toHtml("\\{{a}} and \\{{a >> $}}", rulesFor(root)),
		"<p>{{a}} and {{a &gt;&gt; $}}</p>",
	);
});

Deno.test("tags inside code are left alone", () => {
	const root = { a: "x" };
	assertEquals(
		toHtml("`{{a >> $}}` `{{a}}`", rulesFor(root)),
		"<p><code>{{a &gt;&gt; $}}</code> <code>{{a}}</code></p>",
	);
	const fenced = toHtml("```\n{{a >> $}}\n```", rulesFor(root));
	assert(fenced.includes("{{a &gt;&gt; $}}"), fenced);
});

Deno.test("malformed tags stay literal text", () => {
	assertEquals(toHtml("{{a{}} {{b", rulesFor({ a: 1 })), "<p>{{a{}} {{b</p>");
});

Deno.test("rendering in a Computed follows templates, not values", () => {
	const w = world();
	const rules = rulesFor(w.root);
	let renders = 0;
	const html = new Signal.Computed(() => {
		renders++;
		return toHtml(
			`${MOTIVATING}\n\n{{characters{class:rogue} >> - $.name}}`,
			rules,
		);
	});
	html.get();
	assertEquals(renders, 1);

	w.backstory.set("Raised by wolves.");
	html.get();
	assertEquals(renders, 1, "a value tag's change is bindQueries' job");

	w.selClass.set("bard");
	assert(!html.get().includes(">Sel<"), "the template re-ran");
	assertEquals(renders, 2);
});

Deno.test("bindQueries keeps spans live and stops on cleanup", () => {
	const w = world();
	const document = new SlagDocument();
	const container = document.createElement("div");
	const span = document.createElement("span");
	span.setAttribute("data-bmql", "characters{name:Sel}.properties{key:backstory}.value");
	const broken = document.createElement("span");
	broken.setAttribute("data-bmql", "a{");
	broken.textContent = "untouched";
	container.append(span, broken);

	const stop = bindQueries(container as unknown as ParentNode, w.root);
	assertEquals(span.textContent, "Born in the Ashen Reach.");
	assertEquals(broken.textContent, "untouched");

	w.backstory.set("Raised by wolves.");
	flushEffects();
	assertEquals(span.textContent, "Raised by wolves.");

	stop();
	w.backstory.set("Never mind.");
	flushEffects();
	assertEquals(span.textContent, "Raised by wolves.");
});
