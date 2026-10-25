// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { NotFound, Router } from "@bearmetal/router";
import { builtin, handlerPath, healthModule } from "./mod.ts";
import type { DashManifest } from "./types.ts";

const manifest = (): DashManifest => ({
	schemaVersion: 1,
	identifier: "demo",
	name: "Demo",
	description: "A demo app",
	keyModules: [{
		id: "rps",
		_type: "stat",
		title: "Requests/s",
		source: builtin.rps,
		sourceType: "sse",
	}],
	modules: [{
		id: "q",
		_type: "gauge",
		title: "Queue",
		source: handlerPath("/queue"),
		sourceType: "static",
	}],
});

function get(router: Router, path: string, headers: HeadersInit = {}): Promise<Response> {
	return Promise.resolve(
		router.handle(new Request(`http://localhost${path}`, { headers }), {} as any),
	);
}

function muted<T>(fn: () => Promise<T>): Promise<T> {
	const { warn, error, log } = console;
	console.warn = console.error = console.log = () => {};
	return fn().finally(() => {
		console.warn = warn;
		console.error = error;
		console.log = log;
	});
}

/** Mounting announces every trusted route; keep that out of the test output. */
function quietly(fn: () => void): void {
	const { log, warn } = console;
	console.log = console.warn = () => {};
	try {
		fn();
	} finally {
		console.log = log;
		console.warn = warn;
	}
}

function routerWith(...args: Parameters<typeof healthModule>): Router {
	const router = new Router();
	quietly(() => router.use(healthModule(...args)));
	return router;
}

Deno.test("/healthz answers with the default body when the app has none", async () => {
	const res = await get(routerWith(), "/healthz");
	assertEquals(res.status, 200);
	const body = await res.json();
	assertEquals(body.status, "ok");
	assertEquals(body.checks, {});
	assertEquals(typeof body.uptime, "number");
});

Deno.test("/healthz defers to the app's own handler, mounted before or after", async () => {
	const after = routerWith();
	after.route("/healthz").get(() => new Response("mine"));
	assertEquals(await (await get(after, "/healthz")).text(), "mine");

	const before = new Router();
	before.route("/healthz").get(() => new Response("mine too"));
	quietly(() => before.use(healthModule()));
	assertEquals(await (await get(before, "/healthz")).text(), "mine too");
});

Deno.test("/healthz falls back to the default past a catch-all that 404s", async () => {
	const router = routerWith();
	router.route("/*").get(() => NotFound());
	const res = await get(router, "/healthz");
	assertEquals(res.status, 200);
	assertEquals((await res.json()).status, "ok");
});

Deno.test("/healthz answers 503 when a check fails or throws", async () => {
	const router = routerWith(undefined, {
		checks: { db: () => true, cache: () => false, queue: () => Promise.reject(new Error("x")) },
	});
	const res = await get(router, "/healthz");
	assertEquals(res.status, 503);
	const body = await res.json();
	assertEquals(body.status, "fail");
	assertEquals(body.checks, { db: true, cache: false, queue: false });
});

Deno.test("the discovery ping answers ok without a manifest or a token", async () => {
	const res = await get(routerWith(undefined, { token: "secret" }), "/@bearmetal/health");
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "ok");
	assert(res.headers.get("x-bearmetal-health"));
});

Deno.test("the dashboard is JSON by default and HTML when asked", async () => {
	const router = routerWith(manifest, {
		track: true,
		handlers: { "/queue": () => new Response() },
	});

	const json = await get(router, "/@bearmetal/health/dashboard", { accept: "application/json" });
	assertEquals(json.headers.get("content-type"), "application/json");
	assertEquals((await json.json()).identifier, "demo");

	const star = await get(router, "/@bearmetal/health/dashboard");
	assertEquals((await star.json()).name, "Demo");

	const html = await get(router, "/@bearmetal/health/dashboard", { accept: "text/html,*/*" });
	assertStringIncludes(html.headers.get("content-type") ?? "", "text/html");
	const page = await html.text();
	assertStringIncludes(page, "<h1>Demo</h1>");
	assertStringIncludes(page, "<bmh-module");

	const forced = await get(router, "/@bearmetal/health/dashboard?format=json", {
		accept: "text/html",
	});
	assertEquals(forced.headers.get("content-type"), "application/json");
});

Deno.test("no manifest means no dashboard", async () => {
	assertEquals((await get(routerWith(), "/@bearmetal/health/dashboard")).status, 404);
});

Deno.test("an invalid manifest is a 500 with its issues in dev", async () => {
	const router = routerWith(() => ({ ...manifest(), keyModules: [] }));
	const res = await muted(() => get(router, "/@bearmetal/health/dashboard"));
	assertEquals(res.status, 500);
	const body = await res.json();
	assertEquals(body.issues[0].path, ["keyModules"]);
});

