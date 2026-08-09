// deno-lint-ignore-file no-explicit-any
/**
 * End-to-end coverage for the contract layer, entirely in-process: the client's
 * `fetch` is wired straight into `Router.handle`, so every test exercises
 * encode -> router parse -> controller -> response validation -> decode.
 */
import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import Router from "../router.ts";
import { s } from "../schema.ts";
import { Conflict, Created, NotFound, Ok } from "../util/response.ts";
import { ApiContractError, createClient } from "./client.ts";
import { createApiModule } from "./server.ts";
import { defineApi } from "./spec.ts";
import type { ApiModuleOptions } from "./types.ts";

const User = s.object({ id: s.string(), name: s.string() });
const ApiError = s.object({ code: s.string() });

function buildApi() {
	return defineApi()
		.route("/users", "users")
		.get(s.query({ page: s.number().coerce().optional() }), s.array(User))
		.post(s.object({ name: s.string() }), { 201: User, 409: ApiError })
		.route("/users/:id", "user")
		.get(undefined, { 200: User, 404: ApiError })
		.route("/health")
		.get(undefined, s.string())
		.build();
}

function harness(
	options?: { mount?: string; moduleOptions?: ApiModuleOptions; validateResponses?: boolean },
) {
	const api = buildApi();
	const users = new Map([["1", { id: "1", name: "Ada" }]]);

	// No casts anywhere in this map - every controller's context and return type
	// is checked against the contract.
	const module = createApiModule(api, {
		users: {
			get: (ctx) => Ok([...users.values()].slice((ctx.input.page ?? 1) - 1)),
			post: (ctx) => {
				if ([...users.values()].some((u) => u.name === ctx.input.name)) {
					return Conflict({ code: "duplicate_name" });
				}
				const user = { id: String(users.size + 1), name: ctx.input.name };
				users.set(user.id, user);
				return Created(user);
			},
		},
		user: {
			get: (ctx) => {
				const user = users.get(ctx.params.id);
				return user ? Ok(user) : NotFound({ code: "no_such_user" });
			},
		},
		"/health": { get: () => Ok("healthy") },
	}, options?.moduleOptions);

	const router = new Router();
	if (options?.mount) router.use(options.mount, module);
	else router.use(module);

	const client = createClient(api, {
		baseUrl: options?.mount ? `http://localhost${options.mount}` : "http://localhost",
		fetch: (req) => router.handle(req, {} as any),
		validateResponses: options?.validateResponses,
	});

	return { api, client, users, router };
}

describe("api round trip", () => {
	it("resolves a path parameter and returns the declared 200", async () => {
		const { client } = harness();
		const result = await client.user({ id: "1" }).get();

		assertEquals(result.status, 200);
		if (result.status !== 200) throw new Error("unreachable");
		assertEquals(result.data, { id: "1", name: "Ada" });
		assertEquals(result.ok, true);
	});

	it("narrows to the declared error shape on 404", async () => {
		const { client } = harness();
		const result = await client.user({ id: "nope" }).get();

		assertEquals(result.status, 404);
		if (result.status !== 404) throw new Error("unreachable");
		assertEquals(result.data.code, "no_such_user");
		assertEquals(result.ok, false);
	});

	it("sends query input as search params and coerces it back server-side", async () => {
		const { client } = harness();
		const result = await client.users().get({ page: 1 });

		assertEquals(result.status, 200);
		assertEquals(result.data, [{ id: "1", name: "Ada" }]);
	});

	it("accepts a pre-built URLSearchParams for a query endpoint", async () => {
		const { client } = harness();
		const result = await client.users().get(new URLSearchParams({ page: "1" }));
		assertEquals(result.status, 200);
	});

	it("sends a JSON body and returns the declared 201", async () => {
		const { client, users } = harness();
		const result = await client.users().post({ name: "Grace" });

		assertEquals(result.status, 201);
		if (result.status !== 201) throw new Error("unreachable");
		assertEquals(result.data.name, "Grace");
		assertEquals(users.size, 2);
	});

	it("returns the declared conflict rather than throwing", async () => {
		const { client } = harness();
		const result = await client.users().post({ name: "Ada" });

		assertEquals(result.status, 409);
		if (result.status !== 409) throw new Error("unreachable");
		assertEquals(result.data.code, "duplicate_name");
	});

	it("round-trips a plain-text response", async () => {
		const { client } = harness();
		const result = await client.endpoint("/health")().get();
		assertEquals(result.data, "healthy");
	});

	it("works when the module is mounted under a prefix", async () => {
		const { client } = harness({ mount: "/api" });
		const result = await client.user({ id: "1" }).get();
		assertEquals(result.status, 200);
	});

	it("percent-encodes path parameters that need it", async () => {
		const { client, users } = harness();
		users.set("a b", { id: "a b", name: "Spaced" });

		const result = await client.user({ id: "a b" }).get();
		assertEquals(result.status, 200);
		if (result.status !== 200) throw new Error("unreachable");
		assertEquals(result.data.name, "Spaced");
	});
});

