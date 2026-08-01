# BearMetal MCP Server — Spec

Status: design draft Scope: local, per-project MCP server shipped as `bearmetal mcp`, run via stdio
by Claude Code (or any MCP client). No long-lived daemon — spawned per session, stateless
in-process, all durable state on disk.

---

## 1. Goals

- Expose BearMetal-specific domain logic (scaffolding, doc lookup, project introspection) as typed,
  reliable MCP tools rather than relying on Claude re-deriving BearMetal conventions from prose each
  session.
- Keep the server cheap to start and safe to restart constantly — no expensive in-memory-only state,
  no assumption of a single long-running process.
- Support multiple concurrent processes against the same repo (e.g. two Claude Code sessions open at
  once) without requiring a central coordinator.
- Encode fiddly, error-prone logic (type eligibility scanning, doc discovery, jsdoc-gap detection)
  once, as tested code — not as instructions the model reinterprets each time.

## 2. Non-goals

- Not a general-purpose CLI wrapper. Anything that's just "run a shell command and return stdout"
  belongs in a skill, not this server — no value added by wrapping it.
- Not a replacement for CLAUDE.md/skills. This server complements them: skills tell Claude _when_
  and _why_ to prefer these tools; the server provides the tools themselves.
- Not a shared/remote service. Each developer runs their own local instance against their own
  working copy.

## 3. Transport & lifecycle

- **Transport:** stdio (JSON-RPC 2.0), per MCP spec.
- **Invocation:** `bearmetal mcp` — a subcommand on the existing BearMetal tooling CLI. Claude Code
  spawns this as a subprocess per session.
- **Registration:** one-time, per-project or global, via
  `claude mcp add
  bearmetal -- bearmetal mcp` or an `.mcp.json` entry. Not something Claude is
  instructed to do at runtime — it's config, done ahead of time.
- **Process lifetime:** exactly one Claude Code session's worth. No persistent daemon. Server must
  tolerate being started and killed constantly with no cleanup step required for correctness
  (best-effort cleanup only, see §6).

## 4. Tool categories

### 4.1 Scaffolders / generators

Encode "what does a correct BearMetal X look like," not just file templating.

- `create_router_module(packageName, routes?)` — scaffold a new router module with routes/handlers
  and types.ts wiring.
- `create_component(packageName, name, ...)` — scaffold a new component following BMElement
  conventions.
- `create_color_scheme(seedColors)` — generate a full OKLCH-based color scheme (ramps, neutral
  ranges, semantic aliases) from provided seed colors, following the existing `--color-bearmetal-*`
  namespace convention. Returns structured stop data, not just files.

(List will grow — this is the highest-value category and the main differentiator of the server.)

### 4.2 Documentation lookup

- `search_docs(query, scope?: "guide" | "api" | "all")` — general-purpose search across the docs
  corpus. Single tool, scope as a parameter rather than separate tools per section (avoids ambiguous
  tool selection between near-identical tools).
- `query_api_docs(apiName)` — exact-name lookup for a specific API reference entry. Distinct from
  `search_docs` because it's a lookup by known identifier, not a fuzzy/semantic search, and returns
  structured data (signature, params, return type, description, examples) rather than prose
  excerpts.

### 4.3 Project introspection

Tools that do the _finding_; the model still does the _writing/deciding_.

- `find_undocumented(packageName)` — AST walk for exported symbols missing jsdoc. Returns structured
  `{file, symbol, kind, signature}[]`. The model reads this list and writes the actual docstrings —
  the tool doesn't generate documentation itself.
- `scan_package_types(packageName)` — implements the type-export eligibility rules (see type-export
  skill) as a real AST-based scan rather than model-driven judgment. Returns eligible types,
  extraction candidates (repeated inline shapes across files), and any conflicts with existing
  `types.ts` content, for the model to act on.

## 5. Indexing & caching

Two distinct kinds of index, with different lifetimes — do not conflate.

### 5.1 Docs index

- Backs `search_docs` / `query_api_docs`.
- Built once per docs version, not once per process boot. Cached to disk, keyed by a content hash of
  the docs corpus (or version tag).
- A process checks the hash on boot; if unchanged, reads the existing index from disk. If changed,
  rebuilds. Never rebuilt "just because the process started."

