import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { mirrorStripped } from "./prestrip.ts";

/** Builds a source tree in a temp directory and returns its root. */
async function tree(files: Record<string, string>): Promise<string> {
	const root = await Deno.makeTempDir({ prefix: "prestrip-src-" });
	for (const [path, contents] of Object.entries(files)) {
		const full = `${root}/${path}`;
		await Deno.mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
		await Deno.writeTextFile(full, contents);
	}
	return root;
}

const component = `import { BMElement, define, state } from "@bearmetal/app";
import { secret } from "../server/secrets.ts";
import { Button } from "./button.tsx";

@define("user-card")
export class UserCard extends BMElement {
	@state()
	accessor rows = this.signal<string[]>([]);

	override async serverInit() {
		this.rows.set(await secret("select * from users"));
	}

	override get template() {
		return <Button />;
	}
}
`;

Deno.test("the copy has no server body, and the source is untouched", async () => {
	const root = await tree({
		"card.tsx": component,
		"button.tsx": "export const Button = () => null;\n",
	});
	const mirror = await mirrorStripped(`${root}/`, { jsxImportSource: "@bearmetal/jsx" });

	const copied = await Deno.readTextFile(`${mirror.root}/card.tsx`);
	assertStringIncludes(copied, "async serverInit() {}");
	assert(!copied.includes("select * from users"), "the query survived");

	const original = await Deno.readTextFile(`${root}/card.tsx`);
	assertStringIncludes(original, "select * from users");

	await mirror.dispose();
	await Deno.remove(root, { recursive: true });
});

Deno.test("an import that leaves the tree is pointed back at the original", async () => {
	const root = await tree({ "card.tsx": component, "button.tsx": "export const Button = 1;\n" });
	const mirror = await mirrorStripped(root);
	const copied = await Deno.readTextFile(`${mirror.root}/card.tsx`);

	// Out of the tree: there is no copy of it to reach, so it must be absolute,
	// and resolved against where the *original* sits rather than the copy.
	const real = await Deno.realPath(root);
	const outside = `${real.slice(0, real.lastIndexOf("/"))}/server/secrets.ts`;
	assertStringIncludes(copied, `from "file://${outside}"`);
	// Inside the tree: the copy sits beside it, which is the whole point.
	assertStringIncludes(copied, `from "./button.tsx"`);
	// Resolved by the program's import map, which is the same either way.
	assertStringIncludes(copied, `from "@bearmetal/app"`);

	await mirror.dispose();
	await Deno.remove(root, { recursive: true });
});

Deno.test("the JSX pragma is added to JSX files only", async () => {
	const root = await tree({
		"card.tsx": component,
		"plain.ts": "export const a = 1;\n",
	});
	const mirror = await mirrorStripped(root, { jsxImportSource: "@bearmetal/jsx" });

	// Without this, a copy outside the project compiles against the default
	// runtime and the bundle comes out calling `React.createElement`.
	assertStringIncludes(
		await Deno.readTextFile(`${mirror.root}/card.tsx`),
		"/** @jsxImportSource @bearmetal/jsx */",
	);
	assertEquals(await Deno.readTextFile(`${mirror.root}/plain.ts`), "export const a = 1;\n");

	await mirror.dispose();
	await Deno.remove(root, { recursive: true });
});

Deno.test("nested files and non-source files come across", async () => {
	const root = await tree({
		"ui/card.tsx": component,
		"ui/icon.svg": "<svg/>",
	});
	const mirror = await mirrorStripped(root);

	assertStringIncludes(await Deno.readTextFile(`${mirror.root}/ui/card.tsx`), "serverInit() {}");
	assertEquals(await Deno.readTextFile(`${mirror.root}/ui/icon.svg`), "<svg/>");

	await mirror.dispose();
	await Deno.remove(root, { recursive: true });
});

Deno.test("refresh picks up an edit and forgets a deleted file", async () => {
	const root = await tree({
		"a.ts": "export const a = 1;\n",
		"b.ts": "export const b = 2;\n",
	});
	const mirror = await mirrorStripped(root);
	const at = mirror.root;

	await Deno.writeTextFile(`${root}/a.ts`, "export const a = 99;\n");
	await Deno.remove(`${root}/b.ts`);
	await mirror.refresh();

	assertEquals(mirror.root, at, "the root has to hold still, or every entrypoint path breaks");
	assertStringIncludes(await Deno.readTextFile(`${mirror.root}/a.ts`), "99");
	assertEquals(
		await Deno.stat(`${mirror.root}/b.ts`).then(() => "there").catch(() => "gone"),
		"gone",
	);

	await mirror.dispose();
	await Deno.remove(root, { recursive: true });
});

Deno.test("pathFor maps a source path onto its copy", async () => {
	const root = await tree({ "ui/card.tsx": component });
	const mirror = await mirrorStripped(root);
	const real = await Deno.realPath(root);

	assertEquals(mirror.pathFor(`${real}/ui/card.tsx`), `${mirror.root}/ui/card.tsx`);

	await mirror.dispose();
	await Deno.remove(root, { recursive: true });
});