Deno.test("the token gates the dashboard, metrics, and handlers but not /healthz", async () => {
	const router = routerWith(manifest, {
		token: "s3cret",
		track: true,
		handlers: { "/queue": () => new Response("{}") },
	});
	for (const path of ["/@bearmetal/health/dashboard", builtin.uptime, handlerPath("/queue")]) {
		const denied = await get(router, path);
		assertEquals(denied.status, 401, path);
		assertStringIncludes(denied.headers.get("www-authenticate") ?? "", "Bearer");
		await denied.body?.cancel();
		assertEquals((await get(router, path, { authorization: "Bearer wrong" })).status, 401, path);

		const ok = await muted(() => get(router, path, { authorization: "Bearer s3cret" }));
		assertEquals(ok.status, 200, path);
		await ok.body?.cancel();
	}
	const viaQuery = await get(router, `${builtin.uptime}?token=s3cret`);
	assertEquals(viaQuery.status, 200);
	await viaQuery.body?.cancel();
	assertEquals((await get(router, "/healthz")).status, 200);
});

Deno.test("the token passes through to the HTML page's feeds", async () => {
	const router = routerWith(manifest, { token: "s3cret" });
	const res = await muted(() =>
		get(router, "/@bearmetal/health/dashboard?token=s3cret", { accept: "text/html" })
	);
	assertStringIncludes(await res.text(), 'token="s3cret"');
});

Deno.test("user handlers are served under /x/", async () => {
	const router = routerWith(undefined, {
		handlers: { "/queue": () => Response.json({ value: 3 }) },
	});
	const res = await get(router, "/@bearmetal/health/x/queue");
	assertEquals(await res.json(), { value: 3 });
});

Deno.test("tracking counts app requests and skips its own endpoints", async () => {
	const router = routerWith(undefined, { track: true });
	router.route("/hello").get(() => new Response("hi"));
	router.route("/boom").get(() => new Response("no", { status: 500 }));
	for (let i = 0; i < 3; i++) await (await get(router, "/hello")).body?.cancel();
	await (await get(router, "/boom")).body?.cancel();
	await (await get(router, "/healthz")).body?.cancel();

	const requests = await (await get(router, builtin.requests)).json();
	const total = requests.series[0].points.reduce((a: number, [, v]: number[]) => a + v, 0);
	assertEquals(total, 4);

	const errors = await (await get(router, builtin.errors)).json();
	assertEquals(errors.series[0].points.reduce((a: number, [, v]: number[]) => a + v, 0), 1);

	const latency = await (await get(router, builtin.latency)).json();
	assertEquals(latency.buckets.reduce((a: number, b: { count: number }) => a + b.count, 0), 4);
});

Deno.test("metrics that are not tracked are 404s", async () => {
	const router = routerWith(undefined, { track: { requests: true } });
	assertEquals((await get(router, builtin.requests)).status, 200);
	assertEquals((await get(router, builtin.latency)).status, 404);
	assertEquals((await get(router, "/@bearmetal/health/m/nope")).status, 404);
	assertEquals((await get(router, builtin.uptime)).status, 200);
});

Deno.test("metrics stream over SSE with ?stream", async () => {
	const router = routerWith(undefined, { track: true });
	const res = await get(router, `${builtin.uptime}?stream`);
	assertEquals(res.headers.get("content-type"), "text/event-stream");
	const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
	let text = "";
	while (!text.includes("data:")) text += (await reader.read()).value;
	await reader.cancel();
	assertStringIncludes(text, '"value":');
});

Deno.test("health routes take the reserved namespace without warnings", () => {
	const router = routerWith(manifest, {
		track: true,
		handlers: { "/queue": () => new Response() },
	});
	router.handle; // throws if any subroute warning was recorded
});

Deno.test("mounting under a prefix moves nothing", async () => {
	const router = new Router();
	quietly(() => router.use("/api", healthModule(manifest)));
	assertEquals((await get(router, "/healthz")).status, 200);
	assertEquals(await (await get(router, "/@bearmetal/health")).text(), "ok");
});

Deno.test("sources pointing at nothing are warned about once", async () => {
	const warnings: string[] = [];
	const { warn } = console;
	console.warn = (m: string) => warnings.push(m);
	try {
		const router = routerWith(manifest); // no tracking, no /queue handler
		await (await get(router, "/@bearmetal/health/dashboard")).body?.cancel();
		await (await get(router, "/@bearmetal/health/dashboard")).body?.cancel();
	} finally {
		console.warn = warn;
	}
	const relevant = warnings.filter((w) => w.includes("point at nothing"));
	assertEquals(relevant.length, 1);
	assertStringIncludes(relevant[0], "rps →");
	assertStringIncludes(relevant[0], "q →");
});
