import { assertEquals } from "@std/assert";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Case, Default, Switch } from "./Switch.tsx";
import { createSignal } from "../signals.ts";

// Renderers yield bare strings; under Deno (no document) the jsx runtime is the
// server impl, so Switch's fragment resolves to a Promise of an Html-like whose
// raw string is the chosen renderer's output.
const r = (s: string) => () => s as unknown as JSX.Element;

async function rendered(el: JSX.Element): Promise<string> {
	return (await (el as unknown as Promise<{ raw: string }>)).raw;
}

Deno.test("Switch renders the exact-match Case", async () => {
	const out = Switch({
		$: createSignal("b"),
		children: [
			Case({ $: "a", children: r("A") }),
			Case({ $: "b", children: r("B") }),
		],
	});
	assertEquals(await rendered(out), "B");
});

Deno.test("Switch matches predicate Cases", async () => {
	const out = Switch({
		$: createSignal(7),
		children: [
			Case<number>({ $: (n) => n > 10, children: r("big") }),
			Case<number>({ $: (n) => n > 5, children: r("medium") }),
		],
	});
	assertEquals(await rendered(out), "medium");
});

Deno.test("exact match wins over an earlier predicate", async () => {
	const out = Switch({
		$: createSignal("a"),
		children: [
			Case<string>({ $: () => true, children: r("predicate") }),
			Case({ $: "a", children: r("exact") }),
		],
	});
	assertEquals(await rendered(out), "exact");
});

Deno.test("Default renders when nothing matches, regardless of position", async () => {
	const out = Switch({
		$: createSignal("z"),
		children: [
			Default({ children: r("fallback") }),
			Case({ $: "a", children: r("A") }),
		],
	});
	assertEquals(await rendered(out), "fallback");
});

Deno.test("Default loses to any matching Case", async () => {
	const out = Switch({
		$: createSignal("a"),
		children: [
			Default({ children: r("fallback") }),
			Case({ $: "a", children: r("A") }),
		],
	});
	assertEquals(await rendered(out), "A");
});

Deno.test("non-Case children are ignored", async () => {
	const out = Switch({
		$: createSignal("a"),
		children: [
			"not a case" as unknown as JSX.Element,
			Case({ $: "a", children: r("A") }),
		],
	});
	assertEquals(await rendered(out), "A");
});

Deno.test("renders nothing when no Case matches and no Default exists", async () => {
	const out = Switch({
		$: createSignal("z"),
		children: Case({ $: "a", children: r("A") }),
	});
	assertEquals(await rendered(out), "");
});
