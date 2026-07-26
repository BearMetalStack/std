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

/**
 * Teardown is deferred by a microtask (see BMElement.disconnectedCallback) so a
 * same-tick reconnect can cancel it - a real disconnect only finishes settling once
 * these have run.
 */
function flush(times = 3): Promise<void> {
	let p = Promise.resolve();
	for (let i = 0; i < times; i++) p = p.then(() => {});
	return p;
}

Deno.test("init() teardown return runs on disconnect", async () => {
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
	await flush();
	assertEquals(calls, ["init", "cleanup"]);
});

Deno.test("a same-tick reconnect cancels the pending teardown and does not re-run init", () => {
	let inits = 0;
	let cleanups = 0;

	class Component extends BMElement {
		override init() {
			inits++;
			return () => cleanups++;
		}
	}

	const el = connectable(new Component());

	el.connectedCallback();
	el.disconnectedCallback();
	el.connectedCallback(); // reconnected before the deferred teardown ran
	assertEquals(inits, 1, "the component never really left, so init must not re-run");
	assertEquals(cleanups, 0, "the cancelled teardown must not run either");
});

Deno.test("init() teardown is re-registered across settled reconnects", async () => {
	let cleanups = 0;

	class Component extends BMElement {
		override init() {
			return () => cleanups++;
		}
	}

	const el = connectable(new Component());

	el.connectedCallback();
	el.disconnectedCallback();
	await flush();
	assertEquals(cleanups, 1);

	el.connectedCallback();
	el.disconnectedCallback();
	await flush();
	assertEquals(cleanups, 2);
});

Deno.test("init() returning nothing stays supported", async () => {
	class Component extends BMElement {
		override init() {}
	}

	const el = connectable(new Component());
	el.connectedCallback();
	el.disconnectedCallback();
	await flush();
});

Deno.test("init() teardown runs alongside addEffect cleanups", async () => {
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
	await flush();

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
