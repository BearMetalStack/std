# API reference

```ts
import { ... } from "@bearmetal/diecast";
```

Subpaths: `@bearmetal/diecast/types`, `/manifest`, `/module`, `/init`.

## Building

### `diecast(router, config)`

```ts
function diecast(router: Router, config: DiecastConfig): Promise<GenerationReport>;
```

Generates a static site. Awaits `router.ready()` first, registers an [`onError`](/router/errors)
handler so failures can be explained, then enumerates, renders and writes. Returns a report rather
than exiting.

### `DiecastConfig`

| Field         | Type                | Default              |                                                            |
| ------------- | ------------------- | -------------------- | ---------------------------------------------------------- |
| `outDir`      | `string`            | —                    | directory to write into; created if absent                 |
| `origin`      | `string`            | `"http://localhost"` | origin the synthetic requests are made against             |
| `manifest`    | `Manifest`          | —                    | pages for parameterised routes                             |
| `outputStyle` | `"index" \| "flat"` | `"index"`            | [file layout](./output#layout)                             |
| `strict`      | `boolean`           | `false`              | stop at the first failure                                  |
| `concurrency` | `number`            | `8`                  | pages rendered in parallel                                 |
| `discover`    | `DiscoveryOptions`  | all on               | [what else to generate](./discovery)                       |
| `staticDirs`  | `{ dir, root }[]`   | `[]`                 | directories to copy that `serveDirectory` did not register |

### `GenerationReport`

```ts
type GenerationReport = {
	pages: GeneratedPage[]; // { url, file, status, contentType, bytes }
	failures: GenerationFailure[]; // { url, status?, error?, message }
	problems: ManifestProblem[]; // { kind, path, message }
	copiedDirs: string[]; // serveDirectory mounts copied, as root prefixes
	duration: number; // ms
	get ok(): boolean; // no failures and no problems
};
```

`ManifestProblem["kind"]` is
`"unknown-route" | "uncovered-route" | "missing-param" | "missing-out"`.

## The entry module

### `defineSite(site)`

```ts
function defineSite(site: SiteDefinition): SiteDefinition;
```

Identity at runtime; it exists for the types. `SiteDefinition` is
`DiecastConfig & { router: Router }`.

### `runDiecast(site, args?)`

```ts
function runDiecast(site: SiteDefinition, args?: string[]): Promise<void>;
```

Parses `args` (default `Deno.args`), runs `build` or `suggest`, and prints a report. Sets
`Deno.exitCode` rather than calling `Deno.exit`, so the report is not lost when stdout is piped.
Call it behind `import.meta.main`. See [CLI](./cli).

### `printReport(report)` / `printSuggestions(site)`

```ts
function printReport(report: GenerationReport): number; // returns an exit code
function printSuggestions(site: SiteDefinition): void;
```

The two halves of `runDiecast`, exported for custom tooling.

## Manifests

### `defineManifest(manifest)`

```ts
function defineManifest<const M extends Manifest<Extract<keyof M, string>>>(manifest: M): M;
```

Identity at runtime. The `const` capture plus the self-referencing constraint is what checks each
entry's `params` against `PathParams` of its own key. See [Manifest](./manifest).

```ts
type Permutation<P extends string> = {
	params: PathParams<P>;
	query?: Record<string, string | string[]>;
	out?: string; // required when `query` is set
};

type RouteManifestEntry<P extends string> = {
	permutations: Permutation<P>[] | (() => Permutation<P>[] | Promise<Permutation<P>[]>);
	skip?: boolean;
};
```

### Helpers

```ts
function resolvePermutations(entry: RouteManifestEntry): Promise<Permutation[]>;
function fillPath(pattern: string, params: Record<string, unknown>): string;
function withQuery(pathname: string, query: Permutation["query"]): string;
function checkManifest(
	m: Manifest | undefined,
	c: Map<string, RouteClassification>,
): ManifestProblem[];
function checkPermutation(pattern: string, permutation: Permutation): ManifestProblem[];
```

`fillPath("/md/:file", { file: "a b" })` → `"/md/a%20b"`. An omitted optional parameter drops its
segment.

## Classification

```ts
function classifyRoutes(router: AnyModule): Map<string, RouteClassification>;
function routesOfClass(c: Map<string, RouteClassification>, cls: RouteClass): RouteClassification[];
function manifestSkeleton(c: Map<string, RouteClassification>): string;
function paramsOf(path: string): string[];
```

```ts
type RouteClass = "static" | "needs-manifest" | "skip";
type RouteClassification = {
	path: string;
	class: RouteClass;
	reason?: string; // always set for "skip"
	params: string[];
};
```

Takes an `AnyModule`, and reads `rawRoutes` rather than `routeRegistry`, so a module built against
another copy of the router package still works. See [Routes](./routes).

## Writing

```ts
function writeResponse(
	res: Response,
	url: URL,
	opts: WriteOptions,
): Promise<{ file: string; bytes: number }>;
function outputPathFor(pathname: string, contentType: string | null, style?: OutputStyle): string;
function redirectShim(location: string): string;
function isHtml(contentType: string | null): boolean;
function extensionFor(contentType: string | null): string | undefined;
function normalizeContentType(contentType: string | null): string;
```

`WriteOptions` is `{ outDir, outputStyle?, out? }`. `writeResponse` consumes the body, so pass a
`clone()` if you still need it. A path that would escape `outDir` throws.

## Discovery

```ts
function discoverFrom(
	html: string,
	pageUrl: URL,
	opts?: { assets?: boolean; links?: boolean },
): { assets: URL[]; links: URL[] };
function extractReferences(html: string): PageReferences; // { assets, links }, unresolved
function inlineModuleImports(html: string): string[];
```

`pageUrl` should be the URL the page will be **served** at, which is not always the one it was
rendered from — see [Discovery](./discovery#where-a-specifier-resolves-to).

## Write-through

### `diecastModule(options)`

```ts
function diecastModule(opts: DiecastModuleOptions): Module;
```

| Field             | Type                       | Default   |                                                  |
| ----------------- | -------------------------- | --------- | ------------------------------------------------ |
| `outDir`          | `string`                   | —         | directory to snapshot into                       |
| `outputStyle`     | `"index" \| "flat"`        | `"index"` |                                                  |
| `allContentTypes` | `boolean`                  | `false`   | snapshot successful assets too, not only HTML    |
| `ignore`          | `(string \| URLPattern)[]` | `[]`      | paths to leave alone                             |
| `onError`         | `(error, url) => void`     | —         | writes are not awaited, so failures surface here |

Mount **before** the routes it should capture. See [Write-through](./write-through).

## Scaffolding

```ts
function init(dir?: string): Promise<string[]>; // "@bearmetal/diecast/init"
```

Writes `diecast.ts` and `diecast.manifest.ts`, skipping any that exist. Returns what it created.
