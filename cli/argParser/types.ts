import type { Schema } from "@bearmetal/forge";

// ─── Required spec ────────────────────────────────────────────────────────────

export type RequiredSpecIf = {
	if: string;
	message?: string;
	cannotBe?: string[];
};

export type RequiredSpecIfNot = {
	ifNot: string;
	message?: string;
	cannotBe?: string[];
};

/**
 * A single required condition. Pass an array to combine multiple.
 * - `true`/`false` - always/never required
 * - `string` - always required; the string is used as the prompt hint
 * - `{ if: key }` - required when `key` is truthy after resolution
 * - `{ ifNot: key }` - required when `key` is falsy after resolution
 *
 * Conditional forms accept `message` (shown as a hint) and `cannotBe` (values
 * excluded from the prompt when this condition is active).
 *
 * When multiple specs are given, any active one makes the arg required.
 * `cannotBe` lists and hint messages are merged across all active specs.
 * Conditions are evaluated in definition order. Place dependencies first.
 */
export type RequiredSpec =
	| boolean
	| string
	| RequiredSpecIf
	| RequiredSpecIfNot;

export type RequiredInput = RequiredSpec | RequiredSpec[];

// ─── Arg definition types ─────────────────────────────────────────────────────

/**
 * Boolean presence flag. Set via `--flag` / `--no-flag` / `-f`. Never prompts — a flag's
 * `required` can only ever surface as a hard error (in both interactive and non-interactive
 * mode), checked once every arg is resolved. Satisfied only when the flag resolves `true`;
 * there's no "unset" state to fall back on distinguishing "explicitly false" from "never asked".
 */
export type FlagDef = {
	type: "flag";
	aliases?: readonly string[];
	default?: boolean;
	required?: RequiredInput;
	/** Shown next to this arg in `--help` output */
	$description?: string;
};

/**
 * Yes/no confirmation. Set via `--confirm` / `--no-confirm`. Prompts with y/n when required.
 *
 * Unlike a `flag`, `required` here means *answered*, not *true* — `--no-confirm` satisfies it.
 */
export type ConfirmDef = {
	type: "confirm";
	aliases?: readonly string[];
	default?: boolean;
	required?: RequiredInput;
	/** Label shown in the y/n prompt */
	prompt?: string;
	/** Set `false` to suppress the hint even when a message is available. Default: `true` */
	showHint?: boolean;
	/** Shown next to this arg in `--help` output */
	$description?: string;
};

export type StringArgDef = {
	type?: "string";
	aliases?: readonly string[];
	default?: string;
	required?: RequiredInput;
	/** Label shown when prompting for a missing value */
	prompt?: string;
	/** Set `false` to suppress the hint. Default: `true` */
	showHint?: boolean;
	/** Forge schema validates the value; re-prompts on failure when interactive */
	schema?: Schema<string>;
	/** Shown next to this arg in `--help` output */
	$description?: string;
};

export type NumArgDef = {
	type?: "number";
	aliases?: readonly string[];
	default?: number;
	required?: RequiredInput;
	/** Label shown when prompting for a missing value */
	prompt?: string;
	/** Set `false` to suppress the hint. Default: `true` */
	showHint?: boolean;
	/** Forge schema validates the value; re-prompts on failure when interactive */
	schema?: Schema<number>;
	/** Shown next to this arg in `--help` output */
	$description?: string;
};

export type EnumArgDef = {
	type: "enum";
	values: readonly string[];
	aliases?: readonly string[];
	default?: string;
	required?: RequiredInput;
	/** Label shown in the interactive select */
	prompt?: string;
	/** Set `false` to suppress the hint. Default: `true` */
	showHint?: boolean;
	/** Shown next to this arg in `--help` output */
	$description?: string;
};

/**
 * Repeatable value. Every `--name=value` occurrence is collected into an array, in the order
 * given, rather than the last one winning. Never prompts.
 */
export type ListArgDef = {
	type: "list";
	aliases?: readonly string[];
	default?: unknown[];
	required?: RequiredInput;
	/**
	 * Transforms each raw `--name=value` string as it's collected. Typed `unknown` here so any
	 * concrete literal function is assignable; `InferValue` recovers its real return type via
	 * `infer` on the specific def, the same trick `EnumArgDef.values` uses for its union.
	 */
	map?: (value: string) => unknown;
	/** Shown next to this arg in `--help` output */
	$description?: string;
	/** Forge schema validates the collected array. Optional, like every other type's. */
	schema?: Schema<string[]>;
};

export type ArgDef =
	| FlagDef
	| ConfirmDef
	| StringArgDef
	| NumArgDef
	| EnumArgDef
	| ListArgDef
	| PositionalDef;
export type ArgDefs = Record<string, ArgDef>;

/** Arg types that carry a value, and therefore need `--name=value` rather than a bare `--name`. */
export type ValueArgDef = StringArgDef | NumArgDef | EnumArgDef | ListArgDef;

/** Every arg reachable by a `--name` — i.e. everything but a positional. */
export type OptionArgDef =
	| FlagDef
	| ConfirmDef
	| StringArgDef
	| NumArgDef
	| EnumArgDef
	| ListArgDef;

