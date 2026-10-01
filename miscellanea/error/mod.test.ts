import { assertEquals } from "@std/assert";
import { messageOf } from "./mod.ts";

Deno.test("messageOf", () => {
	assertEquals(messageOf(new Error("boom")), "boom");
	assertEquals(messageOf({ message: "plain" }), "plain");
	assertEquals(messageOf(new Error("")), "Error");
	assertEquals(messageOf("text"), "text");
	assertEquals(messageOf(42), "42");
	assertEquals(messageOf(undefined), "undefined");
	assertEquals(messageOf(Object.create(null)), "[object Object]");
});