describe("contract enforcement", () => {
	it("rejects an invalid request payload before sending it", async () => {
		const { client } = harness();
		let sent = false;
		client.configure({
			fetch: (_req) => {
				sent = true;
				return Promise.resolve(new Response(null, { status: 500 }));
			},
		});

		await assertRejects(
			() => client.users().post({ name: 42 as any }),
			ApiContractError,
			"Invalid request input for POST users",
		);
		assertEquals(sent, false);
	});

	it("throws when the server answers with an undeclared status", async () => {
		const api = buildApi();
		const module = createApiModule(api, {
			users: { get: () => Ok([]), post: () => Ok([] as any) },
			// The contract declares 200 and 404; this returns 401.
			user: { get: () => new Response("nope", { status: 401 }) },
			"/health": { get: () => Ok("healthy") },
		} as any);

		const router = new Router();
		router.use(module);
		const client = createClient(api, {
			baseUrl: "http://localhost",
			fetch: (req) => router.handle(req, {} as any),
		});

		const error = await assertRejects(
			() => client.user({ id: "1" }).get(),
			ApiContractError,
			"which the contract does not declare",
		);
		assertEquals((error as ApiContractError).status, 401);
	});

	it("throws when a declared status carries a body that fails its schema", async () => {
		const api = buildApi();
		// Server-side validation is off, so the bad payload reaches the client.
		const module = createApiModule(
			api,
			{
				users: { get: () => Ok([]), post: () => Ok([] as any) },
				user: { get: () => Ok({ id: "1" } as any) },
				"/health": { get: () => Ok("healthy") },
			} as any,
			{ validateResponses: false },
		);

		const router = new Router();
		router.use(module);
		const client = createClient(api, {
			baseUrl: "http://localhost",
			fetch: (req) => router.handle(req, {} as any),
		});

		await assertRejects(
			() => client.user({ id: "1" }).get(),
			ApiContractError,
			"does not match its schema",
		);
	});

	it("skips response validation when it is turned off", async () => {
		const api = buildApi();
		const module = createApiModule(
			api,
			{
				users: { get: () => Ok([]), post: () => Ok([] as any) },
				user: { get: () => Ok({ id: "1" } as any) },
				"/health": { get: () => Ok("healthy") },
			} as any,
			{ validateResponses: false },
		);

		const router = new Router();
		router.use(module);
		const client = createClient(api, {
			baseUrl: "http://localhost",
			fetch: (req) => router.handle(req, {} as any),
			validateResponses: false,
		});

		const result = await client.user({ id: "1" }).get();
		assertEquals(result.status, 200);
		assertEquals(result.data as unknown, { id: "1" });
	});
});

describe("client configuration", () => {
	it("merges configured headers, with per-call headers winning", async () => {
		const { api } = harness();
		let seen: Headers | undefined;

		const client = createClient(api, {
			baseUrl: "http://localhost",
			headers: { "x-base": "1", "x-both": "base" },
			fetch: (req) => {
				seen = req.headers;
				return Promise.resolve(
					new Response(JSON.stringify({ id: "1", name: "Ada" }), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
				);
			},
		});

		await client.user({ id: "1" }).get({ headers: { "x-both": "call", "x-call": "1" } });

		assertEquals(seen?.get("x-base"), "1");
		assertEquals(seen?.get("x-both"), "call");
		assertEquals(seen?.get("x-call"), "1");
	});

	it("requires an absolute baseUrl outside a browser", async () => {
		const { api } = harness();
		const client = createClient(api, {});

		const error = await assertRejects(() => client.user({ id: "1" }).get(), Error);
		assertStringIncludes(error.message, "set an absolute `baseUrl`");
	});

	it("prefixes every request with the configured baseUrl", async () => {
		const { api } = harness();
		let url = "";
		const client = createClient(api, {
			baseUrl: "https://example.test/v1/",
			fetch: (req) => {
				url = req.url;
				return Promise.resolve(
					new Response(JSON.stringify({ id: "1", name: "Ada" }), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
				);
			},
		});

		await client.user({ id: "1" }).get();
		assertEquals(url, "https://example.test/v1/users/1");
	});
});
