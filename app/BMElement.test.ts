import { assert, assertEquals } from "@std/assert";
import { setCurrentOwner } from "@bearmetal/jsx/client";
import { BMElement, getRefs } from "./BMElement.ts";

/**
 * Outside a browser `BMC` extends a plain object, so a component can be
 * constructed and connected directly as long as the few DOM surfaces
 * `connectedCallback` touches are stubbed. A component with no template and no
 * pre-rendered children takes the branch that only calls `init()`.
 */
function connectable<T extends BMElement>(el: T): T {
	Object.assign(el, {
		dataset: {},
		hasChildNodes: () => false,
	});
	return el;
}

Deno.test("init() teardown return runs on disconnect", () => {
	const calls: string[] = [];

	class Component extends BMElement {
		override init() {
			calls.push("init");
			return () => calls.push("cleanup");
		}
	}

	const el = connectable(new Component());

	el.connectedCallback();
	assertEquals(calls, ["init"]);

	el.disconnectedCallback();
	assertEquals(calls, ["init", "cleanup"]);
});

Deno.test("init() teardown is re-registered across reconnects", () => {
	let cleanups = 0;

	class Component extends BMElement {
		override init() {
			return () => cleanups++;
		}
	}

	const el = connectable(new Component());

	el.connectedCallback();
	el.disconnectedCallback();
	assertEquals(cleanups, 1);

	el.connectedCallback();
	el.disconnectedCallback();
	assertEquals(cleanups, 2);
});

Deno.test("init() returning nothing stays supported", () => {
	class Component extends BMElement {
		override init() {}
	}

	const el = connectable(new Component());
	el.connectedCallback();
	el.disconnectedCallback();
});

Deno.test("init() teardown runs alongside addEffect cleanups", () => {
	const calls: string[] = [];

	class Component extends BMElement {
		override init() {
			this.addEffect(() => () => calls.push("effect"));
			return () => calls.push("init");
		}
	}

	const el = connectable(new Component());
	el.connectedCallback();
	el.disconnectedCallback();

	assert(calls.includes("effect"));
	assert(calls.includes("init"));
});

Deno.test("getRefs() reaches the owning component's refs", () => {
	class Component extends BMElement {}

	const el = new Component();
	const paragraph = { tagName: "P" } as unknown as Element;
	el.registerRef("paragraph", paragraph);

	setCurrentOwner(el);
	try {
		assertEquals(getRefs().paragraph, paragraph);
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("getRefs() is a live view, readable after the ref registers", () => {
	class Component extends BMElement {}

	const el = new Component();
	setCurrentOwner(el);
	try {
		const refs = getRefs<{ late: Element }>();
		assertEquals(refs.late, undefined);

		const late = { tagName: "DIV" } as unknown as Element;
		el.registerRef("late", late);
		assertEquals(refs.late, late);
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("getRefs() without an owner returns an empty view", () => {
	setCurrentOwner(null);
	assertEquals(getRefs().anything, undefined);
});
