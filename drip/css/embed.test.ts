import { assertEquals } from "@std/assert";
import { renderEmbedded } from "./embed.ts";

Deno.test("embedded.ts matches the .css files (run `deno task bm:css`)", async () => {
	const current = await Deno.readTextFile(new URL("./embedded.ts", import.meta.url));
	assertEquals(current, await renderEmbedded());
});
