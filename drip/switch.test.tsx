import { assertEquals, assertRejects } from "@std/assert";
import { Router } from "@bearmetal/router";
import { installGlobals } from "@bearmetal/slag";
import { getThemeSelection, onThemeChange, setTheme, setVariant } from "./switch.ts";
import { dripModule } from "./module.ts";
import type { ThemeSelection } from "./selection.ts";

/**
 * A page as `BMDripBase` leaves it, with `fetch` answered by a router running
 * `dripModule()` and every cookie write recorded.
 */
async function page() {
	const router = new Router();
	router.use(dripModule({ themes: ["bearmetal", "pride"] }));
	const served = async (path: string) =>
		// deno-lint-ignore no-explicit-any
		await (await router.handle(new Request(`http://localhost${path}`), {} as any)).text();
	// Drip reads its bundled themes with fetch(), so let them load before it is stubbed.
	await served("/@bearmetal/drip/themes");

	const restore = installGlobals();
	const head = document.head;
	const theme = document.createElement("style");
	theme.id = "bm-drip-theme";
	theme.setAttribute("data-drip-theme", "bearmetal");
	theme.textContent = "/* bearmetal */";
	head.append(theme);

	const cookies: string[] = [];
	Object.defineProperty(document, "cookie", {
		configurable: true,
		set: (value: string) => cookies.push(value.split(";")[0]),
	});

	const realFetch = globalThis.fetch;
	globalThis.fetch =
		((input: string, init?: RequestInit) =>
			typeof input === "string" && input.startsWith("/")
				// deno-lint-ignore no-explicit-any
				? router.handle(new Request(`http://localhost${input}`, init), {} as any)
				: realFetch(input, init)) as typeof fetch;

	const changes: ThemeSelection[] = [];
	const stop = onThemeChange((s) => changes.push(s));

	return {
		served,
		cookies,
		changes,
		[Symbol.dispose]() {
			stop();
			globalThis.fetch = realFetch;
			restore();
		},
	};
}

Deno.test("setTheme swaps the sheets, pins the variant and writes the cookies", async () => {
	using p = await page();
	await setTheme("pride", { variant: "trans" });

	assertEquals(getThemeSelection(), { theme: "pride", variant: "trans" });
	assertEquals(
		document.getElementById("bm-drip-theme")?.textContent,
		await p.served("/@bearmetal/drip/themes/pride"),
	);
	assertEquals(
		document.getElementById("bm-drip-fonts")?.textContent,
		await p.served("/@bearmetal/drip/fonts/pride"),
	);
	assertEquals(document.documentElement.getAttribute("data-theme"), "trans");
	assertEquals(p.cookies, ["bm-drip-theme=pride", "bm-drip-variant=trans"]);
	assertEquals(p.changes, [{ theme: "pride", variant: "trans" }]);
});

Deno.test("a variant the new theme lacks is dropped; one it has is kept", async () => {
	using _ = await page();
	await setTheme("pride", { variant: "dark" });
	await setTheme("bearmetal");
	assertEquals(getThemeSelection(), { theme: "bearmetal", variant: "dark" });

	await setTheme("pride", { variant: "trans" });
	await setTheme("bearmetal");
	assertEquals(getThemeSelection(), { theme: "bearmetal" });
	assertEquals(document.documentElement.getAttribute("data-theme"), null);
});

Deno.test("setVariant pins and unpins data-theme", () => {
	using p = blankPage();
	setVariant("dark");
	assertEquals(document.documentElement.getAttribute("data-theme"), "dark");
	setVariant(null);
	assertEquals(document.documentElement.getAttribute("data-theme"), null);
	assertEquals(p.cookies, ["bm-drip-variant=dark", "bm-drip-variant="]);
});

Deno.test("when switches overlap, the last one asked for wins", async () => {
	using _ = await page();
	await Promise.all([setTheme("pride"), setTheme("bearmetal")]);
	assertEquals(getThemeSelection()?.theme, "bearmetal");
});

Deno.test("a theme the server does not serve rejects and changes nothing", async () => {
	using p = await page();
	await assertRejects(() => setTheme("foxfire"), Error, "404");
	assertEquals(getThemeSelection(), { theme: "bearmetal" });
	assertEquals(p.cookies, []);
});

/** {@linkcode page} for tests that never fetch. */
function blankPage() {
	const restore = installGlobals();
	const style = document.createElement("style");
	style.id = "bm-drip-theme";
	style.setAttribute("data-drip-theme", "bearmetal");
	document.head.append(style);
	const cookies: string[] = [];
	Object.defineProperty(document, "cookie", {
		configurable: true,
		set: (value: string) => cookies.push(value.split(";")[0]),
	});
	return { cookies, [Symbol.dispose]: restore };
}
