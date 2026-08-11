import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { scanMask, stripServerCode } from "./stripServer.ts";

const names = ["serverInit", "stylesheet"];

function inCode(src: string, needle: string): boolean {
	const mask = scanMask(src);
	const i = src.indexOf(needle);
	assert(i >= 0, `"${needle}" not in source`);
	return !mask[i];
}

Deno.test("empties a class method body and keeps the signature", () => {
	const out = stripServerCode(
		`class A {
	async serverInit() {
		this.rows.set(await db.query("select 1"));
	}
}`,
		{ names },
	);
	assertStringIncludes(out, "async serverInit() {}");
	assert(!out.includes("db.query"));
});

Deno.test("strips a minified class method, which is preceded by }", () => {
	const src =
		`class A extends B{init(){this.x=1}async serverInit(){this.u.set(await q("secret"))}}`;
	const out = stripServerCode(src, { names });
	assertEquals(out, `class A extends B{init(){this.x=1}async serverInit(){}}`);
});

Deno.test("leaves a call site to the method alone", () => {
	const src = `class A{serverInit(){go()}}\nconst t=untrack(()=>this.serverInit());`;
	const out = stripServerCode(src, { names });
	assertStringIncludes(out, "this.serverInit()");
	assert(!out.includes("go()"));
});

Deno.test("a regex literal containing a quote does not desync the scanner", () => {
	// The bug this covers: the old scanner read the ' inside /['"]/ as opening a
	// string, so everything after it looked like string content and no later
	// definition was ever stripped.
	const src =
		`const rx=/['"]/g;\nclass A{async serverInit(){this.u.set(await q("secret"))}}\nclass B{serverInit(){leak()}}`;
	const out = stripServerCode(src, { names });
	assert(!out.includes("secret"), "first body survived");
	assert(!out.includes("leak()"), "second body survived");
});

Deno.test("division is not mistaken for a regex", () => {
	const src = `const r=(a+b)/2;const s=c/d;\nclass A{serverInit(){leak()}}`;
	const out = stripServerCode(src, { names });
	assert(!out.includes("leak()"));
	assertStringIncludes(out, "const r=(a+b)/2;");
});

Deno.test("a method name inside a string is not a definition", () => {
	const src = `const msg="serverInit() {\\n  never touched\\n}";\nclass A{serverInit(){go()}}`;
	const out = stripServerCode(src, { names });
	assertStringIncludes(out, "never touched");
	assert(!out.includes("go()"));
});

Deno.test("a method name inside a comment is not a definition", () => {
	const src = `/* serverInit() { doc } */\nclass A{serverInit(){go()}}`;
	const out = stripServerCode(src, { names });
	assertStringIncludes(out, "serverInit() { doc }");
	assert(!out.includes("go()"));
});

Deno.test("template literals mask their text but not their interpolations", () => {
	const src = "const a=`x ${y.serverInit} z`; const b = 1;";
	assert(!inCode(src, "x $"), "template text should be masked");
	assert(inCode(src, "y.serverInit"), "interpolation should be code");
	assert(inCode(src, "const b"), "code after the template should be code");
});

Deno.test("nested template literals are tracked", () => {
	const src = "const a=`p ${ `q ${ r } s` } t`; class A{serverInit(){go()}}";
	const out = stripServerCode(src, { names });
	assert(!out.includes("go()"), "a nested template desynced the scanner");
});

Deno.test("static getters are emptied too", () => {
	const src = `class A{static get stylesheet(){return":scope{color:red}"}}`;
	const out = stripServerCode(src, { names });
	assertEquals(out, `class A{static get stylesheet(){}}`);
	assert(!out.includes("color:red"));
});

Deno.test("server-prefixed free functions and their call sites go", () => {
	const src = `function serverLoad(a) {\n\treturn read(a);\n}\nserverLoad("x");\nkeep();`;
	const out = stripServerCode(src);
	assert(!out.includes("serverLoad"));
	assertStringIncludes(out, "keep();");
});

Deno.test("an already-empty body is left as it is", () => {
	const src = `class A{serverInit(){}init(){keep()}}`;
	assertEquals(stripServerCode(src, { names }), src);
});
