import { assertEquals, assertThrows } from "@std/assert";
import { parseBodySchema, parseResponseSchema } from "./schema.ts";

Deno.test("parseBodySchema splits path and export", () => {
	assertEquals(parseBodySchema("schemas.ts:user"), { module: "schemas.ts", name: "user" });
	assertEquals(parseBodySchema("a/b/schemas.ts:User"), {
		module: "a/b/schemas.ts",
		name: "User",
	});
});

Deno.test("parseBodySchema rejects malformed specs", () => {
	assertThrows(() => parseBodySchema("schemas.ts"));
	assertThrows(() => parseBodySchema(":user"));
	assertThrows(() => parseBodySchema("schemas.ts:"));
});

Deno.test("parseResponseSchema reads an optional status", () => {
	assertEquals(parseResponseSchema("200:response/schemas.ts:ok"), {
		status: 200,
		module: "response/schemas.ts",
		name: "ok",
	});
	assertEquals(parseResponseSchema("404:response/schemas.ts:notFound"), {
		status: 404,
		module: "response/schemas.ts",
		name: "notFound",
	});
});

Deno.test("parseResponseSchema defaults status to 200", () => {
	assertEquals(parseResponseSchema("schemas.ts:ok"), {
		status: 200,
		module: "schemas.ts",
		name: "ok",
	});
});

Deno.test("parseResponseSchema rejects out-of-range status", () => {
	assertThrows(() => parseResponseSchema("999:schemas.ts:ok"));
});
