import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { generateRoute } from "./generate.ts";
import type { RouteArgs } from "./command.ts";

const MAIN_TS = `import { Router } from "@bearmetal/router";

const router = new Router();

router.route("/").get(() => new Response("home"));

router.serveDirectory("public", "/", { favicon: "bmicon.svg" });

Deno.serve(router.handle);
`;

async function setup(withMain = true): Promise<string> {
	const root = await Deno.makeTempDir({ prefix: "bmroute_" });
	await Deno.writeTextFile(`${root}/deno.json`, `{ "fmt": { "useTabs": true } }\n`);
	if (withMain) await Deno.writeTextFile(`${root}/main.ts`, MAIN_TS);
	return root;
}

function args(root: string, over: Partial<RouteArgs>): RouteArgs {
	return {
		get: false,
		post: false,
		put: false,
		patch: false,
		delete: false,
		options: false,
		responseSchema: [],
		shorthand: false,
		wire: true,
		dryRun: false,
		nonInteractive: true,
		root,
		...over,
	};
}

async function read(path: string): Promise<string> {
	return await Deno.readTextFile(path);
}

async function exists(path: string): Promise<boolean> {
	try {
		await Deno.stat(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Fails the test if `deno fmt` would reformat any of `paths`. Skipped when the
 * test run lacks permission to spawn `deno`, so the suite still runs under a
 * restricted permission set.
 */
async function assertFormatted(...paths: string[]): Promise<void> {
	const perm = await Deno.permissions.query({ name: "run", command: "deno" });
	if (perm.state !== "granted") return;
	const cmd = new Deno.Command("deno", {
		args: ["fmt", "--check", ...paths],
		stdout: "piped",
		stderr: "piped",
	});
	const { success, stderr } = await cmd.output();
	assert(success, `deno fmt --check failed:\n${new TextDecoder().decode(stderr)}`);
}

Deno.test("creates a nested route, its parent, and wires the top module in", async () => {
	const root = await setup();
	await generateRoute(args(root, { path: "/api/users", get: true, post: true }));

	assert(await exists(`${root}/routes/api/mod.ts`), "api parent created");
	assert(await exists(`${root}/routes/api/users.ts`), "users leaf created");

	const users = await read(`${root}/routes/api/users.ts`);
	assertStringIncludes(users, 'import { Router } from "@bearmetal/router";');
	assertStringIncludes(users, "export function usersModule(): Router {");
	assertStringIncludes(users, 'router.route("/users")');
	assertStringIncludes(users, ".get(() => {");
	assertStringIncludes(users, ".post(() => {");

	const api = await read(`${root}/routes/api/mod.ts`);
	assertStringIncludes(api, 'import { usersModule } from "./users.ts";');
	assertStringIncludes(api, 'router.use("/api", usersModule());');

	const main = await read(`${root}/main.ts`);
	assertStringIncludes(main, 'import { apiModule } from "./routes/api/mod.ts";');
	assertStringIncludes(main, "router.use(apiModule());");
	assert(main.indexOf("router.use(apiModule());") < main.indexOf("serveDirectory"));

	await assertFormatted(
		`${root}/main.ts`,
		`${root}/routes/api/mod.ts`,
		`${root}/routes/api/users.ts`,
	);
	await Deno.remove(root, { recursive: true });
});

Deno.test("promotes an existing leaf to a parent when nesting under it", async () => {
	const root = await setup();
	await generateRoute(args(root, { path: "/api/users", get: true }));
	await generateRoute(args(root, { path: "/api/users/:id", get: true, post: true }));

	assert(!(await exists(`${root}/routes/api/users.ts`)), "old users leaf removed");
	assert(await exists(`${root}/routes/api/users/mod.ts`), "users promoted to a parent");
	assert(await exists(`${root}/routes/api/users/_id.ts`), ":id leaf created");

	const usersMod = await read(`${root}/routes/api/users/mod.ts`);
	assertStringIncludes(usersMod, 'router.route("/users")');
	assertStringIncludes(usersMod, 'import { idModule } from "./_id.ts";');
	assertStringIncludes(usersMod, 'router.use("/users", idModule());');

	const id = await read(`${root}/routes/api/users/_id.ts`);
	assertStringIncludes(id, 'router.route("/:id")');
	assertStringIncludes(id, "export function idModule(): Router {");

	const api = await read(`${root}/routes/api/mod.ts`);
	assertStringIncludes(api, 'import { usersModule } from "./users/mod.ts";');

	await assertFormatted(
		`${root}/routes/api/mod.ts`,
		`${root}/routes/api/users/mod.ts`,
		`${root}/routes/api/users/_id.ts`,
	);
	await Deno.remove(root, { recursive: true });
});

Deno.test("appends a new method to an existing route", async () => {
	const root = await setup();
	await generateRoute(args(root, { path: "/api/users", get: true }));
	await generateRoute(args(root, { path: "/api/users", patch: true }));

	const users = await read(`${root}/routes/api/users.ts`);
	assertStringIncludes(users, ".get(() => {");
	assertStringIncludes(users, ".patch(() => {");
	assertEquals(users.match(/\.route\("\/users"\)/g)?.length, 1);

	await assertFormatted(`${root}/routes/api/users.ts`);
	await Deno.remove(root, { recursive: true });
});

Deno.test("does not duplicate a method that already exists", async () => {
	const root = await setup();
	await generateRoute(args(root, { path: "/api/users", get: true }));
	await generateRoute(args(root, { path: "/api/users", get: true }));

	const users = await read(`${root}/routes/api/users.ts`);
	assertEquals(users.match(/\.get\(/g)?.length, 1);
	await Deno.remove(root, { recursive: true });
});

Deno.test("emits the shorthand form behind the flag", async () => {
	const root = await setup();
	await generateRoute(args(root, { path: "/health", get: true, shorthand: true }));

	const health = await read(`${root}/routes/health.ts`);
	assertStringIncludes(health, 'router.get("/health", () => {');
	assert(!health.includes(".route("), "shorthand does not use .route()");

	await assertFormatted(`${root}/routes/health.ts`);
	await Deno.remove(root, { recursive: true });
});

Deno.test("wires body and response schemas from elsewhere", async () => {
	const root = await setup();
	await generateRoute(args(root, {
		path: "/api/users",
		post: true,
		get: true,
		bodySchema: "schemas.ts:user",
		responseSchema: ["200:response/schemas.ts:ok", "404:response/schemas.ts:notFound"],
	}));

	const users = await read(`${root}/routes/api/users.ts`);
	assertStringIncludes(users, 'import { user } from "../../schemas.ts";');
	assertStringIncludes(users, 'import { notFound, ok } from "../../response/schemas.ts";');
	assertStringIncludes(users, ".post(user, () => {");
	assertStringIncludes(users, '.responds("get", { 200: ok, 404: notFound })');

	await assertFormatted(`${root}/routes/api/users.ts`);
	await Deno.remove(root, { recursive: true });
});

Deno.test("leaves a standalone route in a file untouched", async () => {
	const root = await setup();
	await Deno.mkdir(`${root}/routes`);
	await Deno.writeTextFile(
		`${root}/routes/api.ts`,
		`import { Router } from "@bearmetal/router";

export function apiModule(): Router {
	const router = new Router();

	router.route("/api")
		.get(() => new Response("api root"));

	router.route("/api/banner")
		.get(() => new Response("a standalone banner route"));

	return router;
}
`,
	);

	await generateRoute(args(root, { path: "/api/users", get: true }));

	const api = await read(`${root}/routes/api/mod.ts`);
	assertStringIncludes(api, 'router.route("/api/banner")');
	assertStringIncludes(api, "a standalone banner route");
	assertStringIncludes(api, 'router.use("/api", usersModule());');
	assert(!(await exists(`${root}/routes/api.ts`)), "old api leaf removed after promotion");
	assert(!(await exists(`${root}/routes/api/banner.ts`)), "banner was not turned into a child");

	await assertFormatted(`${root}/routes/api/mod.ts`, `${root}/routes/api/users.ts`);
	await Deno.remove(root, { recursive: true });
});

Deno.test("dry-run writes nothing", async () => {
	const root = await setup();
	await generateRoute(args(root, { path: "/api/users", get: true, dryRun: true }));
	assert(!(await exists(`${root}/routes`)), "no routes dir created on dry run");
	await Deno.remove(root, { recursive: true });
});

Deno.test("non-interactive without a method fails", async () => {
	const root = await setup();
	let threw = false;
	try {
		await generateRoute(args(root, { path: "/api/users" }));
	} catch {
		threw = true;
	}
	assert(threw, "expected an error when no method is given");
	await Deno.remove(root, { recursive: true });
});
