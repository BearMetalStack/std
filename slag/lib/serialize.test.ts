import { assertEquals } from "@std/assert";
import { SlagDocument } from "./document.ts";
import { SVG_NAMESPACE } from "./element.ts";
import { serialize } from "./serialize.ts";

Deno.test("void elements never get a closing tag", () => {
	const document = new SlagDocument();
	const input = document.createElement("input");
	input.setAttribute("type", "text");

	assertEquals(input.toString(), '<input type="text">');
});

Deno.test("text is escaped, attribute values are escaped", () => {
	const document = new SlagDocument();
	const element = document.createElement("p");
	element.setAttribute("title", 'a "quoted" & <angled> value');
	element.textContent = "<script>alert(1)</script> & more";

	assertEquals(
		element.toString(),
		'<p title="a &quot;quoted&quot; &amp; &lt;angled&gt; value">' +
			"&lt;script&gt;alert(1)&lt;/script&gt; &amp; more</p>",
	);
});

Deno.test("valueless attributes serialize bare", () => {
	const document = new SlagDocument();
	const element = document.createElement("button");
	element.toggleAttribute("disabled", true);

	assertEquals(element.toString(), "<button disabled></button>");
});

Deno.test("script and style content is not escaped", () => {
	const document = new SlagDocument();
	const style = document.createElement("style");
	style.textContent = "a > b { content: '&'; }";

	assertEquals(style.toString(), "<style>a > b { content: '&'; }</style>");
});

Deno.test("comments and raw markup round-trip verbatim", () => {
	const document = new SlagDocument();
	const wrapper = document.createElement("div");
	wrapper.appendChild(document.createComment(" keep me "));
	wrapper.insertAdjacentHTML("beforeend", "<b>unparsed & raw</b>");

	assertEquals(wrapper.innerHTML, "<!-- keep me --><b>unparsed & raw</b>");
});

Deno.test("template children serialize from its content fragment", () => {
	const document = new SlagDocument();
	const template = document.createElement("template") as unknown as {
		content: { appendChild(node: unknown): unknown };
		toString(): string;
	};
	template.content.appendChild(document.createElement("li"));

	assertEquals(template.toString(), "<template><li></li></template>");
});

Deno.test("SVG element names keep their casing", () => {
	const document = new SlagDocument();
	const svg = document.createElementNS(SVG_NAMESPACE, "svg");
	svg.appendChild(document.createElementNS(SVG_NAMESPACE, "linearGradient"));

	assertEquals(svg.toString(), "<svg><linearGradient></linearGradient></svg>");
});

function shadowHost() {
	const document = new SlagDocument();
	const host = document.createElement("my-card");
	const shadow = host.attachShadow({ mode: "open" });

	const wrapper = document.createElement("div");
	wrapper.setAttribute("class", "card");
	const heading = document.createElement("slot");
	heading.setAttribute("name", "title");
	const fallback = document.createElement("slot");
	fallback.setAttribute("name", "missing");
	fallback.textContent = "fallback";
	wrapper.append(heading, document.createElement("slot"), fallback);
	shadow.appendChild(wrapper);

	const title = document.createElement("h2");
	title.setAttribute("slot", "title");
	title.textContent = "Title";
	const body = document.createElement("p");
	body.textContent = "Body";
	host.append(title, body);

	return host;
}

Deno.test("projected serialization renders light children through their slots", () => {
	assertEquals(
		shadowHost().toString(),
		'<my-card><div class="card">' +
			'<h2 slot="title">Title</h2>' +
			"<p>Body</p>" +
			"fallback" +
			"</div></my-card>",
	);
});

Deno.test("declarative serialization emits a shadowrootmode template", () => {
	assertEquals(
		serialize(shadowHost(), { shadow: "declarative" }),
		"<my-card>" +
			'<template shadowrootmode="open">' +
			'<div class="card"><slot name="title"></slot><slot></slot>' +
			'<slot name="missing">fallback</slot></div>' +
			"</template>" +
			'<h2 slot="title">Title</h2><p>Body</p>' +
			"</my-card>",
	);
});

Deno.test("shadow: none ignores the shadow root entirely", () => {
	assertEquals(
		serialize(shadowHost(), { shadow: "none" }),
		'<my-card><h2 slot="title">Title</h2><p>Body</p></my-card>',
	);
});

Deno.test("a document serializes its whole tree", () => {
	const document = new SlagDocument();
	document.body.appendChild(document.createElement("main"));

	assertEquals(document.toString(), "<html><head></head><body><main></main></body></html>");
});
