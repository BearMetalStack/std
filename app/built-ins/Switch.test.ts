import { assertEquals } from "@std/assert";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Case, Default, Switch } from "./Switch.ts";
import { createSignal, isSignal } from "../signals.ts";
import type { SignalOf } from "../types.ts";

// Renderers yield bare strings; under Deno (no document) the jsx runtime is the
// server impl, so real JSX resolves to a Promise of an Html-like whose raw string
// is the chosen renderer's output — but Switch returns a renderer's result verbatim,
// so these bare-string mocks never touch the jsx-runtime and should pass through as-is.
const r = (s: string) => () => s as unknown as JSX.Element;

async function rendered(
	el: JSX.Element | null | SignalOf<JSX.Element | null>,
): Promise<string | null> {
	if (!el) return null;
	if (isSignal(el)) return rendered(await el.get());
	const awaited = await (el as unknown as Promise<{ raw: string } | string>);
	return typeof awaited === "string" ? awaited : awaited.raw;
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
	assertEquals(await rendered(out), null);
});

Deno.test("Switch invokes the matched renderer exactly once per activation", async () => {
	let calls = 0;
	const counting = (() => {
		calls++;
		return "X";
	}) as unknown as () => JSX.Element;
	const out = Switch({
		$: createSignal("a"),
		children: [Case({ $: "a", children: counting })],
	});
	await rendered(out);
	assertEquals(calls, 1, "the branch must render once, not twice");
});

Deno.test("$$ keeps a visited branch's effects alive while another shows", async () => {
	const { setCurrentOwner } = await import("@bearmetal/jsx/jsx-runtime");
	const { createEffect } = await import("../signals.ts");
	const parentCleanups: (() => void)[] = [];
	setCurrentOwner({ registerCleanup: (fn) => parentCleanups.push(fn) });
	try {
		const mode = createSignal("a");
		const tick = createSignal(0);
		const seen: string[] = [];
		const branch = (name: string) => () => {
			createEffect(() => {
				seen.push(`${name}${tick.get()}`);
			});
			return name as unknown as JSX.Element;
		};
		const out = Switch({
			$: mode,
			$$: true,
			children: [Case({ $: "a", children: branch("a") }), Case({ $: "b", children: branch("b") })],
		});
		const read = () => (out as unknown as { get(): unknown }).get();
		read();
		mode.set("b");
		read();
		mode.set("a");
		assertEquals(read(), "a", "the kept node comes back");
		seen.length = 0;
		tick.set(1);
		await new Promise((r) => setTimeout(r, 0));
		assertEquals(seen.sort(), ["a1", "b1"], "both kept branches are still live");

		parentCleanups.forEach((fn) => fn());
		seen.length = 0;
		tick.set(2);
		await new Promise((r) => setTimeout(r, 0));
		assertEquals(seen, [], "tearing down the owner tears down every kept branch");
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("without $$, leaving a branch tears it down", async () => {
	const { setCurrentOwner } = await import("@bearmetal/jsx/jsx-runtime");
	const { createEffect } = await import("../signals.ts");
	setCurrentOwner({ registerCleanup: () => {} });
	try {
		const mode = createSignal("a");
		const tick = createSignal(0);
		const seen: string[] = [];
		const out = Switch({
			$: mode,
			children: [
				Case({
					$: "a",
					children: () => {
						createEffect(() => void seen.push(`a${tick.get()}`));
						return "a" as unknown as JSX.Element;
					},
				}),
				Case({ $: "b", children: r("b") }),
			],
		});
		const read = () => (out as unknown as { get(): unknown }).get();
		read();
		mode.set("b");
		read();
		seen.length = 0;
		tick.set(1);
		await new Promise((r) => setTimeout(r, 0));
		assertEquals(seen, []);
	} finally {
		setCurrentOwner(null);
	}
});
