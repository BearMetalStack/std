import { assertEquals } from "@std/assert";
import { rewriteSpecifiers, specifiers } from "./graph.ts";

Deno.test("specifiers finds static, side-effect, re-export and dynamic imports", () => {
	const code = [
		`import { a } from "./a.ts";`,
		`import "./side.css";`,
		`export * from '@scope/pkg';`,
		`const lazy = () => import("./lazy.ts");`,
		`const m = await import ( './spaced.ts' );`,
	].join("\n");
	assertEquals([...specifiers(code)], [
		"./a.ts",
		"./side.css",
		"@scope/pkg",
		"./lazy.ts",
		"./spaced.ts",
	]);
});

Deno.test("specifiers ignores import and from inside strings, comments and property access", () => {
	const code = [
		`const caps = ["doc.import", "doc.export"];`,
		`log("we import 'x' here");`,
		`// import "./commented.ts"`,
		`/* from "./block.ts" */`,
		'const t = `import "./template.ts"`;',
		`const chars = Array.from("abc");`,
		`const re = /import "x"/;`,
		`import { real } from "./real.ts";`,
	].join("\n");
	assertEquals([...specifiers(code)], ["./real.ts"]);
});

Deno.test("rewriteSpecifiers rewrites only real specifiers", () => {
	const code = `const s = "doc.import"; import a from "./a.css"; const b = "./a.css";`;
	assertEquals(
		rewriteSpecifiers(code, (s) => s.endsWith(".css") ? `${s}?css` : s),
		`const s = "doc.import"; import a from "./a.css?css"; const b = "./a.css";`,
	);
});
