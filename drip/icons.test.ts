import { assertEquals } from "@std/assert";
import { iconNames, iconTypes, writeIconTypes } from "./icons.ts";

const SHEET = `<svg xmlns="http://www.w3.org/2000/svg">
	<symbol id="zoom" viewBox="0 0 24 24"><path d="M0 0"/></symbol>
	<symbol
		viewBox="0 0 24 24"
		id='a-b'
	></symbol>
	<g id="not-a-symbol"></g>
	<symbol id="zoom"></symbol>
</svg>`;

Deno.test("iconNames reads symbol ids only, sorted and unique", () => {
	assertEquals(iconNames(SHEET), ["a-b", "zoom"]);
});

Deno.test("iconTypes writes a union, and optionally the list", () => {
	const src = iconTypes(["zoom", "a-b"], { name: "TablerIcon", list: true });
	assertEquals(src.includes('export type TablerIcon =\n\t| "a-b"\n\t| "zoom";'), true);
	assertEquals(src.includes("export const TablerIcons: readonly TablerIcon[]"), true);
	assertEquals(iconTypes([]).includes("export type IconName =\n\tnever;"), true);
});

Deno.test("writeIconTypes only rewrites on change", async () => {
	const dir = await Deno.makeTempDir();
	try {
		await Deno.writeTextFile(`${dir}/a.svg`, SHEET);
		const out = `${dir}/gen/icons.ts`;
		assertEquals(await writeIconTypes([`${dir}/a.svg`], out), ["a-b", "zoom"]);
		const first = (await Deno.stat(out)).mtime;
		await new Promise((r) => setTimeout(r, 20));
		await writeIconTypes([`${dir}/a.svg`], out);
		assertEquals((await Deno.stat(out)).mtime, first);
		const mod = await import(`file://${out}`);
		assertEquals(Object.keys(mod), []);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
});
