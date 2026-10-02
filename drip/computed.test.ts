import { assertEquals } from "@std/assert";
import { formatHex, tokenHex } from "./computed.ts";

Deno.test("formatHex writes six digits for opaque colors", () => {
	assertEquals(formatHex(255, 0, 16), "#ff0010");
	assertEquals(formatHex(1, 2, 3, 255), "#010203");
});

Deno.test("formatHex appends alpha when translucent", () => {
	assertEquals(formatHex(255, 255, 255, 128), "#ffffff80");
});

Deno.test("formatHex clamps and rounds channels", () => {
	assertEquals(formatHex(-4, 300, 127.6), "#00ff80");
});

Deno.test("tokenHex is undefined without a document", () => {
	assertEquals(tokenHex("--color-primary-500"), undefined);
});
