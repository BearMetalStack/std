import { assertEquals } from "@std/assert";
import { parseFlagMode, parseFlags } from "./flags.ts";

Deno.test("parseFlagMode defaults to 'default' when no value is given", () => {
	assertEquals(parseFlagMode(undefined), "default");
});

Deno.test("parseFlagMode recognizes 'long' and 'num'", () => {
	assertEquals(parseFlagMode("long"), "long");
	assertEquals(parseFlagMode("num"), "num");
});

Deno.test("parseFlagMode treats unrecognized values as 'default'", () => {
	assertEquals(parseFlagMode("UTF-8"), "default");
});

Deno.test("parseFlags splits default-mode flags one character at a time", () => {
	assertEquals(parseFlags("ABC", "default"), ["A", "B", "C"]);
});

Deno.test("parseFlags splits long-mode flags into two-character pairs", () => {
	assertEquals(parseFlags("AABBCC", "long"), ["AA", "BB", "CC"]);
});

Deno.test("parseFlags splits num-mode flags on commas", () => {
	assertEquals(parseFlags("1,2,30", "num"), ["1", "2", "30"]);
});

Deno.test("parseFlags returns an empty array for an empty string in every mode", () => {
	assertEquals(parseFlags("", "default"), []);
	assertEquals(parseFlags("", "long"), []);
	assertEquals(parseFlags("", "num"), []);
});