/**
 * A positional parameter — identified by where it appears rather than by a `--name`.
 *
 * Declared as an ordinary entry in the defs object, keyed by its name, so it is documented in
 * `--help`, arity-checked, and typed alongside everything else. Their relative order on the
 * command line is the order they are declared in.
 *
 * ```ts
 * {
 * 	draft: { type: "positional", required: true, $description: "Draft file" },
 * 	refs: { type: "positional", variadic: true },
 * 	title: { type: "string" },
 * }
 * ```
 *
 * Declaring even one makes surplus positionals an error. Declaring none leaves them unchecked and
 * reachable through `commandArgs`, which is what every existing parser expects.
 */
export type PositionalDef = {
	type: "positional";
	/**
	 * Missing when required is an error.
	 *
	 * The literal `true` rather than `boolean` so a plain declaration infers precisely — that is
	 * what makes the value `string` instead of `string | undefined`. Omit it for an optional one.
	 */
	required?: true;
	/**
	 * Swallows every remaining positional into an array.
	 *
	 * Only the last declared positional may be variadic; anything after it could never match.
	 */
	variadic?: true;
	/** Shown in the usage line and the arguments list in `--help` */
	$description?: string;
};

/**
 * Reserved key. Set `$description` at the root of an `ArgDefs` object (alongside the arg
 * keys) to document the whole group — the arg-def structure passed to `.from()`, or a single
 * command's defs within `.commandFrom()`. Shown as the header in `--help` output.
 */
export const DESCRIPTION_KEY = "$description";
export type DescriptionKey = typeof DESCRIPTION_KEY;

/**
 * Reserved key. Set `$commands` inside a command's defs to nest subcommands under it, to any
 * depth — `prog chapter new`. The parent's own args stay valid at its own level.
 *
 * A command that declares `$commands` requires one of them; there is no bare form.
 */
export const COMMANDS_KEY = "$commands";
export type CommandsKey = typeof COMMANDS_KEY;

/** Every `$`-prefixed key that is structure rather than an arg. */
export type ReservedArgKey = DescriptionKey | CommandsKey;

/**
 * Shape accepted by `.from()` and each command's defs within `.commandFrom()`: every key holds
 * an `ArgDef`, except the reserved `$`-prefixed keys, which hold structure.
 *
 * Deliberately an ordinary (non self-bound) type rather than a self-referential generic like
 * `T extends ArgDefsShape<T>` — that pattern can express the same per-key restriction, but a
 * self-referential constraint stops TypeScript's language service from contextually typing the
 * object literal passed in, so editors can't offer `ArgDef` key completions (`type`, `default`,
 * `aliases`, ...) while authoring; validation only kicks in after the fact. An ordinary bound
 * keeps completions working. The (rare) cost: TS no longer flags `$description` set to an
 * `ArgDef`, or a real arg set to a bare string — those slip through as `ArgDef | string`.
 */
export type ArgDefsShape = Record<string, ArgDef | string | NestedCommandsShape>;

/** The value of a `$commands` key: a map of subcommand name to that subcommand's defs. */
export type NestedCommandsShape = { [name: string]: ArgDefsShape };

/** Keys of `T` that hold real arg defs (i.e. everything but the reserved `$` keys). */
export type ArgKeys<T> = Exclude<keyof T, ReservedArgKey>;

/** `T`'s nested subcommands, or `never` when it declares none. */
export type SubcommandsOf<T> = T extends Record<CommandsKey, infer S> ? S : never;

export type ArgDefOf<T, K extends keyof T> = T[K] extends ArgDef ? T[K] : never;

// ─── Type inference ────────────────────────────────────────────────────────────

export type InferValue<D extends ArgDef> = D extends { type: "positional"; variadic: true }
	? string[]
	: D extends { type: "positional"; required: true } ? string
	: D extends { type: "positional" } ? string | undefined
	: D extends { type: "flag" } ? boolean
	: D extends { type: "confirm" } ? boolean | undefined
	: D extends { type: "enum"; values: readonly (infer V extends string)[] } ? V | undefined
	: D extends { type: "number" } ? number | undefined
	: D extends { type: "list"; map: (value: string) => infer M } ? M[] | undefined
	: D extends { type: "list" } ? string[] | undefined
	: string | undefined;

/**
 * Bound as `Record<string, unknown>` rather than `ArgDefsShape` so this composes inside other
 * generics (e.g. indexing a command map, where `C[K]` widens beyond `ArgDefsShape`) without
 * re-proving that bound at every nesting level — `ArgDefOf` falls back to `never` for anything
 * malformed, which `.from()`/`.commandFrom()` already reject at the point a defs object is
 * constructed.
 */
export type ParsedArgs<T extends Record<string, unknown>> = {
	[K in keyof T as K extends ReservedArgKey ? never : K]: InferValue<ArgDefOf<T, K>>;
};

export type ResolveValue<V> = [V] extends [boolean | undefined] ? boolean
	: [V] extends [(infer E)[] | undefined] ? E[]
	: V;

/** After `resolve()`, all confirms are filled in and `boolean | undefined` collapses to `boolean`. */
export type ResolvedArgs<T extends Record<string, unknown>> = {
	[K in keyof T as K extends ReservedArgKey ? never : K]: ResolveValue<InferValue<ArgDefOf<T, K>>>;
};
