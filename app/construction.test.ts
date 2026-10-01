// The DOM here is @bearmetal/slag; see the note in BMElement.test.ts.
import "@bearmetal/slag/global";
import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { setCurrentOwner } from "@bearmetal/jsx";
import { createRoot } from "@bearmetal/slag/testing";
import type { SlagNode } from "@bearmetal/slag";
import { BMElement } from "./BMElement.ts";
import { define } from "./define.ts";
import { prop } from "./prop.ts";
import { createEffect, createSignal } from "./signals.ts";
import type { Signal } from "./signals/wrapper.ts";
import type { BMTemplate } from "./types.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));
let n = 0;
const freshTag = () => `bm-construction-test-${++n}`;

/** A helper of the kind that gets called from a field initializer. */
function mirrored<T>(source: Signal.State<T>, into: T[]): Signal.State<T> {
	createEffect(() => {
		into.push(source.get());
	});
	return source;
}

Deno.test("createEffect from a field initializer is owned by the element, without a warning", async () => {
	setCurrentOwner(null);
	const seen: number[] = [];
	const source = createSignal(1);
	const warn = console.warn;
	const warnings: unknown[] = [];
	console.warn = (...args: unknown[]) => warnings.push(args[0]);
	try {
		@define(freshTag())
		class C extends BMElement {
			value = mirrored(source, seen);
		}
		const root = createRoot();
		const el = document.createElement(C.tag) as unknown as C;
		root.appendChild(el as unknown as SlagNode);
		assertEquals(warnings, []);
		assertEquals(seen, [1]);

		source.set(2);
		await flush();
		assertEquals(seen, [1, 2]);

		(el as unknown as Element).remove();
		await flush();
		source.set(3);
		await flush();
		assertEquals(seen, [1, 2], "disconnecting stops it");

		root.appendChild(el as unknown as SlagNode);
		assertEquals(seen, [1, 2, 3], "reconnecting restarts it");
		source.set(4);
		await flush();
		assertEquals(seen, [1, 2, 3, 4]);
		(el as unknown as Element).remove();
		await flush();
	} finally {
		console.warn = warn;
	}
});

Deno.test("a field initializer constructing a child element gives each its own effects", () => {
	setCurrentOwner(null);
	const parentSeen: string[] = [];
	const childSeen: string[] = [];

	@define(freshTag())
	class Child extends BMElement {
		v = mirrored(createSignal("child"), childSeen);
	}
	@define(freshTag())
	class Parent extends BMElement {
		child = Child.create();
		v = mirrored(createSignal("parent"), parentSeen);
	}

	const el = document.createElement(Parent.tag) as unknown as Parent;
	assertInstanceOf(el.child, Child);
	assertEquals(parentSeen, ["parent"]);
	assertEquals(childSeen, ["child"]);
});

Deno.test("a subclass of a defined class still has its fields' effects owned", () => {
	setCurrentOwner(null);
	const seen: string[] = [];

	@define(freshTag())
	class Base extends BMElement {
		a = mirrored(createSignal("base"), seen);
	}
	@define(freshTag())
	class Sub extends Base {
		b = mirrored(createSignal("sub"), seen);
	}

	const warn = console.warn;
	const warnings: unknown[] = [];
	console.warn = (...args: unknown[]) => warnings.push(args[0]);
	try {
		document.createElement(Sub.tag);
	} finally {
		console.warn = warn;
	}
	assertEquals(seen, ["base", "sub"]);
	assertEquals(warnings, []);
});

Deno.test("create() builds through the registry and applies props", () => {
	setCurrentOwner(null);

	@define(freshTag())
	class Toast extends BMElement {
		@prop(String)
		accessor message = this.signal("");
		protected override get template(): BMTemplate {
			return this.message as unknown as BMTemplate;
		}
	}

	const toast = Toast.create({ message: "Saved" });
	assertInstanceOf(toast, Toast);
	assertEquals((toast as unknown as Element).localName, Toast.tag);
	assertEquals(toast.message.get(), "Saved");
	createRoot().appendChild(toast as unknown as SlagNode);
	assert((toast as unknown as Element).textContent?.includes("Saved"));
});
