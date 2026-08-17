import { assertEquals, assertStringIncludes } from "@std/assert";
import Router, { Module, TrustedModule } from "@bearmetal/router";
import { classifyRoutes, manifestSkeleton, paramsOf, routesOfClass } from "./classify.ts";

const ok = () => new Response("ok");

Deno.test("paramsOf names every :param in order", () => {
	assertEquals(paramsOf("/md/:file"), ["file"]);
	assertEquals(paramsOf("/users/:id/posts/:postId"), ["id", "postId"]);
	assertEquals(paramsOf("/posts/:id?"), ["id"]);
	assertEquals(paramsOf("/about"), []);
});

Deno.test("classifyRoutes buckets a realistic route table", () => {
	const router = new Router();
	router.route("/").get(ok);
	router.route("/about").get(ok);
	router.route("/md/:file").get(ok);
	router.route("/users/:id/posts/:postId").get(ok);
	router.route("/submit").post(ok);
	router.route("/files/*").get(ok);
	router.use(async (_ctx, next) => await next());

	const classified = classifyRoutes(router);

	assertEquals(classified.get("/")?.class, "static");
	assertEquals(classified.get("/about")?.class, "static");
	assertEquals(classified.get("/md/:file")?.class, "needs-manifest");
	assertEquals(classified.get("/md/:file")?.params, ["file"]);
	assertEquals(classified.get("/users/:id/posts/:postId")?.params, ["id", "postId"]);

	// POST-only: nothing to render.
	assertEquals(classified.get("/submit")?.class, "skip");
	assertStringIncludes(classified.get("/submit")?.reason ?? "", "no GET");

	// A wildcard mount is copied from disk, not rendered.
	assertEquals(classified.get("/files/*")?.class, "skip");
	assertStringIncludes(classified.get("/files/*")?.reason ?? "", "directory");

	// `use()` registers under the catch-all path.
	assertEquals(classified.get("/.*")?.class, "skip");
});

Deno.test("classifyRoutes skips the reserved @bearmetal namespace", () => {
	class ToolingModule extends TrustedModule {
		constructor() {
			super("@bearmetal/tooling");
			this.route("/@bearmetal/tooling").get(ok);
		}
	}
	const router = new Router();
	router.use(new ToolingModule());

	const classified = classifyRoutes(router);
	const entry = classified.get("/@bearmetal/tooling");
	assertEquals(entry?.class, "skip");
	assertStringIncludes(entry?.reason ?? "", "reserved");
});

Deno.test("classifyRoutes sees routes contributed by mounted modules, fully prefixed", () => {
	const blog = new Module();
	blog.route("/index").get(ok);
	blog.route("/:slug").get(ok);

	const router = new Router();
	router.use("/blog", blog);

	const classified = classifyRoutes(router);
	assertEquals(classified.get("/blog/index")?.class, "static");
	assertEquals(classified.get("/blog/:slug")?.class, "needs-manifest");
	assertEquals(classified.get("/blog/:slug")?.params, ["slug"]);
});

Deno.test("routesOfClass returns sorted paths", () => {
	const router = new Router();
	router.route("/zebra").get(ok);
	router.route("/apple").get(ok);
	router.route("/md/:file").get(ok);

	const statics = routesOfClass(classifyRoutes(router), "static");
	assertEquals(statics.map((s) => s.path), ["/apple", "/zebra"]);
});

Deno.test("manifestSkeleton emits a fillable entry per param route", () => {
	const router = new Router();
	router.route("/about").get(ok);
	router.route("/md/:file").get(ok);
	router.route("/users/:id/posts/:postId").get(ok);

	const skeleton = manifestSkeleton(classifyRoutes(router));

	assertStringIncludes(skeleton, `defineManifest`);
	assertStringIncludes(skeleton, `"/md/:file"`);
	assertStringIncludes(skeleton, `{ params: { file: "" } }`);
	assertStringIncludes(skeleton, `{ params: { id: "", postId: "" } }`);
	// Static routes need no entry.
	assertEquals(skeleton.includes("/about"), false);
});

Deno.test("manifestSkeleton is still valid with nothing to declare", () => {
	const router = new Router();
	router.route("/about").get(ok);

	assertStringIncludes(manifestSkeleton(classifyRoutes(router)), "defineManifest({})");
});
