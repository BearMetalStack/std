import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { resolveStaticFile } from "./static.ts";

/**
 * These go straight at `resolveStaticFile` rather than through `router.handle`,
 * because the URL parser collapses dot segments while building `ctx.url` - a
 * traversal can't survive the trip through `Request`. The guard is there for
 * the path itself, so the path is what gets tested.
 */
describe("resolveStaticFile path containment", () => {
	let root: string;
	let served: string;

	beforeEach(async () => {
		root = await Deno.makeTempDir();
		served = root + "/public";
		await Deno.mkdir(served);
		await Deno.writeTextFile(served + "/app.js", "app bundle");
		await Deno.writeTextFile(served + "/index.html", "<html>shell</html>");
		await Deno.mkdir(served + "/nested");
		await Deno.writeTextFile(served + "/nested/deep.txt", "deep file");
		await Deno.writeTextFile(root + "/secret.txt", "do not serve me");
		// A sibling whose name starts with the served directory's name, to catch a
		// containment check done on a prefix without the trailing slash.
		await Deno.mkdir(root + "/public-secrets");
		await Deno.writeTextFile(root + "/public-secrets/key.txt", "also secret");
	});

	afterEach(async () => {
		await Deno.remove(root, { recursive: true });
	});

	it("should refuse a path that climbs out of the directory", async () => {
		const res = await resolveStaticFile(served, "/assets", "/assets/../secret.txt", false, false);
		assertEquals(res.status, 404);
	});

	it("should refuse percent-encoded dot segments", async () => {
		const res = await resolveStaticFile(
			served,
			"/assets",
			"/assets/%2e%2e/secret.txt",
			false,
			false,
		);
		assertEquals(res.status, 404);
	});

	it("should refuse a sibling directory sharing the served prefix", async () => {
		const res = await resolveStaticFile(
			served,
			"/assets",
			"/assets/../public-secrets/key.txt",
			false,
			false,
		);
		assertEquals(res.status, 404);
	});

	it("should refuse traversal in spa mode rather than serving the shell", async () => {
		const res = await resolveStaticFile(served, "/assets", "/assets/../secret.txt", true, false);
		assertEquals(res.status, 404);
	});

	it("should still resolve dot segments that stay inside the directory", async () => {
		const res = await resolveStaticFile(
			served,
			"/assets",
			"/assets/nested/../app.js",
			false,
			false,
		);
		assertEquals(await res.text(), "app bundle");
	});

	it("should still serve ordinary nested paths", async () => {
		const res = await resolveStaticFile(
			served,
			"/assets",
			"/assets/nested/deep.txt",
			false,
			false,
		);
		assertEquals(await res.text(), "deep file");
	});

	it("should still fall back to the spa shell for unknown in-tree routes", async () => {
		const res = await resolveStaticFile(served, "/assets", "/assets/some/view", true, false);
		assertEquals(await res.text(), "<html>shell</html>");
	});
});
