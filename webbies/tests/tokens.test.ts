import { assertEquals } from "@std/assert";
import { walk } from "@std/fs/walk";
import { definedProperties, findVarReferences, loadTheme } from "@bearmetal/drip";

/**
 * Every `var(--x)` a webbies component reads must be something the theme
 * defines or the component declares itself. An undefined custom property makes
 * the declaration invalid at computed-value time, so the style silently drops
 * rather than failing anywhere visible.
 */
const defined = definedProperties(await loadTheme("bearmetal"));
const componentsDir = new URL("../components/", import.meta.url);

for await (const entry of walk(componentsDir, { exts: [".ts", ".tsx"] })) {
	if (entry.name.endsWith(".test.ts")) continue;
	const source = await Deno.readTextFile(entry.path);
	// `var(--x, fallback)` is a deliberate hook (set from script or by a parent),
	// not a token the theme owes the component.
	const hooks = new Set([...source.matchAll(/var\(\s*(--[\w-]+)\s*,/g)].map((m) => m[1]));
	const refs = [...new Set(findVarReferences(source))].filter((p) => !hooks.has(p));
	if (!refs.length) continue;
	const local = new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
	Deno.test(`${entry.path.slice(componentsDir.pathname.length)} reads only defined tokens`, () => {
		assertEquals(refs.filter((p) => !defined.has(p) && !local.has(p)), []);
	});
}
