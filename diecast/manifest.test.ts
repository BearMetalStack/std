import { assertEquals, assertStringIncludes } from "@std/assert";
import Router from "@bearmetal/router";
import { classifyRoutes } from "./classify.ts";
import {
	checkManifest,
	checkPermutation,
	defineManifest,
	fillPath,
	resolvePermutations,
	withQuery,
} from "./manifest.ts";

const ok = () => new Response("ok");

Deno.test("defineManifest returns its argument unchanged", () => {
	const manifest = defineManifest({
		"/md/:file": { permutations: [{ params: { file: "a.md" } }] },
	});
	assertEquals(Object.keys(manifest), ["/md/:file"]);
});

Deno.test("resolvePermutations accepts arrays, sync thunks and async thunks", async () => {
	assertEquals(
		await resolvePermutations({ permutations: [{ params: { file: "a" } }] }),
		[{ params: { file: "a" } }],
	);
	assertEquals(
		await resolvePermutations({ permutations: () => [{ params: { file: "b" } }] }),
		[{ params: { file: "b" } }],
	);
	assertEquals(
		await resolvePermutations({
			permutations: async () => {
				await Promise.resolve();
				return [{ params: { file: "c" } }];
			},
		}),
		[{ params: { file: "c" } }],
	);
});

Deno.test("fillPath substitutes and encodes parameters", () => {
	assertEquals(fillPath("/md/:file", { file: "intro.md" }), "/md/intro.md");
	assertEquals(
		fillPath("/users/:id/posts/:postId", { id: "1", postId: "2" }),
		"/users/1/posts/2",
	);
	assertEquals(fillPath("/md/:file", { file: "Chapter 1" }), "/md/Chapter%201");
	assertEquals(fillPath("/about", {}), "/about");
});

Deno.test("fillPath drops an optional parameter that was left out", () => {
	assertEquals(fillPath("/posts/:id?", { id: "3" }), "/posts/3");
	assertEquals(fillPath("/posts/:id?", {}), "/posts");
});

Deno.test("withQuery appends and repeats array values", () => {
	assertEquals(withQuery("/search", undefined), "/search");
	assertEquals(withQuery("/search", { q: "bears" }), "/search?q=bears");
	assertEquals(withQuery("/search", { tag: ["a", "b"] }), "/search?tag=a&tag=b");
	assertEquals(withQuery("/search", {}), "/search");
});

Deno.test("checkManifest reports a key matching no route", () => {
	const router = new Router();
	router.route("/md/:file").get(ok);

	const problems = checkManifest(
		{ "/nope/:x": { permutations: [] } },
		classifyRoutes(router),
	);

	assertEquals(problems.length, 2); // unknown key, plus /md/:file left uncovered
	const unknown = problems.find((p) => p.kind === "unknown-route");
	assertStringIncludes(unknown?.message ?? "", "not a registered route");
});

Deno.test("checkManifest reports a parameterised route with no entry", () => {
	const router = new Router();
	router.route("/about").get(ok);
	router.route("/md/:file").get(ok);

	const problems = checkManifest(undefined, classifyRoutes(router));
	assertEquals(problems.length, 1);
	assertEquals(problems[0].kind, "uncovered-route");
	assertEquals(problems[0].path, "/md/:file");
	assertStringIncludes(problems[0].message, "file");
});

Deno.test("checkManifest is satisfied by a covering manifest", () => {
	const router = new Router();
	router.route("/about").get(ok);
	router.route("/md/:file").get(ok);

	const problems = checkManifest(
		{ "/md/:file": { permutations: [{ params: { file: "a.md" } }] } },
		classifyRoutes(router),
	);
	assertEquals(problems, []);
});

Deno.test("checkManifest accepts skip as coverage", () => {
	const router = new Router();
	router.route("/md/:file").get(ok);

	const problems = checkManifest(
		{ "/md/:file": { permutations: [], skip: true } },
		classifyRoutes(router),
	);
	assertEquals(problems, []);
});

Deno.test("checkPermutation catches a missing required parameter", () => {
	const problems = checkPermutation("/users/:id/posts/:postId", {
		params: { id: "1" } as Record<string, string>,
	});
	assertEquals(problems.length, 1);
	assertEquals(problems[0].kind, "missing-param");
	assertStringIncludes(problems[0].message, ":postId");
});

Deno.test("checkPermutation tolerates an omitted optional parameter", () => {
	assertEquals(checkPermutation("/posts/:id?", { params: {} }), []);
});

Deno.test("checkPermutation requires out whenever a query is set", () => {
	const problems = checkPermutation("/search", {
		params: {},
		query: { q: "bears" },
	});
	assertEquals(problems.length, 1);
	assertEquals(problems[0].kind, "missing-out");

	assertEquals(
		checkPermutation("/search", {
			params: {},
			query: { q: "bears" },
			out: "search/bears/index.html",
		}),
		[],
	);
});
