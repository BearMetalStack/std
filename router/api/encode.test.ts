import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { s } from "../schema.ts";
import { buildPath, readResponseBody, toFormData, toSearchParams } from "./encode.ts";

describe("buildPath", () => {
	it("substitutes a single parameter", () => {
		assertEquals(buildPath("/users/:id", { id: "42" }), "/users/42");
	});

	it("substitutes several parameters", () => {
		assertEquals(
			buildPath("/users/:id/posts/:postId", { id: "1", postId: "2" }),
			"/users/1/posts/2",
		);
	});

	it("percent-encodes values so the router's decodeGroups reverses them", () => {
		assertEquals(buildPath("/files/:name", { name: "a b/c" }), "/files/a%20b%2Fc");
	});

	it("collapses an omitted optional segment", () => {
		assertEquals(buildPath("/users/:id?", {}), "/users");
		assertEquals(buildPath("/a/:x?/b", {}), "/a/b");
	});

	it("keeps an optional segment that was supplied", () => {
		assertEquals(buildPath("/users/:id?", { id: "7" }), "/users/7");
	});

	it("leaves a path with no parameters alone", () => {
		assertEquals(buildPath("/health", {}), "/health");
	});

	it("throws when a required parameter is missing", () => {
		assertThrows(
			() => buildPath("/users/:id", {}),
			Error,
			'Missing required path parameter ":id"',
		);
	});
});

describe("toSearchParams", () => {
	const shape = s.query({
		page: s.number().coerce().optional(),
		tag: s.array(s.string()).optional(),
	}).shape;

	it("encodes declared scalar fields", () => {
		assertEquals(toSearchParams(shape, { page: 2 }).toString(), "page=2");
	});

	it("repeats the key for arrays, matching QuerySchema's getAll", () => {
		const params = toSearchParams(shape, { tag: ["a", "b"] });
		assertEquals(params.getAll("tag"), ["a", "b"]);
	});

	it("omits undefined and null", () => {
		assertEquals(toSearchParams(shape, { page: undefined, tag: undefined }).toString(), "");
	});

	it("ignores fields the schema does not declare", () => {
		const params = toSearchParams(shape, { page: 1, sneaky: "no" } as Record<string, unknown>);
		assertEquals(params.has("sneaky"), false);
	});

	it("round-trips through QuerySchema", () => {
		const schema = s.query({ page: s.number().coerce(), tag: s.array(s.string()) });
		const encoded = toSearchParams(schema.shape, { page: 3, tag: ["x", "y"] });
		assertEquals(schema.parse(encoded), { page: 3, tag: ["x", "y"] });
	});
});

describe("toFormData", () => {
	const shape = s.formData({ title: s.string(), file: s.file().optional() }).shape;

	it("stringifies scalars", () => {
		assertEquals(toFormData(shape, { title: "hello" }).get("title"), "hello");
	});

	it("passes Blob values through untouched", () => {
		const file = new File(["body"], "note.txt", { type: "text/plain" });
		const form = toFormData(shape, { title: "t", file });
		assertEquals(form.get("file") instanceof File, true);
	});
});

describe("readResponseBody", () => {
	it("parses a JSON body", async () => {
		const res = new Response(JSON.stringify({ a: 1 }), {
			headers: { "content-type": "application/json" },
		});
		assertEquals(await readResponseBody(res), { a: 1 });
	});

	it("returns text for a non-JSON body", async () => {
		const res = new Response("plain", { headers: { "content-type": "text/plain" } });
		assertEquals(await readResponseBody(res), "plain");
	});

	it("returns null for statuses that carry no body", async () => {
		assertEquals(await readResponseBody(new Response(null, { status: 204 })), null);
	});
});
