import { assert } from "@std/assert";

import { MarkdownLexer } from "@/lib/md/lexer.ts";
import { markdownToHtml } from "@lib/md/html.ts";
const testMd = await Deno.readTextFile("./tests/md/test.md");

Deno.test({
	name: "Lexer Do Thing",
	fn() {
		const lex = new MarkdownLexer(testMd);
		lex.tokenize();
		assert(true, "TEST");
	},
});

Deno.test({
	name: "HTML becomings",
	async fn() {
		const html = await markdownToHtml(testMd);
		console.log(html);
	},
});
