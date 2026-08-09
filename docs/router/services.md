# Services

A service is a named, typed bundle of actions that handlers retrieve with `ctx.getService()`. They
decouple where a capability is registered — in some module, at some depth — from where it is used,
which may be any handler anywhere in the tree.

```
authModule.provides(dbToken, dbService)
        │
        └─▶ mounted on router ──▶ service registered on the parent
                                        │
   any handler, any depth ◀─────────────┘  ctx.getService(dbToken)
```

## createServiceToken()

A token is a branded string carrying its action types, so `ctx.getService(token)` infers the full
`Service<T>` without a manual type argument.

```ts
import { createServiceToken } from "@bearmetal/router";

type EmailActions = {
	send: (to: string, subject: string, body: string) => Promise<void>;
	verify: (address: string) => boolean;
};

export const emailToken = createServiceToken<EmailActions>("email");
```

At runtime a token _is_ its name — `createServiceToken<T>("email")` returns the string `"email"`,
branded. Two tokens with the same name refer to the same service regardless of their declared types,
so pick names that will not collide across packages.

## createService()

Builds a `Service<T>` from a plain object of action functions. `T` is inferred from the object, so
`invoke` ends up fully typed.

```ts
import { createService } from "@bearmetal/router";

export const emailService = createService({
	send: async (to: string, subject: string, body: string) => {
		await smtp.send({ to, subject, body });
	},
	verify: (address: string) => checkMx(address),
});
```

Invoking an action that does not exist throws `Action "<name>" not found on service`.

## Registering

On a module, with `provides()`:

```ts
new Module().provides(emailToken, emailService);
```

On a router, with `registerService()`:

```ts
router.registerService(emailToken, emailService);
```

A module's services are registered on the parent when it is mounted, and continue upward as the
parent is itself mounted — so a service provided deep in the tree is reachable from the root.

## Using

```ts
const email = ctx.getService(emailToken);
await email.invoke("send", "user@example.com", "Welcome", "…");
```

`invoke` is typed from the token: the action name is checked against the declared keys, the
arguments against that action's parameters, and the return type flows through.

Passing a plain string works too, with an explicit type argument:

```ts
const email = ctx.getService<EmailActions>("email");
```

`getService` throws `Service "<name>" not registered` when nothing is registered under that name.
Inside an [`onAdopted`](./modules#onadopted) callback that throw is the signal to defer:

```ts
this.onAdopted((parent) => {
	try {
		this.#email = parent.getService(emailToken);
	} catch {
		return false; // retry against a higher ancestor
	}
});
```

## Why invoke() rather than plain methods

`Service<T>` exposes a single `invoke(action, ...args)` rather than the action functions directly.
The indirection is what lets a service be looked up by name at runtime while staying typed at
compile time — the token carries `T`, `invoke` projects it, and the implementation on the other side
is free to be a remote call, a mock, or a plain object.

If the extra call bothers you at a call site you use constantly, destructure it once:

```ts
const send = (to: string, subject: string, body: string) =>
	ctx.getService(emailToken).invoke("send", to, subject, body);
```
