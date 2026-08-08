// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { s } from "../schema.ts";
import { defineApi } from "./spec.ts";
import type { PathParams, Simplify } from "./types.ts";

const User = s.object({ id: s.string(), name: s.string() });
const ApiError = s.object({ code: s.string() });

/** Compile-time assertion that `A` and `B` are the same type. */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true
	: false;
function assertType<T extends true>(_: T = true as T): void {}

describe("PathParams", () => {
	it("infers a single required parameter", () => {
		assertType<Exact<Simplify<PathParams<"/users/:id">>, { id: string }>>();
	});

	it("infers several parameters", () => {
		assertType<
			Exact<Simplify<PathParams<"/users/:id/posts/:postId">>, { id: string; postId: string }>
		>();
	});

	it("infers an optional parameter as optional", () => {
		assertType<Exact<Simplify<PathParams<"/users/:id?">>, { id?: string }>>();
	});

	it("yields an empty object for a static path", () => {
		// deno-lint-ignore ban-types
		assertType<Exact<Simplify<PathParams<"/health">>, {}>>();
	});
});

describe("defineApi", () => {
	it("records routes in declaration order", () => {
		const api = defineApi()
			.route("/users", "users").get(undefined, s.array(User))
			.route("/health").get(undefined, s.string())
			.build();

		assertEquals(api.routes.map((r) => r.path), ["/users", "/health"]);
		assertEquals(api.routes.map((r) => r.name), ["users", undefined]);
	});

	it("normalizes a bare response schema to a 200 map", () => {
		const api = defineApi().route("/health").get(undefined, s.string()).build();
		assertEquals(Object.keys(api.routes[0].methods.get("get")!.responses), ["200"]);
	});

	it("keeps an explicit status map", () => {
		const api = defineApi()
			.route("/users/:id", "user").get(undefined, { 200: User, 404: ApiError })
			.build();
		assertEquals(Object.keys(api.routes[0].methods.get("get")!.responses), ["200", "404"]);
	});

	it("prefixes a path missing its leading slash", () => {
		const api = defineApi().route("health").get(undefined, s.string()).build();
		assertEquals(api.routes[0].path, "/health");
	});

	it("exposes named routes as properties and everything via endpoint()", () => {
		const api = defineApi()
			.route("/users/:id", "user").get(undefined, User)
			.route("/health").get(undefined, s.string())
			.build();

		assertEquals(typeof api.user, "function");
		assertEquals(typeof api.endpoint("/health"), "function");
		assertEquals(typeof api.endpoint("/users/:id"), "function");
	});

	it("rejects a reserved endpoint name", () => {
		assertThrows(
			() => (defineApi() as any).route("/x", "endpoint").get(undefined, s.string()).build(),
			Error,
			"reserved endpoint name",
		);
	});

	it("rejects duplicate names or paths", () => {
		assertThrows(
			() =>
				defineApi()
					.route("/a", "one").get(undefined, s.string())
					.route("/b", "one").get(undefined, s.string())
					.build(),
			Error,
			'Duplicate endpoint key "one"',
		);
		assertThrows(
			() =>
				defineApi()
					.route("/a").get(undefined, s.string())
					.route("/a").get(undefined, s.string())
					.build(),
			Error,
			'Duplicate endpoint key "/a"',
		);
	});

	it("rejects a verb declared before any route", () => {
		assertThrows(
			() => (defineApi() as any).get(undefined, s.string()),
			Error,
			"Declare a route with .route() before calling .get()",
		);
	});

	it("rejects a route with no methods", () => {
		assertThrows(
			() => (defineApi() as any).route("/a").route("/b").get(undefined, s.string()).build(),
			Error,
			'Route "/a" declares no methods',
		);
	});

	it("rejects the same method twice on one route", () => {
		assertThrows(
			() =>
				(defineApi() as any)
					.route("/a").get(undefined, s.string()).get(undefined, s.string()),
			Error,
			'GET is already declared on "/a"',
		);
	});

	it("rejects a non-schema input", () => {
		assertThrows(
			() => (defineApi() as any).route("/a").post({ name: "string" }, s.string()),
			Error,
			"is not a forge schema",
		);
	});

	it("rejects a response key that is not a status code", () => {
		assertThrows(
			() => (defineApi() as any).route("/a").get(undefined, { ok: User }),
			Error,
			'Response key "ok" is not an HTTP status code',
		);
	});
});

describe("contract types", () => {
	const api = defineApi()
		.route("/users", "users")
		.get(s.query({ page: s.number().coerce().optional() }), s.array(User))
		.post(s.object({ name: s.string() }), { 201: User, 409: ApiError })
		.route("/users/:id", "user")
		.get(undefined, { 200: User, 404: ApiError })
		.route("/health")
		.get(undefined, s.string())
		.build();

	// Every assertion below is checked by `deno check`, not at runtime - each
	// `@ts-expect-error` fails the build if the line stops being an error. The
	// function is deliberately never invoked, since calling these would issue
	// real requests.
	async function _compileTimeOnly() {
		// @ts-expect-error - /users/:id needs an id
		api.user();
		// @ts-expect-error - /users declares no path params
		api.users({ id: "1" });

		// @ts-expect-error - the GET on /users/:id declares no input schema
		api.user({ id: "1" }).get({ page: 1 });

		// @ts-expect-error - name must be a string
		api.users().post({ name: 42 });

		// @ts-expect-error - no DELETE declared on /users
		api.users().delete();

		// @ts-expect-error - no such endpoint
		api.endpoint("/nope");
		// @ts-expect-error - no such endpoint
		api.nonsense;

		const result = await api.user({ id: "1" }).get();
		if (result.status === 200) {
			assertType<Exact<typeof result.data, { id: string; name: string }>>();
			assertType<Exact<typeof result.ok, true>>();
		} else {
			assertType<Exact<typeof result.data, { code: string }>>();
			assertType<Exact<typeof result.ok, false>>();
		}

		// The health endpoint is unnamed and reachable only by path.
		const health = await api.endpoint("/health")().get();
		assertType<Exact<typeof health.data, string>>();
	}

	it("declares the endpoints the compile-time assertions reference", () => {
		assertEquals(typeof _compileTimeOnly, "function");
		assertEquals(api.routes.length, 3);
	});
});
