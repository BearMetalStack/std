# Trusted modules

Routes under `/@bearmetal/*` are reserved. Only a `TrustedModule` — a module that names itself — may
register them.

```ts
import { TrustedModule } from "@bearmetal/router";

class ComponentsModule extends TrustedModule {
	constructor() {
		super("@bearmetal/components");
		this.route("/@bearmetal/components").get(serveBundle);
	}
}
```

The class is exported on purpose, and any package can subclass it.

## This is not a security boundary

A module you `.use()` already executes arbitrary code in your process. It could patch
`Router.prototype` directly and never touch this mechanism at all. Nothing here prevents that, and
nothing here is trying to.

What the name buys is **attribution and noise**:

- Every reserved route a trusted module takes is announced in yellow, once, at the point it is
  mounted. Framework packages claiming framework paths is expected; seeing an unfamiliar name claim
  one is the signal.
- When two different classes claim the same trusted name — the shape impersonation takes — the
  router prints a large red alarm naming both constructors, refuses the registration, and records a
  warning.
- Accumulated warnings make `router.handle` throw, so an application with an unresolved collision
  refuses to serve rather than starting in an ambiguous state.
- A name merely _similar_ to an existing claim raises a warning too, on the theory that
  `@bearmetal/cornponents` is not a typo anyone made by accident.

## Naming

The name is passed to `super()` and must be a non-empty string; an empty or missing one throws at
construction:

```
A TrustedModule must name itself: super("@your-scope/thing").
Unnamed modules cannot register routes under /@bearmetal.
```

The **subclass's own name** is what gets reported, so an anonymous class produces a useless audit
trail. Give it a real name.

Subclass `TrustedModule`; do not instantiate it directly — it is abstract.

## How claims travel

Claims and warnings bubble upward as modules are mounted. A sub-router mounted three levels down
carries its trusted claims and any violations up through each `resolveModuleStack` merge until they
reach the root, which is where the `handle` check reads them. Without that propagation a violation
below the root would never be seen.

Handlers on reserved routes are tagged with the declaring module at their _deepest_ merge, so the
attribution survives bubbling. Re-tagging at every level would launder the trust onto whatever
ordinary `Module` happened to carry it upward.

## In practice

Two modules in the stack claim reserved names today:

| Module                  | Claims                  |
| ----------------------- | ----------------------- |
| `ForagerModule`         | `@bearmetal/forager`    |
| `StackComponentsModule` | `@bearmetal/components` |

Unless you are building framework-level tooling that needs a well-known path, you do not need a
trusted module. Ordinary [modules](./modules) can register anything outside the reserved prefix, and
that is nearly always the right choice — a feature that owns its own URL space has no reason to
reach into someone else's.
