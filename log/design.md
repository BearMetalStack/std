# BearMetal Logger — Context System Design Spec

Status: parked, revisit later. Captured from a design conversation on 2026-06-16.

## Goal

A logging library where log calls can carry a "current context" label without manually threading a
context object through every function signature, while remaining correct under concurrent async
operations (multiple requests/tasks interleaving on the event loop).

## Core primitive: context tree

Context is a tree of immutable nodes, not a flat stack:

```ts
type ContextNode = {
	label: string;
	parent: ContextNode | null;
};

const ROOT: ContextNode = { label: "_ROOT_", parent: null };
```

Each `withContext(label)` call creates a _new_ node pointing at whatever was current, rather than
mutating a shared array. This is what makes it safe for branching/concurrent use — nodes are never
mutated after creation, so two concurrent branches pushing from the same parent can't corrupt each
other, they just both produce a sibling pointing at the same parent.

`contextPath(node)` walks `parent` links to reconstruct the full chain for verbose/structured output
(e.g. `["_ROOT_", "contextB", "contextA"]`).

## Two-tier API

### Tier 1 — `callWithContext` (async-safe boundary, rare, mostly invisible)

The _only_ place that actually touches `AsyncLocalStorage` / `AsyncContext.Variable`'s `.run()`.
This is what makes context propagation survive `await` and concurrent interleaving correctly —
`run(store, fn)` ties the store value to `fn`'s entire causal descendants, including continuations
after internal awaits, which is the one thing JS gives us for this and the only thing that actually
works here (confirmed: no userland trick bypasses this; this is the real, load-bearing primitive).

```ts
function callWithContext<T>(label: string, fn: () => T | Promise<T>): T | Promise<T> {
	const node: ContextNode = { label, parent: storage.getStore() ?? ROOT };
	return storage.run(node, fn);
}
```

Typically lives in router/middleware layer, called once per request
(`log.callWithContext("request:" + req.id, () => handler(req))`), invisible to most users. Exposed
in the `log` namespace for cases where a user explicitly needs a new async-safe boundary inside
their own async code (e.g. spawning a detached background task that needs its own context lineage).

### Tier 2 — `withContext` + `using` (sync-only, ergonomic, common)

```ts
function withContext(label: string) {
	const node: ContextNode = { label, parent: currentNode() };
	const previous = currentNode();
	setCurrentNode(node);
	return {
		[Symbol.dispose]() {
			// optional correctness check — see Open Questions
			setCurrentNode(previous);
		},
	};
}
```

Usage:

```ts
function contextA() {
	using ctx = log.withContext("contextA");
	logContext(); // "Hello from contextA"
}
```

Safe specifically because: synchronous JS execution cannot be preempted, so as long as nothing in
the call tree between `using` and scope-exit awaits anything, no other code can run "in between"
pushes/pops to corrupt the current-node pointer. This pointer read/write should still route through
whatever `callWithContext` already established for the current async scope (not a fully separate
global), to narrow the blast radius of misuse to a single request/span rather than the whole
process.

## The documented footgun

**Rule: a `using withContext(...)` block must not contain an `await`, including transitively in
anything it calls.**

If it does, the cheap sync push/pop can interleave with other code running during the suspended
await, corrupting the current-context pointer (classic shared-mutable-state-plus-yield-point race).
This is a deliberate, accepted tradeoff — the alternative (every `withContext` call paying the full
`run()` cost) defeats the ergonomic point of having `using`-based sugar at all.

**Escape hatch:** if a context needs to wrap async work, use
`callWithContext(label, async () => {...})` instead of `withContext` for that specific scope. This
is the explicit, async-safe, slightly more boilerplate-y sibling — same naming family so it's
discoverable as "the version for when withContext doesn't apply."

## Open questions / nice-to-haves for later

- **Misuse detection:** at `[Symbol.dispose]()` time, compare "the node I'm about to restore to"
  against "what's actually current right now." A mismatch means something mutated context state
  during a suspension — i.e., proof the footgun was triggered. Worth throwing or at minimum
  console-warning here rather than silently restoring the wrong thing.
- **`log.context`** should probably expose both the innermost label (for short inline messages, per
  the original example) and the full path array (for structured/verbose output) — don't collapse to
  just one.
- Revisit if/when `tc39/proposal-async-context-disposable` lands — that would let
  `callWithContext`-style boundaries be `using`-compatible too, removing the need for the two-tier
  split entirely. Check Deno's adoption status when picking this back up; as of this writing it's
  proposed but not implemented (the base `AsyncContext.Variable`, non-disposable, _is_ implemented
  and stage 2).
- Decide whether `withContext`'s current-node storage should be a plain variable scoped per `run()`
  call (requires storing it _inside_ the node `run()` provides, e.g. a mutable cell referenced from
  the store value) vs. some other mechanism — affects how contained the footgun's blast radius
  actually is.

## Half-formed lead, not yet rejected — reference-counted "wait to relinquish current"

Idea: instead of an event bus trying to _recover_ from corruption (rejected, see below), each node
tracks its own live children (increment on child `withContext`, decrement on child dispose) and
refuses to mark itself non-current until (a) all children have disposed AND (b) it observes itself
as the actual current node again. Bus/event mechanism is just the notification layer for "recheck
your condition."

Genuinely more interesting than the plain "watch for parent" version, but has a real unresolved
problem: `[Symbol.dispose]()` is synchronous (using, not await using), so it can't actually
block/await on that condition without either (a) becoming async itself, which breaks using's
deterministic-cleanup guarantee and reintroduces a race in the gap between "dispose returns" and
"bus settles the pointer," or (b) only mattering in misuse cases, where there may be no future state
where the condition becomes true without unrelated concurrent work finishing first — risk of
effectively deadlock-shaped waiting for a violation that wasn't this node's to fix.

Not fully dead, but current belief: detection (loud failure on mismatch) is cheaper, safer, and more
honest than negotiation (waiting to become current again). Revisit only if dispose-time mismatch
detection in practice proves too noisy/frequent and an actual recovery mechanism feels worth the
complexity.

## Explicitly decided against (and why)

- **Fully automatic/inferred context with no API at all** — not achievable without either a
  build-time transform (rewrites bare identifiers into real imports/wrapped calls at publish time)
  or new language/engine primitives that don't exist yet. Possible in principle, not worth building
  given current scope/energy. Logger ships with explicit context, like every other logger.
- **Ambient ES module imports / `import implicit`** — interesting language design fiction, not
  buildable without compiler tooling BearMetal doesn't want to take on. Parked indefinitely, not
  logger-blocking.
- **Pure `using`-only design with no `callWithContext` tier** — breaks under concurrency the moment
  anything awaits inside a context block, no way around this without `run()`-equivalent somewhere in
  the design.
