// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
	Accepted,
	BadGateway,
	BadRequest,
	Conflict,
	ContentTooLarge,
	Created,
	Forbidden,
	Found,
	GatewayTimeout,
	Gone,
	InternalError,
	MethodNotAllowed,
	MovedPermanently,
	NoContent,
	NotFound,
	NotImplemented,
	NotModified,
	Ok,
	PartialContent,
	PaymentRequired,
	PermanentRedirect,
	RequestTimeout,
	ServiceUnavailable,
	TemporaryRedirect,
	TooManyRequests,
	TypedResponse,
	Unauthorized,
	UnprocessableEntity,
	UnsupportedMediaType,
} from "./util/response.ts";
import { s, SchemaError } from "./schema.ts";
import Router from "./router.ts";

// ─── TypedResponse class ──────────────────────────────────────────────────────

describe("TypedResponse", () => {
	it("is a subclass of Response", () => {
		assertInstanceOf(new TypedResponse("body", 200), Response);
	});

	it("sets status correctly", () => {
		assertEquals(new TypedResponse("x", 201).status, 201);
		assertEquals(new TypedResponse("x", 404).status, 404);
	});

	it("serializes string bodies as plain text", async () => {
		const r = new TypedResponse("hello", 200);
		assertEquals(r.headers.get("Content-Type"), "text/plain;charset=UTF-8");
		assertEquals(await r.text(), "hello");
	});

	it("serializes object bodies as JSON", async () => {
		const r = new TypedResponse({ a: 1, b: "two" }, 200);
		assertEquals(r.headers.get("Content-Type"), "application/json");
		assertEquals(await r.json(), { a: 1, b: "two" });
	});

	it("serializes array bodies as JSON", async () => {
		const r = new TypedResponse([1, 2, 3], 200);
		assertEquals(r.headers.get("Content-Type"), "application/json");
		assertEquals(await r.json(), [1, 2, 3]);
	});

	it("serializes null as an empty body", () => {
		const r = new TypedResponse(null, 204);
		assertEquals(r.body, null);
		assertEquals(r.headers.get("Content-Type"), null);
	});

	it("stores an attached schema", () => {
		const schema = s.object({ id: s.string() });
		const r = new TypedResponse({ id: "1" }, 200, { schema });
		assertEquals(r.schema, schema);
	});

	it("has no schema by default", () => {
		assertEquals(new TypedResponse("x", 200).schema, undefined);
	});

	it("respects caller-provided Content-Type over the default", async () => {
		const r = new TypedResponse({ x: 1 }, 200, {
			headers: { "Content-Type": "application/json; charset=utf-8" },
		});
		assertEquals(r.headers.get("Content-Type"), "application/json; charset=utf-8");
		// body is still JSON
		assertEquals(await r.json(), { x: 1 });
	});
});

// ─── Helper call forms ────────────────────────────────────────────────────────

