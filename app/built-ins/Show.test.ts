import { assertEquals } from "@std/assert";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Show, when } from "./Show.ts";
import { createSignal, isSignal } from "../signals.ts";
import type { SignalOf } from "../types.ts";

// No document global under `deno test`, so the jsx-runtime chooser picks the server
// impl: Show's fragment resolves to a Promise of an Html-like whose `raw` is the
// rendered string — but Show/when return their `children()` result verbatim, so a
// mocked children() that yields a bare string (as these tests do) never touches the
// jsx-runtime and should be returned as-is.
async function rendered(
	el: JSX.Element | null | SignalOf<JSX.Element | null>,
): Promise<string | null> {
	if (!el) return null;
	if (isSignal(el)) return rendered(await el.get());
	const awaited = await (el as unknown as Promise<{ raw: string } | string>);
	return typeof awaited === "string" ? awaited : awaited.raw;
}

Deno.test("Show renders children when the signal is true", async () => {
	const out = Show({
		when: createSignal(true),
		children: () => "shown" as unknown as JSX.Element,
	});
	assertEquals(await rendered(out), "shown");
});

Deno.test("Show renders nothing when the signal is false", async () => {
	const out = Show({
		when: createSignal(false),
		children: () => "shown" as unknown as JSX.Element,
	});
	assertEquals(await rendered(out), null);
});

Deno.test("Show tracks a Computed signal, not just State", async () => {
	const base = createSignal(2);
	const isEven = { get: () => base.get() % 2 === 0 };
	const out = Show({
		// deno-lint-ignore no-explicit-any
		when: isEven as any,
		children: () => "even" as unknown as JSX.Element,
	});
	assertEquals(await rendered(out), "even");
});

Deno.test("when() returns null without invoking the renderer when false", () => {
	let calls = 0;
	const computed = when(createSignal(false), () => {
		calls++;
		return "x" as unknown as JSX.Element;
	});
	assertEquals(computed.get(), null);
	assertEquals(calls, 0);
});

Deno.test("when() invokes the renderer and returns its value when true", () => {
	let calls = 0;
	const computed = when(createSignal(true), () => {
		calls++;
		return "x" as unknown as JSX.Element;
	});
	assertEquals(computed.get() as unknown as string, "x");
	assertEquals(calls, 1);
});

Deno.test("when() is lazy — the renderer only runs once the signal is read as true", () => {
	let calls = 0;
	const flag = createSignal(false);
	const computed = when(flag, () => {
		calls++;
		return "x" as unknown as JSX.Element;
	});
	assertEquals(calls, 0);
	flag.set(true);
	computed.get();
	assertEquals(calls, 1);
});
