# Error handling

When a handler or middleware throws, the router catches it and answers `500 Internal Server Error`.
On its own that is all you get — no log, no stack, no way to tell a crashing template from a
deliberate failure.

`onError` is the hook that gets you the error itself.

```ts
router.onError((error, ctx) => {
	console.error(`${ctx.request.method} ${ctx.url.pathname} failed:`, error);
});
```

## Observing versus answering

A handler's return value decides which it is doing.

**Return nothing** and it is observe-only: the error passes to the next handler, and the router
still produces its own 500. This is what a logger or a reporter wants.

**Return a `Response`** and that response is sent. No further handlers run.

```ts
router
	.onError((error, ctx) => {
		metrics.increment("error", { path: ctx.url.pathname }); // observes
	})
	.onError((error) => {
		if (error instanceof NotAuthorized) return Forbidden("Nope"); // answers
		// falls through to the 500 for anything else
	});
```

Handlers run in registration order, so put your logging first and your error pages after. Handlers
may be `async`.

## Handlers cannot mask each other

A handler that throws is caught on its own, logged, and skipped — the original error still reaches
the remaining handlers, and the request still gets a response. A broken logger degrades your
reporting, not your app.

## Registering from a module

`onError` is on `Module`, not just `Router`, and handlers bubble up to the root when the module is
mounted — the same way `onStart` callbacks do. A feature module can report its own errors without
its consumer wiring anything:

```ts
export function billingModule(): Module {
	const mod = new Module();
	mod.onError((error, ctx) => {
		if (ctx.url.pathname.startsWith("/billing")) reportToSentry(error);
	});
	return mod;
}
```

Handlers are copied to the parent at mount time, so register them before the module is `.use()`d.

## The default

With no handler registered, the router logs the error to the console **in development only**
(`BEARMETAL_ENV`; see `isDev`) and answers 500. In production it stays silent, on the assumption
that a deployed app wants its own reporting rather than stderr noise. Register a handler and the
default log stops — you are handling it now.

## Errors this does not catch

`onError` covers the middleware chain. A request body that fails schema validation is answered
`400 Bad Request` before the chain runs, and never reaches it — that is a rejected request, not a
crash. See [Request validation](./validation).

## Static generation

[`@bearmetal/diecast`](/diecast/) registers an `onError` handler when it builds, which is how it
reports `handler threw: <message>` for a broken page instead of an unexplained 500. It is a good
illustration of the observe-only shape: diecast wants the cause for its report, not to change what
the router answers.
