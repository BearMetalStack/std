---
name: type-export
description: Use this skill when auditing or fixing a BearMetal package's type exports — ensuring the package has a root types.ts that collects public types, is exported as a `<package>/types` subpath in deno.json, and is re-exported through mod.ts. Trigger on requests like "fix types export for this package", "audit type exports", "run the type export skill", or when adding a new package that needs this convention applied.
---

# Type export normalization

Every BearMetal package exposes its public types through a root-level `types.ts`,
importable both as a subpath (`@bearmetal/<package>/types`) and through the
package's `mod.ts`. This skill scans a package and brings it into line with
that convention.

## What "eligible" means

Pull a type into `types.ts` if it is:

- **Exported** — anything the package already exports counts.
- **Repeated verbosely** — a type shape (e.g. `() => JSX.Element`) written out
  inline in 2 or more different files in the package. Extract it to a named
  type alias (e.g. `type Renderer = () => JSX.Element`) and update every
  occurrence across those files to use the alias.
  - Repetition *within a single file* is a judgment call, not a strict
    trigger — use discretion based on whether the shape is clearly a
    recurring concept (worth naming) or coincidental.
- **Indirectly public** — a type not exported directly, but that shows up in
  the signature of something exported (e.g. a parameter or return type of a
  public function/class), such that a consumer would need it to use the
  public API correctly.

## What's excluded, no exceptions

- Anything that refers to a private type or value.
- Anything (type, value, or file) whose name starts with `__`.

If a candidate type touches one of these (e.g. it's built from a private
internal type), leave it where it is — don't pull it up just because it
also appears in a public signature. Note this case rather than silently
skipping it, in case the boundary needs to move instead.

## Handling an existing types.ts

**Never overwrite existing content in `types.ts`.** If the file already
exists:

- Only add types that aren't already present.
- If a type you'd otherwise pull up already exists there (even under a
  different name or slightly different shape), leave it as-is and don't
  duplicate it — flag the mismatch instead of guessing which is correct.
- Append, don't restructure, unless asked.

## Steps

1. **Locate the package root** — find its `deno.json` and `mod.ts` (if any).
2. **Scan all modules in the package** for:
   - existing exported types/interfaces
   - inline type literals repeated across 2+ files
   - types used in public function/class signatures but not themselves exported
3. **Filter** using the eligibility and exclusion rules above.
4. **Check for an existing `types.ts`** at the package root and read it before
   changing anything.
5. **Write or update `types.ts`**:
   - Add new eligible types (as new named exports).
   - For extracted repeated-shape types, replace the inline occurrences in
     their original files with references to the new named type, and import
     that type where needed.
   - Leave pre-existing content untouched.
6. **Update `deno.json`** to include, under `exports`:
   ```json
   "./types": "./types.ts"
   ```
   Add this alongside existing export entries; don't remove others.
7. **Update `mod.ts`** — if the package has a root `mod.ts`, add a re-export
   of everything from `types.ts` (e.g. `export * from "./types.ts";`) if not
   already present. If there is no `mod.ts`, skip this step entirely.
8. **Report** what was added, what was extracted-and-replaced, and anything
   flagged as ambiguous (name collisions, private-type boundary cases,
   possible duplicate types already in `types.ts`).

## Non-goals

- Don't touch types that are already correctly isolated to a single
  internal-only module.
- Don't rename existing public types to fit a naming scheme — this skill
  moves and collects types, it doesn't redesign the type API.
- Don't guess when a duplicate or near-duplicate is found in an existing
  `types.ts` — surface it instead.
