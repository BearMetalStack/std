/**
 * Guards the constraint the whole design rests on: everything reachable from
 * `@bearmetal/router/api` must bundle for a browser.
 *
 * These are static source checks so they need no extra permissions and run with
 * the rest of the suite. For the real thing, `deno task check:browser` bundles
 * the entry point with `--platform=browser`.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

/** Files reachable from `@bearmetal/router/api`. `server.ts` is deliberately absent. */
const ISOMORPHIC = ["mod.ts", "spec.ts", "client.ts", "encode.ts", "types.ts"];

/** Modules that drag in `Deno` and must only ever be imported as types. */
const SERVER_ONLY = ["../router.ts", "../module.ts", "./server.ts"];

/**
 * A bare `Deno` identifier used as a value. Property access (`host.Deno`) and
 * type positions (`Deno?: {...}`) are both excluded.
 */
const BARE_DENO = /(^|[^.\w$'"`])Deno\s*[.[]/;

/**
 * `app/ssr`'s stripServerCode deletes any declaration whose name starts with
 * "server" from a browser bundle. A binding named that way here would vanish
 * silently at runtime rather than fail to build.
 */
const SERVER_PREFIXED = /\b(?:function|const|let|var|class)\s+server\w*/;

async function read(file: string): Promise<string> {
	return await Deno.readTextFile(new URL(`./${file}`, import.meta.url));
}

/** Strips line and block comments so the scans only see real code. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("isomorphic entry point", () => {
	it("never imports a server-only module except as a type", async () => {
		const offenders: string[] = [];

		for (const file of ISOMORPHIC) {
			const source = stripComments(await read(file));
			for (const match of source.matchAll(/^import\s+([\s\S]*?)from\s+"([^"]+)";/gm)) {
				const [, clause, specifier] = match;
				if (!SERVER_ONLY.includes(specifier)) continue;
				if (!clause.trimStart().startsWith("type ")) {
					offenders.push(`${file} imports ${specifier} as a value`);
				}
			}
		}

		assertEquals(offenders, []);
	});

	it("never references Deno as a value", async () => {
		const offenders: string[] = [];

		for (const file of ISOMORPHIC) {
			const source = stripComments(await read(file));
			source.split("\n").forEach((line, index) => {
				if (BARE_DENO.test(line)) offenders.push(`${file}:${index + 1} ${line.trim()}`);
			});
		}

		assertEquals(offenders, []);
	});

	it("declares no binding that stripServerCode would delete", async () => {
		const offenders: string[] = [];

		for (const file of ISOMORPHIC) {
			const source = stripComments(await read(file));
			const match = source.match(SERVER_PREFIXED);
			if (match) offenders.push(`${file}: ${match[0]}`);
		}

		assertEquals(offenders, []);
	});
});
