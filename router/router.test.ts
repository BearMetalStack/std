// deno-lint-ignore-file require-await no-explicit-any
import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import Router from "./router.ts";

describe("Router", () => {
	let router: Router;

	beforeEach(() => {
		router = new Router();
	});

	describe("Basic Routing", () => {
		it("should handle basic GET request", async () => {
			router.route("/test")
				.get(async () => new Response("test response"));

			const req = new Request("http://localhost/test", { method: "GET" });
			const res = await router.handle(req, {} as any);
			assertEquals(res.status, 200);
			assertEquals(await res.text(), "test response");
		});

		it("should return 404 for non-existent route", async () => {
			const req = new Request("http://localhost/nonexistent", { method: "GET" });
			const res = await router.handle(req, {} as any);
			assertEquals(res.status, 404);
		});

		it("should return 405 for unsupported method", async () => {
			router.route("/test").get(async () => new Response("test"));

			const req = new Request("http://localhost/test", { method: "POST" });
			const res = await router.handle(req, {} as any);
			assertEquals(res.status, 405);
		});
	});

	describe("Route Parameters", () => {
		it("should handle route parameters", async () => {
			router.route("/users/:id")
				.get(async (ctx) => new Response(ctx.params.id));

			const req = new Request("http://localhost/users/123", { method: "GET" });
			const res = await router.handle(req, {} as any);
			assertEquals(await res.text(), "123");
		});

		it("should handle multiple route parameters", async () => {
			router.route("/users/:userId/posts/:postId")
				.get(async (ctx) => new Response(JSON.stringify(ctx.params)));

			const req = new Request("http://localhost/users/123/posts/456", {
				method: "GET",
			});
			const res = await router.handle(req, {} as any);
			const params = JSON.parse(await res.text());
			assertEquals(params.userId, "123");
			assertEquals(params.postId, "456");
		});
	});

	describe("Middleware", () => {
		it("should execute global middleware", async () => {
			let middlewareExecuted = false;

			router.use(async (_ctx, next) => {
				middlewareExecuted = true;
				return await next();
			});

			router.route("/test").get(async () => new Response("test"));

			const req = new Request("http://localhost/test", { method: "GET" });
			await router.handle(req, {} as any);
			assertEquals(middlewareExecuted, true);
		});

		it("should execute path-specific middleware", async () => {
			let middlewareExecuted = false;

			router.use("/test", async (_ctx, next) => {
				middlewareExecuted = true;
				return await next();
			});

			router.route("/test").get(async () => new Response("test"));

			const req = new Request("http://localhost/test", { method: "GET" });
			await router.handle(req, {} as any);
			assertEquals(middlewareExecuted, true);
		});

		it("should handle middleware parameters", async () => {
			const capturedParams: Record<string, string | undefined> = {};

			router.use("/:version/.*", async (ctx, next) => {
				capturedParams.version = ctx.params.version;
				return await next();
			});

			router.route("/:version/test").get(async () => new Response("test"));

			const req = new Request("http://localhost/v1/test", { method: "GET" });
			await router.handle(req, {} as any);
			assertEquals(capturedParams.version, "v1");
		});

		it("should execute middleware in correct order", async () => {
			const order: number[] = [];

			router.use(async (_ctx, next) => {
				order.push(1);
				return await next();
			});

			router.use("/test", async (_ctx, next) => {
				order.push(2);
				return await next();
			});

			router.route("/test").get(async () => {
				order.push(3);
				return new Response("test");
			});

			const req = new Request("http://localhost/test", { method: "GET" });
			await router.handle(req, {} as any);
			assertEquals(order, [1, 2, 3]);
		});
	});

	describe("Nested Routers", () => {
		it("should handle nested routes", async () => {
			const apiRouter = new Router();
			apiRouter.route("/test").get(async () => new Response("api test"));

			router.use("/api", apiRouter);

			const req = new Request("http://localhost/api/test", { method: "GET" });
			const res = await router.handle(req, {} as any);
			assertEquals(await res.text(), "api test");
		});

		it("should handle nested routes with parameters", async () => {
			const apiRouter = new Router();
			apiRouter.route("/users/:id")
				.get(async (ctx) => new Response(ctx.params.id));

			router.use("/api/:version", apiRouter);

			const req = new Request("http://localhost/api/v1/users/123", {
				method: "GET",
			});
			const res = await router.handle(req, {} as any);
			assertEquals(await res.text(), "123");
		});

		it("should handle nested middleware", async () => {
			const apiRouter = new Router();
			let middlewareExecuted = false;

			apiRouter.use(async (_ctx, next) => {
				middlewareExecuted = true;
				return await next();
			});

			apiRouter.route("/test").get(async () => new Response("test"));
			router.use("/api", apiRouter);

			const req = new Request("http://localhost/api/test", { method: "GET" });
			await router.handle(req, {} as any);
			assertEquals(middlewareExecuted, true);
		});
	});

	describe("Context State", () => {
		it("should maintain state across middleware chain", async () => {
			router.use(async (ctx, next) => {
				ctx.state.test = "value";
				return await next();
			});

			router.route("/test")
				.get(async (ctx) => new Response(ctx.state.test as string));

			const req = new Request("http://localhost/test", { method: "GET" });
			const res = await router.handle(req, {} as any);
			assertEquals(await res.text(), "value");
		});
	});

	describe("Error Handling", () => {
		it("should handle errors in handlers", async () => {
			router.route("/error").get(async () => {
				throw new Error("Test error");
			});

			const req = new Request("http://localhost/error", { method: "GET" });
			const res = await router.handle(req, {} as any);
			assertEquals(res.status, 500);
			assertEquals(await res.text(), "Internal Server Error");
		});

		it("should handle errors in middleware", async () => {
			router.use(async () => {
				throw new Error("Middleware error");
			});

			router.route("/test").get(async () => new Response("test"));

			const req = new Request("http://localhost/test", { method: "GET" });
			const res = await router.handle(req, {} as any);
			assertEquals(res.status, 500);
		});

		it("should handle no handlers returning a response", async () => {
			router.get("/test", async () => undefined as unknown as Response);
			const req = new Request("http://localhost/test", { method: "GET" });
			const res = await router.handle(req, {} as any);
			assertEquals(res.status, 501);
		});
	});

	describe("HTTP Methods", () => {
		const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];

		methods.forEach((method) => {
			it(`should handle ${method} requests`, async () => {
				const route = router.route("/test");
				(route[method.toLowerCase() as keyof typeof route] as (...args: any[]) => unknown)(
					async () => new Response(method),
				);

				const req = new Request("http://localhost/test", { method });
				const res = await router.handle(req, {} as any);
				assertEquals(res.status, 200);
				assertEquals(await res.text(), method);
			});
		});
	});
});
