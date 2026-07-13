import { assertEquals } from "@std/assert";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Show, when } from "./Show.tsx";
import { createSignal } from "../signals.ts";

// No document global under `deno test`, so the jsx-runtime chooser picks the server
// impl: Show's fragment resolves to a Promise of an Html-like whose `raw` is the
// rendered string.
async function rendered(el: JSX.Element): Promise<string> {
	return (await (el as unknown as Promise<{ raw: string }>)).raw;
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
	assertEquals(await rendered(out), "");
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
