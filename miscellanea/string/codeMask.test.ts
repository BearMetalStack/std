import { assertEquals } from "@std/assert";
import { codeMask, codeMatches } from "./codeMask.ts";

Deno.test("codeMask separates code from strings, comments and regexes", () => {
	const src = `a("b") // c\nd = /e/g; \`f\${g}h\``;
	const mask = codeMask(src);
	const code = [...src].filter((_, i) => mask[i] === 0).join("");
	assertEquals(code, "a() \nd = ; g");
});

Deno.test("codeMatches yields only matches that start in code", () => {
	const src = `import x from "y"; const s = "doc.import"; // import`;
	assertEquals([...codeMatches(src, /import/g)].map((m) => m.index), [0]);
});
