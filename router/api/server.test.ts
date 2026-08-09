// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import Router from "../router.ts";
import { s } from "../schema.ts";
import { Created, NotFound, Ok } from "../util/response.ts";
import { createApiModule } from "./server.ts";
import { defineApi } from "./spec.ts";

const User = s.object({ id: s.string(), name: s.string() });
const ApiError = s.object({ code: s.string() });

function buildApi() {
	return defineApi()
		.route("/users/:id", "user")
		.get(undefined, { 200: User, 404: ApiError })
		.route("/health")
		.get(undefined, s.string())
		.build();
}

function serve(module: any) {
	const router = new Router();
	router.use(module);
	return (path: string, init?: RequestInit) =>
		router.handle(new Request(`http://localhost${path}`, init), {} as any);
}

describe("createApiModule", () => {
	it("wires a complete controller map", async () => {
		const api = buildApi();
		const request = serve(createApiModule(api, {
			user: { get: (ctx) => Ok({ id: ctx.params.id, name: "Ada" }) },
			"/health": { get: () => Ok("healthy") },
		}));

		const res = await request("/users/7");
		assertEquals(res.status, 200);
		assertEquals(await res.json(), { id: "7", name: "Ada" });
		assertEquals(await (await request("/health")).text(), "healthy");
	});

	it("throws listing every endpoint with no controller", () => {
		const api = buildApi();
		const error = assertThrows(() => createApiModule(api), Error);
		assertStringIncludes(error.message, "user.get");
		assertStringIncludes(error.message, "/health.get");
	});

	it("picks up controllers registered through setController", async () => {
		const api = buildApi();
		api.user.get.setController((ctx) => Ok({ id: ctx.params.id, name: "Grace" }));
		api.endpoint("/health").get.setController(() => Ok("healthy"));

		const res = await serve(createApiModule(api))("/users/3");
		assertEquals(res.status, 200);
		assertEquals(await res.json(), { id: "3", name: "Grace" });
	});

	it("lets an inline controller override one registered via setController", async () => {
		const api = buildApi();
		api.user.get.setController(() => Ok({ id: "registered", name: "Registered" }));
		api.endpoint("/health").get.setController(() => Ok("healthy"));

		const request = serve(createApiModule(
			api,
			{ user: { get: () => Ok({ id: "inline", name: "Inline" }) } } as any,
			{ partial: true },
		));

		assertEquals((await (await request("/users/1")).json()).id, "inline");
	});

	it("registers response schemas so routeRegistry reports them", () => {
		const api = buildApi();
		const module = createApiModule(api, {
			user: { get: () => NotFound({ code: "x" }) },
			"/health": { get: () => Ok("healthy") },
		} as any);

		const entry = [...module.routeRegistry].find(([path]) => path === "/users/:id");
		assertEquals(Object.keys(entry![1].responseSchemas.GET).sort(), ["200", "404"]);
	});

	it("returns the controller's own status when it is declared", async () => {
		const api = buildApi();
		const request = serve(createApiModule(api, {
			user: { get: () => NotFound({ code: "no_such_user" }) },
			"/health": { get: () => Ok("healthy") },
		} as any));

		const res = await request("/users/1");
		assertEquals(res.status, 404);
		assertEquals(await res.json(), { code: "no_such_user" });
	});
});

describe("response validation", () => {
	it("turns a payload that violates its own schema into a 500", async () => {
		const api = buildApi();
		const request = serve(createApiModule(api, {
			// `name` is required by User.
			user: { get: () => Ok({ id: "1" } as any) },
			"/health": { get: () => Ok("healthy") },
		} as any));

		const res = await request("/users/1");
		assertEquals(res.status, 500);
	});

	it("passes an invalid payload through when validation is off", async () => {
		const api = buildApi();
		const request = serve(createApiModule(
			api,
			{
				user: { get: () => Ok({ id: "1" } as any) },
				"/health": { get: () => Ok("healthy") },
			} as any,
			{ validateResponses: false },
		));

		const res = await request("/users/1");
		assertEquals(res.status, 200);
		assertEquals(await res.json(), { id: "1" });
	});

	it("passes an undeclared status through untouched", async () => {
		const api = buildApi();
		const request = serve(createApiModule(api, {
			user: { get: () => new Response("teapot", { status: 418 }) as any },
			"/health": { get: () => Ok("healthy") },
		} as any));

		const res = await request("/users/1");
		assertEquals(res.status, 418);
		assertEquals(await res.text(), "teapot");
	});
});

describe("request validation", () => {
	it("rejects a bad request body with the router's own 400", async () => {
		const api = defineApi()
			.route("/users", "users")
			.post(s.object({ name: s.string() }), { 201: User })
			.build();

		const request = serve(createApiModule(api, {
			users: { post: (ctx) => Created({ id: "1", name: ctx.input.name }) },
		}));

		const res = await request("/users", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: 42 }),
		});
		assertEquals(res.status, 400);
	});

	it("exposes the parsed input as both ctx.input and ctx.body", async () => {
		const api = defineApi()
			.route("/echo", "echo")
			.post(s.object({ name: s.string() }), s.object({ input: s.string(), body: s.string() }))
			.build();

		const request = serve(createApiModule(api, {
			echo: { post: (ctx) => Ok({ input: ctx.input.name, body: (ctx.body as any).name }) },
		}));

		const res = await request("/echo", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Ada" }),
		});
		assertEquals(await res.json(), { input: "Ada", body: "Ada" });
	});
});