describe("response helpers - four call forms", () => {
	// Test all four forms against one representative helper from each status group.
	// Exhaustive per-status-code status checks are in the section below.

	describe("no-arg → default text", () => {
		it("Ok()", async () => {
			const r = Ok();
			assertEquals(r.status, 200);
			assertEquals(await r.text(), "OK");
		});

		it("BadRequest()", async () => {
			const r = BadRequest();
			assertEquals(r.status, 400);
			assertEquals(await r.text(), "Bad Request");
		});

		it("NotFound()", async () => {
			const r = NotFound();
			assertEquals(r.status, 404);
			assertEquals(await r.text(), "Not Found");
		});

		it("InternalError()", async () => {
			const r = InternalError();
			assertEquals(r.status, 500);
			assertEquals(await r.text(), "Internal Server Error");
		});
	});

	describe("string → plain text body", () => {
		it("Ok(string)", async () => {
			const r = Ok("all good");
			assertEquals(r.status, 200);
			assertEquals(r.headers.get("Content-Type"), "text/plain;charset=UTF-8");
			assertEquals(await r.text(), "all good");
		});

		it("BadRequest(string)", async () => {
			const r = BadRequest("email is invalid");
			assertEquals(r.status, 400);
			assertEquals(await r.text(), "email is invalid");
		});
	});

	describe("object → auto-JSON body", () => {
		it("Ok(object) serializes to JSON", async () => {
			const r = Ok({ id: "1", name: "Alice" });
			assertEquals(r.status, 200);
			assertEquals(r.headers.get("Content-Type"), "application/json");
			assertEquals(await r.json(), { id: "1", name: "Alice" });
		});

		it("Created(object) serializes to JSON", async () => {
			const r = Created({ id: "new" });
			assertEquals(r.status, 201);
			assertEquals(r.headers.get("Content-Type"), "application/json");
			assertEquals(await r.json(), { id: "new" });
		});

		it("Ok(array) serializes to JSON", async () => {
			const r = Ok([1, 2, 3]);
			assertEquals(r.headers.get("Content-Type"), "application/json");
			assertEquals(await r.json(), [1, 2, 3]);
		});

		it("BadRequest(object) for structured errors", async () => {
			const r = BadRequest({ code: "INVALID", field: "email" });
			assertEquals(r.status, 400);
			assertEquals(r.headers.get("Content-Type"), "application/json");
			assertEquals(await r.json(), { code: "INVALID", field: "email" });
		});
	});

	describe("schema + data → validated JSON body with schema attached", () => {
		const UserSchema = s.object({ id: s.string(), name: s.string() });

		it("validates and serializes the data", async () => {
			const r = Ok(UserSchema, { id: "1", name: "Alice" });
			assertEquals(r.status, 200);
			assertEquals(r.headers.get("Content-Type"), "application/json");
			assertEquals(await r.json(), { id: "1", name: "Alice" });
		});

		it("attaches the schema to the response for documentation", () => {
			const r = Ok(UserSchema, { id: "1", name: "Alice" });
			assertEquals(r.schema, UserSchema);
		});

		it("throws SchemaError when data fails validation", () => {
			assertThrows(
				() => Ok(UserSchema, { id: 99 } as any),
				SchemaError,
			);
		});

		it("works with Created, BadRequest, etc.", async () => {
			const r = Created(UserSchema, { id: "2", name: "Bob" });
			assertEquals(r.status, 201);
			assertEquals(r.schema, UserSchema);
			assertEquals(await r.json(), { id: "2", name: "Bob" });

			const ErrSchema = s.object({ code: s.string() });
			const e = BadRequest(ErrSchema, { code: "MISSING_FIELD" });
			assertEquals(e.status, 400);
			assertEquals(e.schema, ErrSchema);
		});
	});
});

// ─── Status codes - every helper ─────────────────────────────────────────────

describe("response helpers - status codes", () => {
	const cases: [string, () => TypedResponse<unknown>, number][] = [
		["Ok", Ok, 200],
		["Created", Created, 201],
		["Accepted", Accepted, 202],
		["NoContent", NoContent, 204],
		["PartialContent", PartialContent, 206],
		["BadRequest", BadRequest, 400],
		["Unauthorized", Unauthorized, 401],
		["PaymentRequired", PaymentRequired, 402],
		["Forbidden", Forbidden, 403],
		["NotFound", NotFound, 404],
		["MethodNotAllowed", MethodNotAllowed, 405],
		["RequestTimeout", RequestTimeout, 408],
		["Conflict", Conflict, 409],
		["Gone", Gone, 410],
		["ContentTooLarge", ContentTooLarge, 413],
		["UnsupportedMediaType", UnsupportedMediaType, 415],
		["UnprocessableEntity", UnprocessableEntity, 422],
		["TooManyRequests", TooManyRequests, 429],
		["InternalError", InternalError, 500],
		["NotImplemented", NotImplemented, 501],
		["BadGateway", BadGateway, 502],
		["ServiceUnavailable", ServiceUnavailable, 503],
		["GatewayTimeout", GatewayTimeout, 504],
	];

	for (const [name, helper, status] of cases) {
		it(`${name}() → ${status}`, () => {
			assertEquals(helper().status, status);
			assertInstanceOf(helper(), TypedResponse);
		});
	}
});

// ─── Redirect helpers ─────────────────────────────────────────────────────────

