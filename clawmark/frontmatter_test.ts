import { assertEquals, assertThrows } from "@std/assert";
import {
	FrontmatterError,
	parseDocument,
	parseYaml,
	splitFrontmatter,
	stringifyFrontmatter,
	stringifyYaml,
	type YamlValue,
} from "./frontmatter.ts";

Deno.test("frontmatter: split off the block and parse it", () => {
	const { data, body, raw } = splitFrontmatter("---\ntitle: Hello\ncount: 3\n---\n# Body\n");
	assertEquals(data, { title: "Hello", count: 3 });
	assertEquals(body, "# Body\n");
	assertEquals(raw, "title: Hello\ncount: 3");
});

Deno.test("frontmatter: a document without one comes back whole", () => {
	assertEquals(splitFrontmatter("# Just a doc\n---\n"), {
		data: {},
		body: "# Just a doc\n---\n",
		raw: null,
	});
});

Deno.test("frontmatter: an empty block is an empty mapping", () => {
	assertEquals(splitFrontmatter("---\n---\nbody").data, {});
});

Deno.test("frontmatter: CRLF line endings", () => {
	const { data, body } = splitFrontmatter("---\r\ntitle: x\r\n---\r\nbody");
	assertEquals(data, { title: "x" });
	assertEquals(body, "body");
});

Deno.test("yaml: scalars", () => {
	assertEquals(
		parseYaml(
			[
				"s: plain text",
				'd: "double \\"quoted\\"\\n"',
				"q: 'it''s'",
				"t: true",
				"f: False",
				"n: null",
				"tilde: ~",
				"empty:",
				"int: -42",
				"float: 0.5",
				"exp: 1e3",
				"date: Oct 3, 2026",
				"version: '0.10'",
				"url: https://example.com/a#b",
				"colon: a:b",
			].join("\n"),
		),
		{
			s: "plain text",
			d: 'double "quoted"\n',
			q: "it's",
			t: true,
			f: false,
			n: null,
			tilde: null,
			empty: null,
			int: -42,
			float: 0.5,
			exp: 1000,
			date: "Oct 3, 2026",
			version: "0.10",
			url: "https://example.com/a#b",
			colon: "a:b",
		},
	);
});

Deno.test("yaml: comments are stripped outside quotes", () => {
	assertEquals(parseYaml("# lead\na: 1 # trailing\nb: 'x # kept'\n"), { a: 1, b: "x # kept" });
});

Deno.test("yaml: nested mappings and sequences", () => {
	const text = `
hero:
  name: Bramble
  actions:
    - text: Get started
      link: /learn
    - text: Reference
      link: /ref
tags:
- one
- two
matrix:
  -
    - 1
    - 2
  - [3, 4]
`;
	assertEquals(parseYaml(text), {
		hero: {
			name: "Bramble",
			actions: [{ text: "Get started", link: "/learn" }, { text: "Reference", link: "/ref" }],
		},
		tags: ["one", "two"],
		matrix: [[1, 2], [3, 4]],
	});
});

Deno.test("yaml: flow collections", () => {
	assertEquals(parseYaml(`a: [x, "y, z", [1, 2]]\nb: {k: v, n: 1, e: }\nc: []\nd: {}`), {
		a: ["x", "y, z", [1, 2]],
		b: { k: "v", n: 1, e: null },
		c: [],
		d: {},
	});
});

Deno.test("yaml: block scalars and chomping", () => {
	const text = `lit: |
  line one
    indented

  after blank
fold: >
  folded
  together

  new para
strip: |-
  no newline
keep: |+
  kept

end: 1`;
	assertEquals(parseYaml(text), {
		lit: "line one\n  indented\n\nafter blank\n",
		fold: "folded together\nnew para\n",
		strip: "no newline",
		keep: "kept\n\n",
		end: 1,
	});
});

Deno.test("yaml: errors carry the line", () => {
	const cases: [string, number][] = [
		["a: 1\n\tb: 2", 2],
		["a: 1\na: 2", 2],
		["a: &anchor 1", 1],
		["a: 1\n  b: 2", 2],
		["- a\nb: 1", 2],
		['a: "open', 1],
		["a: [1, 2", 1],
		["just text", 1],
	];
	for (const [text, line] of cases) {
		const err = assertThrows(() => parseYaml(text), FrontmatterError);
		assertEquals(err.line, line, text);
	}
});

Deno.test("frontmatter: must be a mapping", () => {
	assertThrows(() => splitFrontmatter("---\n- a\n---\n"), FrontmatterError);
});

Deno.test("yaml: stringify round-trips", () => {
	const value: Record<string, YamlValue> = {
		title: "signal()",
		quoted: "needs: quoting",
		numeric: "0.10",
		yes: "true",
		n: 3,
		flag: false,
		nothing: null,
		list: ["a", "b"],
		empty: [],
		objs: [{ text: "x", link: "/x" }, { text: "y" }],
		nested: { deeper: { k: "v" } },
		multi: "two\nlines\n",
		multiNoEnd: "two\nlines",
	};
	assertEquals(parseYaml(stringifyYaml(value)), value);
});

Deno.test("frontmatter: stringify then split is the identity", () => {
	const data = { title: "Hi", tags: ["a"] };
	const doc = stringifyFrontmatter(data, "# Body\n");
	assertEquals(splitFrontmatter(doc), { data, body: "# Body\n", raw: "title: Hi\ntags:\n  - a" });
	assertEquals(stringifyFrontmatter({}, "body"), "body");
});

Deno.test("frontmatter: parseDocument parses the body only", () => {
	const { frontmatter, tree } = parseDocument("---\ntitle: T\n---\n# Heading\n");
	assertEquals(frontmatter, { title: "T" });
	const tags: string[] = [];
	const walk = (n: typeof tree) => (tags.push(n.tag), n.children.forEach(walk));
	walk(tree);
	assertEquals(tags.includes("md:heading"), true);
	assertEquals(tags.includes("md:hr"), false);
});
