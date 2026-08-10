import { assertEquals } from "@std/assert";
import {
	compileUriTemplate,
	expandUriTemplate,
	matchUriTemplate,
	normalizeResourceContents,
} from "./resources.ts";
import { toBase64 } from "./content.ts";

Deno.test("templates capture a single segment by default", () => {
	const compiled = compileUriTemplate("note://{id}");
	assertEquals(compiled.variables, ["id"]);
	assertEquals(matchUriTemplate(compiled, "note://42"), { id: "42" });
	assertEquals(matchUriTemplate(compiled, "note://a/b"), null);
	assertEquals(matchUriTemplate(compiled, "other://42"), null);
});

Deno.test("reserved expansion crosses path separators", () => {
	const compiled = compileUriTemplate("file:///{+path}");
	assertEquals(matchUriTemplate(compiled, "file:///a/b/c.txt"), { path: "a/b/c.txt" });
});

Deno.test("multiple variables are captured and percent-decoded", () => {
	const compiled = compileUriTemplate("repo://{owner}/{name}/blob");
	assertEquals(matchUriTemplate(compiled, "repo://ada/hello%20world/blob"), {
		owner: "ada",
		name: "hello world",
	});
});

Deno.test("literal regex characters in a template are escaped", () => {
	const compiled = compileUriTemplate("q://a.b/{id}");
	assertEquals(matchUriTemplate(compiled, "q://aXb/7"), null);
	assertEquals(matchUriTemplate(compiled, "q://a.b/7"), { id: "7" });
});

Deno.test("expansion percent-encodes, and keeps slashes for reserved vars", () => {
	assertEquals(expandUriTemplate("note://{id}", { id: "a b" }), "note://a%20b");
	assertEquals(expandUriTemplate("file:///{+path}", { path: "a/b c" }), "file:///a/b%20c");
	assertEquals(expandUriTemplate("note://{id}", {}), "note://{id}");
});

Deno.test("reader output normalises to resource contents", () => {
	assertEquals(normalizeResourceContents("a://b", "hello", "text/plain"), [
		{ uri: "a://b", mimeType: "text/plain", text: "hello" },
	]);

	const bytes = new Uint8Array([0xde, 0xad]);
	assertEquals(normalizeResourceContents("a://b", bytes), [
		{ uri: "a://b", mimeType: "application/octet-stream", blob: toBase64(bytes) },
	]);

	assertEquals(
		normalizeResourceContents("a://b", { contents: [{ uri: "a://c", text: "x" }] }),
		[{ uri: "a://c", text: "x" }],
	);

	assertEquals(
		normalizeResourceContents("a://b", [{ uri: "", text: "one" }, { uri: "", text: "two" }]),
		[{ uri: "a://b", text: "one" }, { uri: "a://b", text: "two" }],
	);
});
