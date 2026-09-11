import { assert, assertEquals, assertFalse } from "@std/assert";
import { Router, TrustedModule } from "@bearmetal/router";
import { devtoolsModule } from "./module.tsx";

/** Mirrors router/trusted.test.ts's own helper — silences the expected trust-claim line. */
function muted<T>(fn: () => T): T {
	const warn = console.warn;
	console.warn = () => {};
	try {
		return fn();
	} finally {
		console.warn = warn;
	}
}

function withEnv(value: string | undefined, fn: () => void): void {
	const prev = Deno.env.get("BEARMETAL_ENV");
	if (value === undefined) Deno.env.delete("BEARMETAL_ENV");
	else Deno.env.set("BEARMETAL_ENV", value);
	try {
		fn();
	} finally {
		if (prev === undefined) Deno.env.delete("BEARMETAL_ENV");
		else Deno.env.set("BEARMETAL_ENV", prev);
	}
}

Deno.test("isDev() === false returns a plain, untrusted Module with no routes", () => {
	withEnv("prod", () => {
		const mod = devtoolsModule();
		assertFalse(mod instanceof TrustedModule);
		assertEquals([...mod.rawRoutes].length, 0);
	});
});

Deno.test("isDev() (unset, defaults to dev) returns the real TrustedModule", () => {
	withEnv(undefined, () => {
		const mod = devtoolsModule();
		assert(mod instanceof TrustedModule);
	});
});

Deno.test("mounting the dev module does not throw, and claims /@bearmetal/devtools", () => {
	withEnv(undefined, () => {
		const router = muted(() => new Router().use(devtoolsModule()));
		assert([...router.rawRoutes].some(([path]) => path.startsWith("/@bearmetal/devtools")));
	});
});

Deno.test("mounting the prod module registers nothing under the reserved namespace", () => {
	withEnv("prod", () => {
		const router = new Router().use(devtoolsModule());
		assertFalse([...router.rawRoutes].some(([path]) => path.startsWith("/@bearmetal")));
	});
});
