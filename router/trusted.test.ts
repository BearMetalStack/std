import { assert, assertEquals, assertThrows } from "@std/assert";
import { Module, Router, TrustedModule } from "./mod.ts";
import { ForagerModule } from "./modules/forager.ts";

/** Silences the intentional yellow/red console output while a block runs. */
function muted<T>(fn: () => T): T {
	const { warn, error } = console;
	console.warn = () => {};
	console.error = () => {};
	try {
		return fn();
	} finally {
		console.warn = warn;
		console.error = error;
	}
}

class Untrusted extends Module {}

class RealComponents extends TrustedModule {
	constructor() {
		super("@bearmetal/components");
		this.route("/@bearmetal/components").get(() => new Response("real"));
	}
}

class Impostor extends TrustedModule {
	constructor() {
		super("@bearmetal/components"); // same name, different class
		this.route("/@bearmetal/components").get(() => new Response("pwned"));
	}
}

Deno.test("a TrustedModule must name itself", () => {
	assertThrows(
		() =>
			new (class extends TrustedModule {
				constructor() {
					super("  ");
				}
			})(),
		TypeError,
	);
});

Deno.test("a named TrustedModule may take a reserved route", () => {
	const router = muted(() => new Router().use(new ForagerModule()));
	assertEquals(router._bearmetalSubrouteWarnings, []);
	assertEquals(router._trustedClaims.get("@bearmetal/forager"), "ForagerModule");
});

Deno.test("an untrusted Module may not take a reserved route", () => {
	const sneaky = new Untrusted();
	sneaky.route("/@bearmetal/forager").get(() => new Response("pwned"));

	const router = muted(() => new Router().use(sneaky));

	assertEquals(router._bearmetalSubrouteWarnings.length, 1);
	assert(router._bearmetalSubrouteWarnings[0].includes("Untrusted"));
	assertThrows(() => router.handle, Error, "BearMetal subroute warnings");
});

Deno.test("an untrusted Module may take an ordinary route", () => {
	const plain = new Untrusted();
	plain.route("/hello").get(() => new Response("hi"));
	const router = new Router().use(plain);
	assertEquals(router._bearmetalSubrouteWarnings, []);
});

Deno.test("two classes claiming one trusted name is refused and reported", () => {
	const router = muted(() => new Router().use(new RealComponents()).use(new Impostor()));

	assertEquals(router._bearmetalSubrouteWarnings.length, 1);
	const warning = router._bearmetalSubrouteWarnings[0];
	// Both class names must appear: this is the name-and-shame.
	assert(warning.includes("RealComponents"), warning);
	assert(warning.includes("Impostor"), warning);
	// The incumbent keeps the name.
	assertEquals(router._trustedClaims.get("@bearmetal/components"), "RealComponents");
	assertThrows(() => router.handle, Error);
});

Deno.test("the same class re-claiming its own name is fine", () => {
	const router = muted(() => new Router().use(new RealComponents()).use(new RealComponents()));
	assertEquals(router._bearmetalSubrouteWarnings, []);
});

Deno.test("warnings from a nested sub-router bubble to the root", () => {
	const sneaky = new Untrusted();
	sneaky.route("/@bearmetal/forager").get(() => new Response("pwned"));

	const api = muted(() => new Router().use(sneaky));
	assertEquals(api._bearmetalSubrouteWarnings.length, 1);

	const root = muted(() => new Router().use(api));
	assertEquals(root._bearmetalSubrouteWarnings.length, 1);
	assertThrows(() => root.handle, Error);
});

Deno.test("trusted claims from sibling sub-routers collide at the root", () => {
	const a = muted(() => new Router().use(new RealComponents()));
	const b = muted(() => new Router().use(new Impostor()));

	// Each sub-router is individually fine.
	assertEquals(a._bearmetalSubrouteWarnings, []);
	assertEquals(b._bearmetalSubrouteWarnings, []);

	const root = muted(() => new Router().use(a).use(b));
	assert(root._bearmetalSubrouteWarnings.length >= 1);
	assertThrows(() => root.handle, Error);
});

Deno.test("a collision alarms exactly once", () => {
	let alarms = 0;
	const { error, warn } = console;
	console.error = (msg?: unknown) => {
		if (typeof msg === "string" && msg.includes("SEVERE SECURITY ISSUE")) alarms++;
	};
	console.warn = () => {};
	try {
		new Router().use(new RealComponents()).use(new Impostor());
	} finally {
		console.error = error;
		console.warn = warn;
	}
	assertEquals(alarms, 1);
});

Deno.test("a trusted route is announced once, not once per mount level", () => {
	let announcements = 0;
	const { warn } = console;
	console.warn = (msg?: unknown) => {
		if (typeof msg === "string" && msg.includes("trusted")) announcements++;
	};
	try {
		const api = new Router().use(new RealComponents());
		new Router().use(api); // bubbling must not re-announce
	} finally {
		console.warn = warn;
	}
	assertEquals(announcements, 1);
});
