# API reference

Every export, grouped by specifier. Prose and worked examples live on the other pages; this is the
lookup table.

## `@bearmetal/bmql`

### Evaluating

```ts
evaluate(root: unknown, query: string | Query, options?: EvaluateOptions): Location[]
values(root: unknown, query: string | Query, options?: EvaluateOptions): unknown[]
```

Runs a query and returns every location it lands on, or just the values. Never throws on the shape
of the data. See [Queries](./queries).

```ts
format(root: unknown, pipeline: string | Pipeline, options?: FormatOptions): string
hasTemplate(pipeline: string | Pipeline): boolean
```

Runs a pipeline and returns it as text; whether a pipeline has a template stage. See
[Pipes and text](./pipes).

### Reactive

```ts
compute(root, query, options?: EvaluateOptions): Signal.Computed<Location[]>
computeValues(root, query, options?: EvaluateOptions): Signal.Computed<unknown[]>
computeText(root, pipeline, options?: FormatOptions): Signal.Computed<string>
unwrapSignal(value: unknown): unknown
```

`evaluate`, `values` and `format` inside a `Signal.Computed`, parsed up front. `compute` and
`computeValues` only report a change when the result differs. `unwrapSignal` reads through
`Signal.State` and `Signal.Computed`, nested ones included — the default `unwrap`. See
[Signals](./signals).

### Parsing

```ts
parse(source: string): Query
parsePipeline(source: string): Pipeline
parseAt(source: string, offset: number): { query: Query; end: number }
parsePipelineAt(source: string, offset: number, close: string): { pipeline: Pipeline; end: number }
```

`parse` and `parsePipeline` take a whole string (surrounding whitespace allowed) and are memoized by
it. `parseAt` reads one query starting at `offset` and stops at the first character that can't
continue it, whitespace included. `parsePipelineAt` reads a pipeline that ends at `close` — `"}}"`,
say — finding the end by parsing rather than searching, so `{name:Sel}}}` closes after the filter;
`end` is the index after `close`.

```ts
class BmqlSyntaxError extends SyntaxError {
	readonly source: string;
	readonly offset: number;
}
```

### Options

```ts
interface EvaluateOptions {
	vars?: Record<string, unknown>; // values for $name in filters; may be signals
	self?: unknown; // what $ starts at; default the root
	unwrap?: (value: unknown) => unknown; // applied to every value read; default unwrapSignal
}

interface FormatOptions extends EvaluateOptions {
	block?: boolean; // join with "\n" instead of ", "
	onWarn?: (message: string) => void; // default console.warn, once per message
}
```

### Results

```ts
interface Location {
	parent?: object;
	key?: string | number;
	value: unknown;
	cell?: unknown; // the signal parent[key] holds, when unwrap read through one
	up?: Location; // the location of parent
}
```

### AST

```ts
interface Query {
	source: string;
	relative: boolean; // starts at $
	steps: Step[];
}

type Step =
	| { kind: "key"; key: string; offset: number }
	| { kind: "filter"; predicates: Predicate[]; offset: number }
	| { kind: "slice"; start?: number; end?: number; index: boolean; offset: number };

type Predicate =
	| { kind: "presence"; field: string[]; negate: boolean }
	| { kind: "compare"; field: string[]; op: CompareOp; value: Operand };

type CompareOp = "=" | "!=" | ">" | ">=" | "<" | "<=" | "~";
type Operand = { kind: "literal"; value: string } | { kind: "var"; name: string };

interface Pipeline {
	source: string;
	query: Query;
	stages: Stage[];
}

type Stage =
	| { kind: "separator"; value: string; offset: number }
	| { kind: "template"; parts: (string | Query)[]; offset: number };
```

The step and stage shapes are exported as named interfaces too: `KeyStep`, `FilterStep`,
`SliceStep`, `PresencePredicate`, `ComparePredicate`, `SeparatorStage`, `TemplateStage`.

## `@bearmetal/bmql/clawmark`

```ts
bmqlRules(root: unknown, options?: BmqlRuleOptions): StagedRule[]
bmqlTemplateRule(root: unknown, options?: BmqlRuleOptions): PreparseRule
bmqlEscapeRule(): AnyRule
bmqlValueRule(root: unknown, options?: BmqlRuleOptions): AnyRule
bindQueries(container: ParentNode, root: unknown, options?: BmqlRuleOptions): () => void

const VALUE_TAG = "bmql:value";
interface ValueData {
	query: string; // the pipeline between the braces, as written
}
type BmqlRuleOptions = Omit<FormatOptions, "block">;
```

`bmqlRules` returns the template, escape and value rules, in that order; put them before
`defaultRules()`. See [In clawmark](./clawmark).

## `@bearmetal/bmql/store`

```ts
class Store {
	readonly root: Signal.State<Record<string, Signal.State<unknown[]>>>;
	readonly tables: string[];
	table<T>(name: string, schema?: Schema<T>): Table<T>;
	query(query, options?: EvaluateOptions): Location[];
	values(query, options?: EvaluateOptions): unknown[];
	update(query, value: Update, options?: WriteOptions): number;
	merge(query, patch: object, options?: WriteOptions): number;
	delete(query, options?: WriteOptions): number;
}

class Table<T> {
	readonly rows: Signal.State<T[]>;
	readonly store: Store;
	readonly name: string;
	readonly schema?: Schema<T>;
	insert(...rows: T[]): T[];
	query(query, options?): Location[];
	values(query, options?): unknown[];
	update(query, value: Update, options?: WriteOptions): number;
	merge(query, patch: Partial<T>, options?: WriteOptions): number;
	delete(query, options?: WriteOptions): number;
}

interface WriteOptions extends EvaluateOptions {
	limit?: number; // default: every match
}

// a new value, or a function from the current value to one
type Update =
	| ((current: unknown, location: Location) => unknown)
	| string
	| number
	| boolean
	| bigint
	| null
	| undefined
	| object;
```

Store methods start at `root`, table methods at `rows`. Writes return how many matches they wrote.
See [Store](./store).

```ts
class WriteBatch {
	set(location: Location, value: unknown): void;
	remove(location: Location): void; // array removals apply at commit
	commit(): void;
	rollback(): void; // restores every signal set; in-place writes stay
	readonly changed: ReadonlyMap<Signal.State<unknown>, unknown>; // signal -> previous value
}
```