### 5.2 Project structure cache

- Backs project introspection tools — tracks known BearMetal-specific directories (`.bearmetal`,
  `@components`, `@views`, `@api`, etc.) so tools don't need to crawl the project on every call.
- **Source of truth:** BearMetal's own tooling (scaffolders, CLI) records what it creates. The cache
  is authoritative for anything the tooling itself controls — no invalidation needed for tool-caused
  changes, since the tool always knows what it just did.
- **Gap:** manual/out-of-band changes (hand-created directories, git operations) aren't seen by the
  tooling that made them. Handled by background revalidation (§5.3), not by treating the cache as
  untrustworthy.
- Fresh AST walks (e.g. for `find_undocumented`) are not cached in-memory per session by default —
  walks are assumed cheap enough per-package that correctness (not returning stale results) wins
  over speculative caching. Revisit only if a specific package's scale makes repeated walks
  measurably slow.

### 5.3 Background revalidation

- A lightweight worker checks known directories for drift (existence, mtime) against the cache on
  every run. Cheap by design — a stat/diff, not a full re-crawl — specifically so it can run
  unconditionally rather than being skippable under load.
- On finding drift, the worker updates the cache and fires an invalidation event (§6) rather than
  silently patching in a way other in-flight tools can't react to.

## 6. Cross-process coordination

Multiple `bearmetal mcp` processes may run concurrently against the same repo (e.g. two Claude Code
sessions). Since processes don't share memory, coordination is filesystem-based.

### 6.1 Invalidation events (in-process)

- Within a single process, cache-sensitive tools can subscribe to an invalidation event (e.g.
  `cache.addEventListener("invalidate", ...)`), carrying enough scope info
  (`{ scope: "@api", type: "added" | "removed" |
  "moved" }`) that unaffected tools can cheaply
  ignore it rather than retrying unnecessarily.
- Cache-sensitive tools should check for a pending invalidation immediately before returning a
  result, not only react to the event mid-flight — guards against a result already having been
  returned by the time an invalidation lands.

### 6.2 Cross-process broadcast (`.bearmetal/index/inflight/`)

- Each process may discover or create BearMetal-relevant structure independently. Rather than
  diffing against unknown prior state, each process **asserts facts it has found or made** —
  positive, idempotent statements ("`@api` exists," "`@components/Foo` was created") — so
  application order across processes doesn't matter and duplicate/repeated assertions are harmless
  no-ops.
- A process ignores an inflight entry if its own cache already reflects that fact. It still writes
  its own discoveries even if no other _current_ process needs them, since a future process (spawned
  later) has no other way to learn them.
- **Structure:**
  - `inflight/tenants/<pid-or-id>` — one file per live process, acting as a liveness marker.
  - Assertion entries are written per-process (mechanism TBD — could be a per-process log file under
    `inflight/`, folded on compaction).
- **Compaction / cleanup:**
  - Before exiting, a process removes its own tenant file.
  - It then checks whether `inflight/tenants/` is empty. If so, it is the last live process and
    performs compaction: folding accumulated assertions into the canonical on-disk cache and
    clearing folded entries.
  - No separate "owner" role — "last tenant standing" performs cleanup, determined by tenant-file
    presence at exit time, not a claimed role.
  - **Known gap (accepted for v1):** a hard-killed process leaves an orphaned tenant file, which can
    prevent any future process from ever seeing itself as "last" and therefore skip compaction. No
    liveness/heartbeat check is implemented yet. Acceptable initial gap; revisit if orphaned tenants
    become a practical problem.
  - Compaction is expected to be idempotent (re-applying already-folded assertions is harmless), so
    the narrow race where two processes both observe themselves as "last" and both compact
    concurrently is considered acceptable rather than actively guarded against.

## 7. Open questions / not yet decided

- Exact on-disk format for inflight assertion entries (log-per-process vs. single append-only file
  with pid tags, etc.).
- Full list of scaffolder tools beyond the initial three examples.
- Whether `scan_package_types` output feeds back into updating the type-export skill, replaces it,
  or the two stay complementary (skill drives the workflow, tool does the scanning).
- Structured-content return shape conventions across tools (e.g. consistent use of MCP
  `structuredContent` vs. plain text for anything meant to be used programmatically by the calling
  model).