describe("redirect helpers", () => {
	it("MovedPermanently sets Location and status 301", () => {
		const r = MovedPermanently("/new");
		assertEquals(r.status, 301);
		assertEquals(r.headers.get("Location"), "/new");
		assertInstanceOf(r, TypedResponse);
	});

	it("Found sets Location and status 302", () => {
		const r = Found("/login");
		assertEquals(r.status, 302);
		assertEquals(r.headers.get("Location"), "/login");
	});

	it("NotModified has no body and status 304", () => {
		const r = NotModified();
		assertEquals(r.status, 304);
		assertEquals(r.body, null);
	});

	it("TemporaryRedirect sets Location and status 307", () => {
		assertEquals(TemporaryRedirect("/tmp").status, 307);
		assertEquals(TemporaryRedirect("/tmp").headers.get("Location"), "/tmp");
	});

	it("PermanentRedirect sets Location and status 308", () => {
		assertEquals(PermanentRedirect("/perm").status, 308);
		assertEquals(PermanentRedirect("/perm").headers.get("Location"), "/perm");
	});
});

// ─── NoContent ────────────────────────────────────────────────────────────────

describe("NoContent", () => {
	it("returns 204 with null body", () => {
		const r = NoContent();
		assertEquals(r.status, 204);
		assertEquals(r.body, null);
		assertInstanceOf(r, TypedResponse);
	});
});

// ─── Router integration ───────────────────────────────────────────────────────

describe("response helpers in route handlers", () => {
	it("Ok(object) reaches the client as JSON", async () => {
		const router = new Router();
		router.route("/test").get(() => Ok({ hello: "world" }));

		const res = await router.handle(new Request("http://localhost/test"), {} as any);
		assertEquals(res.status, 200);
		assertEquals(res.headers.get("Content-Type"), "application/json");
		assertEquals(await res.json(), { hello: "world" });
	});

	it("Created(schema, data) validates and serializes", async () => {
		const router = new Router();
		const Schema = s.object({ id: s.string() });
		router.route("/items").post((_ctx) => Created(Schema, { id: "abc" }));

		const res = await router.handle(
			new Request("http://localhost/items", { method: "POST" }),
			{} as any,
		);
		assertEquals(res.status, 201);
		assertEquals(await res.json(), { id: "abc" });
	});

	it("schema validation failure in handler bubbles as 500", async () => {
		const router = new Router();
		const Schema = s.object({ id: s.string() });
		router.route("/bad").get(
			() => Ok(Schema, { id: 99 } as any),
		);

		const res = await router.handle(new Request("http://localhost/bad"), {} as any);
		// SchemaError thrown inside handler → caught by router → 500
		assertEquals(res.status, 500);
	});
});

// ─── .responds() on RouteConfigurator ────────────────────────────────────────

describe(".responds() - route response schema declaration", () => {
	it("stores response schemas on the route config", () => {
		const router = new Router();
		const UserSchema = s.object({ id: s.string() });
		const ErrSchema = s.object({ code: s.string() });

		router.route("/users")
			.get(() => Ok())
			.responds("get", { 200: UserSchema, 404: ErrSchema });

		// Inspect internal route config
		const config = [...router.rawRoutes].find(([p]) => p === "/users")?.[1];
		assertEquals(config?.responseSchemas["GET"][200], UserSchema);
		assertEquals(config?.responseSchemas["GET"][404], ErrSchema);
	});

	it("can declare response schemas for multiple methods independently", () => {
		const router = new Router();
		const ListSchema = s.array(s.object({ id: s.string() }));
		const ItemSchema = s.object({ id: s.string() });

		router.route("/users")
			.get(() => Ok())
			.responds("get", { 200: ListSchema })
			.post(s.object({ name: s.string() }), () => Created())
			.responds("post", { 201: ItemSchema });

		const config = [...router.rawRoutes].find(([p]) => p === "/users")?.[1];
		assertEquals(config?.responseSchemas["GET"][200], ListSchema);
		assertEquals(config?.responseSchemas["POST"][201], ItemSchema);
	});

	it("does not affect runtime response behaviour", async () => {
		const router = new Router();
		router.route("/ping")
			.get(() => Ok("pong"))
			.responds("get", { 200: s.string() });

		const res = await router.handle(new Request("http://localhost/ping"), {} as any);
		assertEquals(res.status, 200);
		assertEquals(await res.text(), "pong");
	});
});
