/**
 * @module
 * Public types for BMQL: the query AST, evaluation results and options.
 */

/** A parsed query: a chain of steps applied to a set, left to right. */
export interface Query {
	/** The source text the query was parsed from. */
	source: string;
	/** True when the query starts at `$` (the current item) rather than the root. */
	relative: boolean;
	steps: Step[];
}

/** One link in a query chain. */
export type Step = KeyStep | FilterStep | SliceStep;

/** `.name` / `."odd key"`: the key on each member of the set. Arrays flatten into the set. */
export interface KeyStep {
	kind: "key";
	key: string;
	offset: number;
}

/** `{a:b, c}`: keeps the members that satisfy every predicate. */
export interface FilterStep {
	kind: "filter";
	predicates: Predicate[];
	offset: number;
}

/** `[i]` or `[a..b]`: indexes or slices the set. `[i]` is `[i..i+1]`. */
export interface SliceStep {
	kind: "slice";
	/** Inclusive start; negative counts from the end. Omitted: 0. */
	start?: number;
	/** Exclusive end; negative counts from the end. Omitted: the set's length. */
	end?: number;
	/** True for `[i]`, so `[-1]` means the last member rather than `[-1..]`. */
	index: boolean;
	offset: number;
}

/** A comparison inside a filter. */
export type Predicate = PresencePredicate | ComparePredicate;

/** `{field}` (present and non-null) or `{!field}` (absent or null). */
export interface PresencePredicate {
	kind: "presence";
	field: string[];
	negate: boolean;
}

/** Operators a comparison predicate can use. `=` is spelled `field:value`. */
export type CompareOp = "=" | "!=" | ">" | ">=" | "<" | "<=" | "~";

/** `{field:value}`, `{field:>3}`, `{field:$var}`... */
export interface ComparePredicate {
	kind: "compare";
	field: string[];
	op: CompareOp;
	value: Operand;
}

/** The right-hand side of a comparison. */
export type Operand =
	| { kind: "literal"; value: string }
	| { kind: "var"; name: string };

/**
 * A place a query landed: the value, plus the container and key it was read
 * from, so a caller can write back through it. The root itself has neither.
 */
export interface Location {
	parent?: object;
	key?: string | number;
	value: unknown;
	/**
	 * What `parent[key]` actually holds, when `unwrap` read through it - the
	 * `Signal.State` a value came out of, say. Write to this rather than to
	 * `parent[key]` to keep the signal.
	 */
	cell?: unknown;
}

/** Options for `evaluate`. */
export interface EvaluateOptions {
	/** Values for `$name` operands in filters. */
	vars?: Record<string, unknown>;
	/** What `$` refers to at the start of a relative query. Default: the root. */
	self?: unknown;
	/**
	 * Applied to every value before it is read: the root, each key's value,
	 * each array element, each variable. Default: `unwrapSignal`, which reads
	 * through `Signal.State` and `Signal.Computed`. Pass `(v) => v` to treat
	 * signals as opaque values.
	 */
	unwrap?: (value: unknown) => unknown;
}

/** A query followed by `>>` stages: `characters{class:rogue} >> | $.name | >> "\n"`. */
export interface Pipeline {
	/** The source text the pipeline was parsed from. */
	source: string;
	query: Query;
	stages: Stage[];
}

/** One `>>` stage of a pipeline. */
export type Stage = SeparatorStage | TemplateStage;

/** `>> "\n"`: the string the final text is joined with. The last one wins. */
export interface SeparatorStage {
	kind: "separator";
	value: string;
	offset: number;
}

/**
 * `>> | $.name | $.class |`: maps each item to a string. Literal text is kept
 * (trimmed at both ends); each `$` query is evaluated against the item.
 */
export interface TemplateStage {
	kind: "template";
	parts: (string | Query)[];
	offset: number;
}

/** Options for `format` and `computeText`. */
export interface FormatOptions extends EvaluateOptions {
	/**
	 * The tag stands on a line of its own, so items are joined with a newline
	 * by default instead of `", "`. A separator stage overrides either.
	 */
	block?: boolean;
	/**
	 * Called when an item cannot be written as text (an object or an array)
	 * and is skipped. Default: `console.warn`, once per distinct message.
	 */
	onWarn?: (message: string) => void;
}
