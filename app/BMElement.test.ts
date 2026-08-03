// The DOM here is @bearmetal/slag. `BMC` extends whatever `HTMLElement` is
// ambient, so these components are real custom elements — constructed through
// `document.createElement` and connected by being put in the tree, the same way
// a browser would do it.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assert, assertEquals } from "@std/assert";
import { setCurrentOwner } from "@bearmetal/jsx";
import { BMElement, getRefs } from "./BMElement.ts";

let nextTag = 0;

/**
 * Registers `ctor` under a fresh tag and returns an instance of it.
 *
 * Fresh because the custom element registry is process-wide, in Slag as in a
 * browser: defining a tag twice is an error in both.
 */
function element<T extends BMElement>(ctor: new () => T): T {
	const tag = `test-el-${nextTag++}`;
	(ctor as unknown as typeof BMElement).tag = tag;
	customElements.define(tag, ctor as unknown as CustomElementConstructor);
	return document.createElement(tag) as unknown as T;
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

	const el = element(
		class extends BMElement {
			override init() {
				calls.push("init");
				return () => calls.push("cleanup");
			}
		},
	);

	el.connectedCallback();
	assertEquals(calls, ["init"]);

	el.disconnectedCallback();
	await flush();
	assertEquals(calls, ["init", "cleanup"]);
});

Deno.test("a same-tick reconnect cancels the pending teardown and does not re-run init", () => {
	let inits = 0;
	let cleanups = 0;

	const el = element(
		class extends BMElement {
			override init() {
				inits++;
				return () => cleanups++;
			}
		},
	);

	el.connectedCallback();
	el.disconnectedCallback();
	el.connectedCallback();
	assertEquals(inits, 1, "the component never really left, so init must not re-run");
	assertEquals(cleanups, 0, "the cancelled teardown must not run either");
});

Deno.test("init() teardown is re-registered across settled reconnects", async () => {
	let cleanups = 0;

	const el = element(
		class extends BMElement {
			override init() {
				return () => cleanups++;
			}
		},
	);

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
	const el = element(
		class extends BMElement {
			override init() {}
		},
	);
	el.connectedCallback();
	el.disconnectedCallback();
	await flush();
});

Deno.test("init() teardown runs alongside addEffect cleanups", async () => {
	const calls: string[] = [];

	const el = element(
		class extends BMElement {
			override init() {
				this.addEffect(() => () => calls.push("effect"));
				return () => calls.push("init");
			}
		},
	);
	el.connectedCallback();
	el.disconnectedCallback();
	await flush();

	assert(calls.includes("effect"));
	assert(calls.includes("init"));
});

Deno.test("getRefs() reaches the owning component's refs", () => {
	const el = element(class extends BMElement {});
	const paragraph = document.createElement("p");
	el.registerRef("paragraph", paragraph);

	setCurrentOwner(el);
	try {
		assertEquals(getRefs().paragraph, paragraph);
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("getRefs() is a live view, readable after the ref registers", () => {
	const el = element(class extends BMElement {});
	setCurrentOwner(el);
	try {
		const refs = getRefs<{ late: Element }>();
		assertEquals(refs.late, undefined);

		const late = document.createElement("div");
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
