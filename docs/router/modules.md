# Modules

`Module<TState>` is a self-contained bundle of routes, middleware, and services. `Router` extends
it, so everything on this page works on a router too. `TState` describes what this module
contributes to `ctx.state` once mounted.

```ts
import { Module } from "@bearmetal/router";

function postsModule(): Module<{ db: DB }> {
	return new Module<{ db: DB }>()
		.route("/posts")
		.get(async (ctx) => Ok(await ctx.state.db.query("SELECT * FROM posts")));
}
```

Or as a class, which is the better shape once there is internal state to hold:

```ts
class PostsModule extends Module<{ db: DB }> {
	#db!: Service<DbActions>;

	constructor() {
		super();
		this.route("/posts").get(this.#list.bind(this));
		this.onAdopted((parent) => {
			try {
				this.#db = parent.getService(dbToken);
			} catch {
				return false;
			}
		});
	}

	#list = async () => Ok(await this.#db.invoke("query", "SELECT * FROM posts"));
}
```

## Mounting

`.use(module)` merges a module into a parent. The parent's state type accumulates the module's
contribution:

```ts
const router = new Router()
	.use(authModule()) // Router<{ user: User }>
	.use(dbModule()); // Router<{ user: User } & { db: DB }>
```

Under a path prefix:

```ts
router.use("/api/v1", apiModule());
```

Or through the route configurator, which is equivalent:

```ts
router.route("/auth").use(authModule());
```

Mounting is a **merge, not a delegation**. The module's routes are copied into the parent with their
paths joined, its services are registered on the parent, and its startup callbacks are appended to
the parent's. Nothing dispatches through the module at request time — after mounting there is one
flat route table.

Two consequences worth knowing. Routes declared with [`absoluteRoute()`](./routing#absoluteroute)
skip the path join and stay at the root. And because the merge copies rather than references,
mutating a module after mounting it does not retroactively change the parent.

## provides()

Registers a service on the module. When the module is mounted, the service becomes reachable from
`ctx.getService()` anywhere in the parent tree.

```ts
new Module()
	.provides(emailToken, createService({ send: sendEmail }));
```

On a `Router` the equivalent is `registerService(token, service)` — same effect, but it returns
`void` rather than `this`, so it does not chain.

See [Services](./services) for the token and typing side.

## Lifecycle

Two hooks, for two different problems: finding a dependency, and doing async work at startup.

```
.use(module)  ──▶ onAdopted(parent)  ─── returns false? retried at the next ancestor
                                     └── still false at ready()? throws
router.ready() ──▶ onAdopted final retry
               └─▶ onStart() ─── awaited, in mount order
```

### onAdopted()

Runs when the module is mounted, receiving the parent it was mounted on. Use it to locate a service
that lives somewhere up the tree.

Return `false` to defer. The callback is retried as the tree is assembled, each time against a
higher ancestor, and once more when the router becomes ready. This is what lets a module be mounted
before the module it depends on:

```ts
new Module()
	.onAdopted((parent) => {
		try {
			this.#db = parent.getService(dbToken);
		} catch {
			return false; // not registered yet — retry higher up
		}
	});
```

A callback still returning `false` at `ready()` throws immediately, at startup, rather than failing
on the first request that needed it.

### onStart()

Registers an async callback to run once, after every module is mounted and every `onAdopted` check
has resolved. This is where async initialization belongs — migrations, cache warming, opening
connections.

```ts
new Module()
	.onStart(async () => {
		await db.migrate();
	});
```

Callbacks are awaited in order. Combine the two hooks by having `onAdopted` capture the service and
`onStart` use it:

```ts
class SearchModule extends Module {
	#index!: Service<IndexActions>;

	constructor() {
		super();
		this.onAdopted((parent) => {
			try {
				this.#index = parent.getService(indexToken);
			} catch {
				return false;
			}
		});
		this.onStart(() => this.#index.invoke("rebuild"));
	}
}
```

### ready()

`router.ready()` runs the final `onAdopted` retries and awaits every `onStart` callback. Await it
before serving so startup errors surface at startup:

```ts
await router.ready();
Deno.serve(router.handle);
```

If you never call it, `handle` calls it on the first request instead — the work still happens
exactly once, but a failure shows up as a failed request rather than a failed boot. The promise is
memoized, so calling `ready()` repeatedly is free.

## AnyModule

Module instances carry hard-private (`#`) fields, which makes `Module` nominally typed: an instance
built against a different copy of the package — even the same version resolved through a different
specifier — fails both `instanceof` and structural assignability against `Module<any>`.

The router therefore accepts `AnyModule<TState>`, a structural interface describing the minimum
surface it needs, and duck-types with `isAnyModule()`. If you are writing something that accepts
modules from callers you do not control, accept `AnyModule` for the same reason.

```ts
import { type AnyModule, isAnyModule } from "@bearmetal/router";
```
