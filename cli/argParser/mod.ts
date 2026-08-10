import { colorize } from "../style.ts";
import { cliConfirm, cliPrompt } from "../prompts.ts";
import { selectMenuInteractive } from "../select.ts";
import {
	canPrompt,
	type CliSession,
	currentSession,
	type InteractiveMode,
	startCliSession,
} from "../render/mod.ts";
import {
	_write,
	activeSpecs,
	type ArgToken,
	bindPositionals,
	classifyToken,
	collectCannotBe,
	collectHint,
	descriptionOf,
	formatArgLines,
	formatListLines,
	formatPositionalLines,
	formatPositionalUsage,
	isHelpFlag,
	isHelpToken,
	isPresent,
	type NamedPositional,
	normalizeSpecs,
	parseBooleanValue,
	suggestName,
	tokenLabel,
	unknownOptionMessage,
} from "./helpers.ts";
import type {
	ArgDef,
	ArgDefOf,
	ArgDefs,
	ArgDefsShape,
	ArgKeys,
	ConfirmDef,
	DescriptionKey,
	EnumArgDef,
	InferValue,
	ListArgDef,
	OptionArgDef,
	PositionalDef,
	ResolvedArgs,
	ResolveValue,
	StringArgDef,
	SubcommandsOf,
} from "./types.ts";
import { COMMANDS_KEY, DESCRIPTION_KEY } from "./types.ts";
import { tmplr, toKebabCase } from "@bearmetal/miscellanea";

// ─── Exports ──────────────────────────────────────────────────────────────────

export type * from "./types.ts";
export { COMMANDS_KEY, DESCRIPTION_KEY } from "./types.ts";

/** Keys that are structure rather than args, and so are never parsed as one. */
const RESERVED_ARG_KEYS: ReadonlySet<string> = new Set([DESCRIPTION_KEY, COMMANDS_KEY]);

/** What `--help` does: print and exit, or throw {@linkcode HelpRequested}. */
export type HelpMode = "exit" | "throw";

/**
 * Raised by `resolve()` for `--help` when the help mode is `"throw"`.
 *
 * The alternative — `Deno.exit(0)` from inside `resolve()` — breaks the rule the rest of this
 * package is built on: exiting inside a session skips its disposal, leaving raw mode and the
 * alternate screen behind. Throwing hands the decision back to whoever owns the session.
 */
export class HelpRequested extends Error {
	override readonly name = "HelpRequested";
	constructor(readonly helpText: string) {
		super("Help requested");
	}
}

/**
 * Raised by `resolve()` when the command line itself is malformed — an unknown option, a value
 * with nowhere to go, a positional too many.
 *
 * One error carries every problem found, so a mistyped invocation reports all of its mistakes in
 * one pass rather than one per run.
 */
export class ArgParseError extends Error {
	override readonly name = "ArgParseError";
	constructor(readonly issues: readonly string[]) {
		super(
			issues.length === 1
				? issues[0]
				: `${issues.length} problems:\n${issues.map((issue) => `  ${issue}`).join("\n")}`,
		);
	}
}

// ─── Prompting one arg ────────────────────────────────────────────────────────

/** Options for {@linkcode promptFor}. */
export interface PromptForOptions {
	/** The key this def is filed under. Used as the label when `prompt` is unset. */
	key?: string;
	/** Current value, offered as the prompt's default. */
	current?: string;
	/** Answers to reject, re-asking until something else is given. */
	cannotBe?: string[];
	/** Grey hint shown after the label. */
	hint?: string;
	/** Session to prompt in. Defaults to the ambient one. */
	session?: CliSession;
}

/**
 * Asks for one arg, exactly the way `resolve()` would.
 *
 * `resolve()` is the whole-command-line path, which is no use to code that builds a context by
 * itself — an interactive shell, a REPL, a wizard step that isn't backed by argv. Without this,
 * that code has to re-implement the label/hint/`cannotBe`/schema-retry semantics by hand and the
 * two definitions drift. `resolve()` calls this too, so there is only ever one.
 *
 * ```ts
 * const title = await promptFor(
 * 	{ type: "string", prompt: "New title", schema: f.string().min(1) },
 * 	{ current: chapter.title },
 * );
 * ```
 *
 * `flag` and `list` defs have no prompt form; they return their current or default value.
 */
export async function promptFor<D extends ArgDef>(
	def: D,
	opts: PromptForOptions = {},
): Promise<ResolveValue<InferValue<D>>> {
	type Result = ResolveValue<InferValue<D>>;

	const label = ("prompt" in def && def.prompt) || opts.key || "value";
	const hint = opts.hint ? ` ${colorize(`(${opts.hint})`, "gray")}` : "";
	const question = `${colorize("?", "porple")} ${colorize(label, "white")}${hint}`;
	const cannotBe = opts.cannotBe ?? [];
	const session = opts.session;

	if (def.type === "flag") {
		return (opts.current !== undefined ? true : def.default ?? false) as Result;
	}

	if (def.type === "list") {
		return (def.default ?? []) as Result;
	}

	// Positionals are bound from where they appear; there is nothing to ask for.
	if (def.type === "positional") {
		return (def.variadic ? [] : opts.current) as Result;
	}

	if (def.type === "confirm") {
		return await cliConfirm(question, def.default, { session }) as Result;
	}

	if (def.type === "enum") {
		const choices = cannotBe.length
			? def.values.filter((value) => !cannotBe.includes(value))
			: [...def.values];
		const selected = await selectMenuInteractive(question, choices, { session });
		return (selected ?? def.default) as Result;
	}

	// string / number: ask until the answer clears both `cannotBe` and the schema.
	let value: string | undefined;
	while (!value || cannotBe.includes(value)) {
		if (value !== undefined) {
			_write(`  ${colorize("✗", "red")} ${colorize(`"${value}" is not allowed here`, "red")}\n`);
		}
		value = await cliPrompt(question, {
			session,
			default: opts.current ?? (def.default === undefined ? undefined : String(def.default)),
		});
		if (value && def.schema) {
			const check = def.schema.safeParse(
				(def.type === "number" ? Number(value) : value) as never,
			);
			if (!check.success) {
				_write(
					`  ${colorize("✗", "red")} ${
						colorize(check.issues.map((issue) => issue.message).join(", "), "red")
					}\n`,
				);
				value = undefined;
			}
		}
	}

	return (def.type === "number" ? Number(value) : value) as Result;
}

// ─── ArgParser ────────────────────────────────────────────────────────────────

export class ArgParser<T extends ArgDefsShape = ArgDefs> {
	private _parsed: Record<string, string | boolean | number | unknown[] | undefined> = {};
	private _explicitlySet = new Set<string>();
	private _rootCommand?: string;
	private _issues: string[] = [];
	private _positionalTokens: string[] = [];
	_interactive = true;
	_mode: InteractiveMode = "inline";
	_helpMode: HelpMode = "exit";

	constructor(private rawArgs: string[], private defs: T = {} as T) {
		this._parse();
	}

	/** Real arg-def entries, excluding the reserved `$`-prefixed keys. */
	private _entries(): [string, ArgDef][] {
		return (Object.entries(this.defs) as [string, ArgDef][]).filter(([key]) =>
			!RESERVED_ARG_KEYS.has(key)
		);
	}

	/** Declared positionals, in declaration order — which is the order they are matched in. */
	private _positionals(): NamedPositional[] {
		return this._entries()
			.filter((entry): entry is [string, PositionalDef] => entry[1].type === "positional")
			.map(([name, def]) => [name, def] as NamedPositional);
	}

	/** Named options only — everything a `--name` could refer to. */
	private _options(): [string, OptionArgDef][] {
		return this._entries().filter((entry): entry is [string, OptionArgDef] =>
			entry[1].type !== "positional"
		);
	}

	/**
	 * Every spelling that resolves to a key, indexed by bare name.
	 *
	 * Bare rather than dash-prefixed so `-f` and `--f` land in the same lookup — the number of
	 * dashes is a spelling convention, not a namespace.
	 */
	private _aliasMap(): Map<string, string> {
		const map = new Map<string, string>();
		for (const [key, def] of this._options()) {
			map.set(key, key);
			map.set(toKebabCase(key), key);
			for (const alias of (def.aliases ?? [])) {
				map.set(alias.replace(/^-+/, ""), key);
			}
		}
		return map;
	}

	/** Whether this parser declares `name` (in any spelling). Used to route tokens. */
	knows(name: string): boolean {
		return this._aliasMap().has(name);
	}

	/** Every declared spelling, for "did you mean" suggestions. */
	knownNames(): string[] {
		return [...this._aliasMap().keys()];
	}

	/** Problems found while parsing: unknown options, missing values, bad enum members. */
	get issues(): readonly string[] {
		return this._issues;
	}

	private _parse() {
		const aliasMap = this._aliasMap();
		const defs = this.defs as Record<string, ArgDef>;

		for (const [key, def] of this._options()) {
			if (def.type === "flag") {
				this._parsed[key] = def.default ?? false;
			} else if (def.type === "number") {
				this._parsed[key] = def.default;
			} else if (def.type !== "confirm" && "default" in def && def.default !== undefined) {
				this._parsed[key] = def.default;
			}

			// The kebab spelling is accepted for every other arg, so it has to be
			// accepted here too — otherwise `--non-interactive` sets the flag's value
			// but leaves the parser prompting, which is the opposite of what was asked.
			if ((["nonInteractive"].includes(key))) {
				const forms = [`--${key}`, `--${toKebabCase(key)}`, ...def.aliases ?? []];
				this._interactive = !this.rawArgs.some((e) => forms.includes(e));
			}
		}

		let terminated = false;
		for (const raw of this.rawArgs) {
			if (terminated) {
				this._positionalTokens.push(raw);
				continue;
			}

			const token = classifyToken(raw);
			if (token.kind === "terminator") {
				terminated = true;
				continue;
			}
			if (token.kind === "positional") {
				this._positionalTokens.push(raw);
				continue;
			}
			// Answered before anything else, by whoever owns the run.
			if (isHelpToken(token)) continue;

			const key = aliasMap.get(token.name);
			if (key === undefined) {
				this._issues.push(unknownOptionMessage(token, aliasMap.keys()));
				continue;
			}
			this._apply(key, defs[key], token);
		}
	}

	/**
	 * Binds one recognised token to its key.
	 *
	 * Every path here either sets a value or records an issue. Falling through silently is what
	 * made a typo'd flag vanish — the value went nowhere and the run continued as if it had never
	 * been typed.
	 */
	private _apply(key: string, def: ArgDef, token: Extract<ArgToken, { kind: "named" }>) {
		const name = toKebabCase(key);
		const isBoolean = def.type === "flag" || def.type === "confirm";

		if (token.value === undefined) {
			if (isBoolean) {
				this._parsed[key] = !token.negated;
				this._explicitlySet.add(key);
				return;
			}
			// `--name value` binds nothing: the value would be read as a positional and the arg
			// would stay undefined. Rejecting it is the whole point — silently dropping an
			// author's `--content` is worse than any amount of strictness.
			this._issues.push(
				`${
					tokenLabel(token)
				} needs a value. Use --${name}=<value> (space-separated values are not supported)`,
			);
			return;
		}

		if (token.negated) {
			this._issues.push(`${tokenLabel(token)} cannot take a value`);
			return;
		}

		if (isBoolean) {
			const parsed = parseBooleanValue(token.value);
			if (parsed === undefined) {
				this._issues.push(
					`--${name} is a ${def.type} and expects true or false, got "${token.value}"`,
				);
				return;
			}
			this._parsed[key] = parsed;
			this._explicitlySet.add(key);
			return;
		}

		if (def.type === "enum") {
			if (!def.values.includes(token.value)) {
				this._issues.push(
					`Invalid value "${token.value}" for --${name}. Expected one of: ${def.values.join(", ")}`,
				);
				return;
			}
			this._parsed[key] = token.value;
		} else if (def.type === "number") {
			const parsed = Number(token.value);
			if (!Number.isFinite(parsed)) {
				this._issues.push(`--${name} expects a number, got "${token.value}"`);
				return;
			}
			this._parsed[key] = parsed;
		} else if (def.type === "list") {
			this._parsed[key] = this._explicitlySet.has(key)
				? [...(this._parsed[key] as unknown[]), token.value]
				: [token.value];
		} else {
			this._parsed[key] = token.value;
		}

		this._explicitlySet.add(key);
	}

	setRootCommand(command: string): ArgParser<T> {
		this._rootCommand = command;
		return this;
	}

	/**
	 * What `--help` does.
	 *
	 * `"exit"` (the default, and what every existing caller expects) prints and exits 0.
	 * `"throw"` raises {@linkcode HelpRequested} carrying the text instead — the right choice
	 * inside a session, where exiting skips the terminal restore.
	 */
	setHelpMode(mode: HelpMode): ArgParser<T> {
		this._helpMode = mode;
		return this;
	}

	/**
	 * Chooses how prompts are presented.
	 *
	 * `"inline"` (the default) draws below existing output and collapses each answer
	 * to a summary line. `"alt"` runs the whole sequence on the alternate screen,
	 * leaving the scrollback untouched. Ignored when there is no terminal.
	 */
	setInteractiveMode(mode: InteractiveMode): ArgParser<T> {
		this._mode = mode;
		return this;
	}

	get<K extends ArgKeys<T>>(key: K): InferValue<ArgDefOf<T, K>> {
		return this._parsed[key as string] as InferValue<ArgDefOf<T, K>>;
	}

	/** Renders `--help` output: the group's `$description` (if any) followed by its args. */
	helpText(programName?: string): string {
		const lines: string[] = [];
		const positionals = this._positionals();
		if (programName) {
			const usage = [programName, "[options]", formatPositionalUsage(positionals)]
				.filter(Boolean)
				.join(" ");
			lines.push(colorize(`Usage: ${usage}`, "gray"));
		}
		const description = descriptionOf(this.defs);
		if (description) lines.push(description);
		const entries = this._options();
		if (lines.length) lines.push("");
		if (positionals.length) {
			lines.push(colorize("Arguments:", "gray"));
			lines.push(...formatPositionalLines(positionals));
			if (entries.length) lines.push("");
		}
		if (entries.length) {
			lines.push(colorize("Options:", "gray"));
			lines.push(...formatArgLines(entries));
		}
		return lines.join("\n");
	}

	helpTextArgs(programName?: string): string {
		const lines: string[] = [];
		const entries = this._options();
		if (lines.length) lines.push("");
		if (entries.length) {
			lines.push(colorize(programName ? `Options (${programName})` : "Options:", "gray"));
			lines.push(...formatArgLines(entries));
		}
		return lines.join("\n");
	}

	/**
	 * Checks every `required` spec against the fully-resolved `result`, once every arg's value
	 * is settled. Run as a separate pass after collection (rather than inline, interleaved with
	 * it) so a requirement that depends on another arg declared *later* in the defs object is
	 * checked against that arg's real final value, not whatever it happened to be mid-collection
	 * — collection order no longer has to match dependency order, in either direction.
	 *
	 * Satisfaction is type-aware: a `flag` must resolve `true` (there's no "unset" flag state); a
	 * `confirm` only has to be *answered*, since `--no-thing` is an answer and `false` is a legal
	 * one; a `list` must resolve to a non-empty array; everything else just needs to be defined.
	 */
	private _validateRequired(result: Record<string, unknown>): string[] {
		const errors: string[] = [];
		for (const [key, def] of this._options()) {
			if (!("required" in def) || def.required === undefined) continue;
			const active = activeSpecs(normalizeSpecs(def.required), result);
			if (active.length === 0) continue;
			const current = result[key];
			const satisfied = def.type === "flag"
				? Boolean(current)
				: def.type === "confirm"
				? current !== undefined
				: isPresent(current);
			if (satisfied) continue;
			const hint = collectHint(active);
			const displayKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
			errors.push(`--${displayKey}${hint ? `: ${hint}` : ""}`);
		}
		return errors;
	}

	/**
	 * Answers `--help`, according to {@linkcode ArgParser.setHelpMode}.
	 *
	 * Separated out so `CommandArgParser` — and any caller that would rather intercept help
	 * before opening a session — can reach the same behaviour.
	 */
	handleHelp(programName = this._rootCommand, banner = true): void {
		if (this._helpMode === "throw") throw new HelpRequested(this.helpText(programName));
		if (banner) console.log(tmplr);
		_write(this.helpText(programName) + "\n");
		Deno.exit(0);
	}

	/** Binds declared positionals to the tokens given, reporting arity problems. */
	private _resolvePositionals(): { values: Record<string, string | string[]>; errors: string[] } {
		// With none declared there is no arity to check and nothing to name the values by, so
		// extra tokens stay available through `nonFlags` and are nobody's error.
		const positionals = this._positionals();
		if (positionals.length === 0) return { values: {}, errors: [] };
		return bindPositionals(positionals, this._positionalTokens);
	}

	/**
	 * Validates and resolves all arg values.
	 *
	 * `--help`/`-h` short-circuits — see {@linkcode ArgParser.setHelpMode}.
	 *
	 * A malformed command line (unknown option, missing value, surplus positional) throws
	 * {@linkcode ArgParseError} listing every problem at once, before any prompting.
	 *
	 * Non-interactive (piped/CI): validates CLI-provided values and throws immediately
	 * listing all missing required args. No prompting is attempted.
	 *
	 * Interactive (TTY): prompts for any missing required values, validates schema
	 * on string inputs, and re-prompts on failure.
	 *
	 * Either way, `required` itself is only checked once — see `_validateRequired`.
	 */
	async resolve(existing?: ResolvedArgs<T>): Promise<ResolvedArgs<T>> {
		if (isHelpFlag(this.rawArgs)) this.handleHelp();

		const positionals = this._resolvePositionals();
		const malformed = [...this._issues, ...positionals.errors];
		if (malformed.length > 0) throw new ArgParseError(malformed);

		const result = { ...existing, ...this._parsed } as Record<string, unknown>;
		Object.assign(result, positionals.values);
		const isInteractive = canPrompt() && this._interactive;

		if (!isInteractive) {
			const errors: string[] = [];
			for (const [key, def] of this._options()) {
				if (def.type === "flag") continue;
				const current = result[key];
				const displayKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
				if (current !== undefined) {
					if ("schema" in def && def.schema) {
						const check = def.schema.safeParse(current as string);
						if (!check.success) {
							errors.push(`--${displayKey}: ${check.issues.map((i) => i.message).join(", ")}`);
						}
					}
					continue;
				}
				if (def.type === "confirm") {
					const active = activeSpecs(normalizeSpecs(def.required), result);
					if (active.length === 0) result[key] = def.default ?? false;
					continue;
				}
				if (def.type === "list") {
					const active = activeSpecs(normalizeSpecs(def.required), result);
					if (active.length === 0) result[key] = def.default ?? [];
					continue;
				}
			}
			errors.push(...this._validateRequired(result));
			if (errors.length > 0) {
				throw new Error(`Missing required arguments:\n${errors.map((e) => `  ${e}`).join("\n")}`);
			}
			return result as ResolvedArgs<T>;
		}

		const owned: CliSession | null = currentSession()
			? null
			: startCliSession({ mode: this._mode });
		try {
			return await this._resolveInteractive(result);
		} finally {
			owned?.cleanup();
		}
	}

	/** The prompting half of {@linkcode ArgParser.resolve}, run inside a session. */
	private async _resolveInteractive(
		result: Record<string, unknown>,
	): Promise<ResolvedArgs<T>> {
		const errors = [];
		for (const [key, def] of this._options()) {
			if (def.type === "flag") continue;

			const current = result[key];
			const specs = normalizeSpecs(
				(def as ConfirmDef | StringArgDef | EnumArgDef | ListArgDef).required,
			);
			const active = activeSpecs(specs, result);

			if (def.type === "confirm") {
				if (current !== undefined || active.length === 0) {
					if (current === undefined) result[key] = def.default ?? false;
					continue;
				}
				result[key] = await promptFor(def, {
					key,
					hint: def.showHint !== false ? collectHint(active) : "",
				});
				continue;
			}

			if (def.type === "list") {
				if (current === undefined && active.length === 0) result[key] = def.default ?? [];
				if ("schema" in def && def.schema) {
					const check = def.schema.safeParse(result[key] as string[]);
					if (!check.success) {
						errors.push(`--${key}: ${check.issues.map((i) => i.message).join(", ")}`);
					}
				}
				if (def.map) result[key] = (result[key] as string[]).map(def.map);
				continue;
			}

			const isExplicit = this._explicitlySet.has(key);
			if (current !== undefined && (isExplicit || active.length === 0)) {
				if ("schema" in def && def.schema) {
					const check = def.schema.safeParse(current as string);
					if (!check.success) {
						errors.push(`--${key}: ${check.issues.map((i) => i.message).join(", ")}`);
					}
				}
				continue;
			}

			if (active.length === 0) continue;

			result[key] = await promptFor(def, {
				key,
				current: current as string | undefined,
				cannotBe: collectCannotBe(active),
				hint: (def as StringArgDef | EnumArgDef).showHint !== false ? collectHint(active) : "",
			});
		}

		errors.push(...this._validateRequired(result));
		if (errors.length > 0) {
			throw new Error(`Missing required arguments:\n${errors.map((e) => `  ${e}`).join("\n")}`);
		}
		return result as ResolvedArgs<T>;
	}

	get argFlags(): string[] {
		return this.rawArgs.filter((a) => a.startsWith("-"));
	}

	get nonFlags(): string[] {
		return this.rawArgs.filter((a) => !a.startsWith("-"));
	}

	/** Raw `--name=value` and `--flag` strings from the original args */
	get namedArgs(): string[] {
		return this.rawArgs.filter((a) => a.startsWith("--"));
	}

	get command(): string {
		return this.nonFlags[0];
	}

	get commandArgs(): string[] {
		return this.nonFlags.slice(1);
	}

	static from<T extends ArgDefsShape>(rawArgs: string[], defs: T): ArgParser<T> {
		return new ArgParser(rawArgs, defs);
	}

	/** Backward-compatible: parse without definitions */
	static parse(args: string[]): ArgParser<ArgDefs> {
		return new ArgParser(args, {});
	}

	/**
	 * Parses a `program <command> --flag arg` style invocation. `commands` maps each
	 * command name to the same arg-def structure `.from()` takes. The leading positional
	 * token in `rawArgs` selects the command; everything else is parsed against that
	 * command's own defs.
	 */
	static commandFrom<C extends CommandDefsShape>(
		rawArgs: string[],
		commands: C,
	): CommandArgParser<C> {
		return new CommandArgParser(rawArgs, commands);
	}
}

// ─── Command dispatch ──────────────────────────────────────────────────────────

export type CommandDefs = Record<string, ArgDefs>;

/**
 * Shape accepted by `.commandFrom()`: every key maps to a command's own `ArgDefsShape`, except
 * the reserved `$description` key, which holds a string describing the whole program (shown
 * above the command list in `--help` output).
 *
 * Ordinary (non self-referential) for the same reason as `ArgDefsShape` — keeps object-literal
 * completions working at both the command level and each command's own arg defs.
 */
export type CommandDefsShape = Record<string, ArgDefsShape | string | boolean>;

/**
 * Reserved key. Set `$root` in the object passed to `.commandFrom()` to define arg defs that
 * apply *before* the command token — e.g. `program --root-arg command --command-arg`. Same
 * `ArgDefsShape` structure as a single command's own defs; resolved root values are merged into
 * the final result alongside whichever command matched.
 */
export const ROOT_KEY = "$root";
type RootKey = typeof ROOT_KEY;

/**
 * Reserved key. Set `$requireCommand: true` in the object passed to `.commandFrom()` to keep a
 * command mandatory — `resolve()` throws if none is given, same as before this existed. Defaults
 * to `false`: a program with only `$root` args and no matched command resolves successfully with
 * `command: undefined` and just the root args.
 */
export const REQUIRE_COMMAND_KEY = "$requireCommand";
type RequireCommandKey = typeof REQUIRE_COMMAND_KEY;

type ReservedCommandKey = DescriptionKey | RootKey | RequireCommandKey;
function isReservedCommandKey(key: string): key is ReservedCommandKey {
	return key === DESCRIPTION_KEY || key === ROOT_KEY || key === REQUIRE_COMMAND_KEY;
}

/** Keys of `C` that are real commands (i.e. everything but the reserved `$`-prefixed keys). */
type CommandKeys<C> = Exclude<keyof C, ReservedCommandKey>;

/**
 * `C[K]`, narrowed to `ArgDefsShape` (falling back to `never` otherwise). Since `CommandDefsShape`
 * is `Record<string, ArgDefsShape | string | boolean>`, an abstract `C[K]` widens beyond
 * `ArgDefsShape` — this degrades safely instead of failing `ResolvedArgs`'s constraint, the same
 * trick `ArgDefOf` uses.
 */
type CommandDefOf<C, K extends keyof C> = C[K] extends ArgDefsShape ? C[K] : never;

/** `C["$root"]`, narrowed to `ArgDefsShape` — an empty defs shape when `$root` isn't given. */
type RootDefsOf<C> = C extends Record<RootKey, infer R>
	? (R extends ArgDefsShape ? R : Record<string, never>)
	: Record<string, never>;

/** Whether `C["$requireCommand"]` is literally `true` — `false` (the default) otherwise. */
type RequireCommand<C> = C extends Record<RequireCommandKey, true> ? true : false;

/** Union of all command names in `C`. */
export type CommandName<C extends CommandDefsShape> = CommandKeys<C>;

/**
 * Space-joined paths to every *runnable* command in `C`.
 *
 * A command that declares `$commands` is a group, not a destination: only its leaves appear here,
 * so `chapter` alone is not a valid path while `"chapter new"` is.
 */
export type CommandPath<C, D extends number = MaxCommandDepth> = [D] extends [never] ? never
	: {
		[K in CommandKeys<C>]: [SubcommandsOf<C[K]>] extends [never] ? K & string
			: JoinCommandPath<K & string, CommandPath<SubcommandsOf<C[K]>, Decrement[D]>>;
	}[CommandKeys<C>];

/**
 * `"chapter" + "new"` → `"chapter new"`.
 *
 * Split out rather than written inline: a template literal that recurses directly inside a mapped
 * type reads as circular to the checker, and the extra conditional is what defers it.
 */
type JoinCommandPath<H extends string, T> = T extends string ? `${H} ${T}` : never;

/**
 * Recursion guard for the path types.
 *
 * Inside the class body `C` is an unresolved type parameter, so the checker cannot see that
 * descending terminates and expands until it gives up. Runtime nesting is unbounded; five levels
 * is past anything a command line should ask a person to type.
 */
type Decrement = [never, 0, 1, 2, 3, 4];
type MaxCommandDepth = 5;

/**
 * Every arg declared along `P`, merged with the innermost level last.
 *
 * A group's own args stay valid at its own level — `prog chapter --verbose new` — so they are
 * folded in on the way down rather than only at the leaf.
 */
type ArgsAlongPath<C, P extends string, D extends number = MaxCommandDepth> = [D] extends [never]
	? unknown
	: P extends `${infer H} ${infer Rest}` ? H extends keyof C ?
				& ResolvedArgs<CommandDefOf<C, H>>
				& ArgsAlongPath<SubcommandsOf<C[H]>, Rest, Decrement[D]>
		: unknown
	: P extends keyof C ? ResolvedArgs<CommandDefOf<C, P>>
	: unknown;

/** `{ command } & ResolvedArgs` for one matched path, plus any `$root` args merged in. */
type CommandVariant<C> = {
	[P in CommandPath<C>]:
		& { command: P; commandPath: string[] }
		& ArgsAlongPath<C, P>
		& ResolvedArgs<RootDefsOf<C>>;
}[CommandPath<C>];

/**
 * Discriminated union of `{ command } & ResolvedArgs` for each runnable path in `C`, each merged
 * with `$root`'s resolved args. When `$requireCommand` isn't literally `true`, also includes a
 * `{ command: undefined }` variant for when no command was given.
 */
export type CommandResolvedArgs<C extends CommandDefsShape> = RequireCommand<C> extends true
	? CommandVariant<C>
	:
		| CommandVariant<C>
		| ({ command: undefined; commandPath: string[] } & ResolvedArgs<RootDefsOf<C>>);

// ─── Runtime helpers over a command map ───────────────────────────────────────

/** The subcommand map a defs object declares, or `undefined` if it is a leaf. */
function subcommandsOf(defs: Record<string, unknown>): Record<string, ArgDefsShape> | undefined {
	const raw = defs[COMMANDS_KEY];
	if (!raw || typeof raw !== "object") return undefined;
	const map = raw as Record<string, ArgDefsShape>;
	return Object.keys(map).length > 0 ? map : undefined;
}

/** The runnable commands at the top level of a `commandFrom` map. */
function topLevelCommands(commands: Record<string, unknown>): Record<string, ArgDefsShape> {
	const map: Record<string, ArgDefsShape> = {};
	for (const [key, value] of Object.entries(commands)) {
		if (isReservedCommandKey(key)) continue;
		if (value && typeof value === "object") map[key] = value as ArgDefsShape;
	}
	return map;
}

/** Every name (in every spelling) a defs object answers to. */
function namesOf(defs: Record<string, unknown>): Set<string> {
	return new Set(new ArgParser([], defs as ArgDefs).knownNames());
}

/** One level of a resolved command chain. */
interface CommandLevel {
	name: string;
	defs: ArgDefsShape;
	/** Named tokens routed here. Positionals live on the leaf, in `#positionals`. */
	tokens: string[];
}

export class CommandArgParser<C extends CommandDefsShape> {
	#chain: CommandLevel[] = [];
	#rootDefs: ArgDefsShape;
	#rootTokens: string[] = [];
	#positionals: string[] = [];
	/** Named tokens nobody claimed while a subcommand was still unchosen. */
	#deferred: string[] = [];
	#issues: string[] = [];
	/** Subcommands still to choose from, when the chain stopped at a group. */
	#pending: Record<string, ArgDefsShape> | undefined;
	/** A positional that was in command position but matched nothing. */
	#unknownCommand: string | undefined;
	#program?: string;

	_mode: InteractiveMode = "inline";
	_helpMode: HelpMode = "exit";

	constructor(private rawArgs: string[], private commands: C) {
		const raw = (commands as Record<string, unknown>)[ROOT_KEY];
		this.#rootDefs = (raw && typeof raw === "object" ? raw : {}) as ArgDefsShape;

		const tokens = rawArgs.map(classifyToken);
		const consumed = this.#walkCommands(tokens);
		this.#routeTokens(tokens, consumed);
	}

	/**
	 * Descends the command tree through the leading positional tokens.
	 *
	 * Nesting lives here rather than in the caller. Flattening `noun verb` into a single token
	 * before parsing — the only way to express two levels before this — means reordering argv and
	 * pattern-matching on a noun list in every program that wants it.
	 */
	#walkCommands(tokens: ArgToken[]): Set<number> {
		const consumed = new Set<number>();
		let map = topLevelCommands(this.commands as Record<string, unknown>);

		for (const [index, token] of tokens.entries()) {
			// After `--` nothing is a command name; it is all values.
			if (token.kind === "terminator") break;
			if (token.kind !== "positional") continue;

			const next = map[token.raw];
			if (next === undefined) {
				// A positional in command position that isn't a command — only an error if a
				// command was still expected here.
				if (Object.keys(map).length > 0 && this.#chain.length === 0) {
					this.#unknownCommand = token.raw;
				} else if (Object.keys(map).length > 0) {
					this.#unknownCommand = token.raw;
				}
				break;
			}

			consumed.add(index);
			this.#chain.push({ name: token.raw, defs: next, tokens: [] });
			const sub = subcommandsOf(next);
			if (!sub) return consumed;
			map = sub;
		}

		// Either nothing was given, or the chain stopped on a group that still needs a choice.
		const deepest = this.#chain.at(-1);
		const stillOpen = deepest ? subcommandsOf(deepest.defs) : topLevelCommands(
			this.commands as Record<string, unknown>,
		);
		if (stillOpen && Object.keys(stillOpen).length > 0) this.#pending = stillOpen;
		return consumed;
	}

	/**
	 * Sends every remaining token to the level that declares it.
	 *
	 * Innermost first, then out to `$root` — which is what lets a global flag be written after the
	 * command (`prog chapter list --json`) instead of only before it. Position stops being part of
	 * the grammar; the declaration decides.
	 */
	#routeTokens(tokens: ArgToken[], consumed: Set<number>) {
		const names = this.#chain.map((level) => namesOf(level.defs));
		const rootNames = namesOf(this.#rootDefs);
		let terminated = false;

		for (const [index, token] of tokens.entries()) {
			if (consumed.has(index)) continue;

			if (terminated) {
				this.#positionals.push(token.raw);
				continue;
			}
			if (token.kind === "terminator") {
				terminated = true;
				this.#positionals.push(token.raw);
				continue;
			}
			if (token.kind === "positional") {
				this.#positionals.push(token.raw);
				continue;
			}
			if (isHelpToken(token)) continue;

			this.#routeNamed(token, names, rootNames);
		}
	}

	#routeNamed(
		token: Extract<ArgToken, { kind: "named" }>,
		names: Set<string>[],
		rootNames: Set<string>,
	) {
		for (let level = this.#chain.length - 1; level >= 0; level--) {
			if (names[level].has(token.name)) {
				this.#chain[level].tokens.push(token.raw);
				return;
			}
		}
		if (rootNames.has(token.name)) {
			this.#rootTokens.push(token.raw);
			return;
		}
		// The subcommand that would own this may not have been chosen yet, so hold it rather
		// than rejecting a flag that is about to become valid.
		if (this.#pending) {
			this.#deferred.push(token.raw);
			return;
		}
		this.#issues.push(unknownOptionMessage(token, this.#allKnownNames()));
	}

	#allKnownNames(): string[] {
		const all = new Set<string>(namesOf(this.#rootDefs));
		for (const level of this.#chain) for (const name of namesOf(level.defs)) all.add(name);
		return [...all];
	}

	/** Adds a level chosen after parsing, and re-routes anything held for it. */
	#descend(name: string) {
		const defs = this.#pending?.[name];
		if (!defs) return;
		this.#chain.push({ name, defs, tokens: [] });
		this.#pending = subcommandsOf(defs);

		const held = this.#deferred;
		this.#deferred = [];
		const names = this.#chain.map((level) => namesOf(level.defs));
		const rootNames = namesOf(this.#rootDefs);
		for (const raw of held) {
			const token = classifyToken(raw);
			if (token.kind === "named") this.#routeNamed(token, names, rootNames);
			else this.#positionals.push(raw);
		}
	}

	/** Anything still held once the chain is final was never valid. */
	#settleDeferred() {
		for (const raw of this.#deferred) {
			const token = classifyToken(raw);
			if (token.kind === "named") {
				this.#issues.push(unknownOptionMessage(token, this.#allKnownNames()));
			}
		}
		this.#deferred = [];
	}

	#requireCommand(): boolean {
		return Boolean((this.commands as Record<string, unknown>)[REQUIRE_COMMAND_KEY]);
	}

	setProgram(command: string | undefined): CommandArgParser<C> {
		this.#program = command;
		return this;
	}

	/** Sets the interactive mode for this parser and every command parser under it. */
	setInteractiveMode(mode: InteractiveMode): CommandArgParser<C> {
		this._mode = mode;
		return this;
	}

	/** See {@linkcode ArgParser.setHelpMode}. */
	setHelpMode(mode: HelpMode): CommandArgParser<C> {
		this._helpMode = mode;
		return this;
	}

	/** The matched command path, space-joined, or `undefined` if none matched. */
	get command(): string | undefined {
		return this.#chain.length > 0 ? this.#chain.map((level) => level.name).join(" ") : undefined;
	}

	/** The matched command path as its separate names. */
	get commandPath(): string[] {
		return this.#chain.map((level) => level.name);
	}

	/** All command names available at the top level. */
	get commandNames(): CommandKeys<C>[] {
		return Object.keys(topLevelCommands(this.commands as Record<string, unknown>)) as CommandKeys<
			C
		>[];
	}

	/** Positional args following the command path. */
	get commandArgs(): string[] {
		return this.#positionals.filter((token) => token !== "--");
	}

	/** Problems found while parsing. */
	get issues(): readonly string[] {
		return this.#issues;
	}

	/** Synchronous read of a single arg for the given command, typed from its arg defs. */
	get<K extends CommandKeys<C>, A extends ArgKeys<C[K]>>(
		command: K,
		key: A,
	): InferValue<ArgDefOf<C[K], A>> | undefined {
		const level = this.#chain.find((entry) => entry.name === command);
		if (!level) return undefined;
		return new ArgParser(level.tokens, level.defs as ArgDefs).get(key as string) as
			| InferValue<ArgDefOf<C[K], A>>
			| undefined;
	}

	/** Renders `--help`: the matched command's args, or the command list if none matched. */
	helpText(programName: string = this.#program ?? ""): string {
		const lines: string[] = [];
		const leaf = this.#chain.at(-1);

		if (leaf && !this.#pending) {
			const label = [programName, ...this.commandPath].filter(Boolean).join(" ");
			lines.push(new ArgParser(leaf.tokens, leaf.defs as ArgDefs).helpText(label));
			// A group's own options are still valid at the leaf, so they belong in its help.
			for (const ancestor of this.#chain.slice(0, -1).reverse()) {
				const text = new ArgParser([], ancestor.defs as ArgDefs).helpTextArgs(ancestor.name);
				if (text) lines.push("", text);
			}
			const rootText = new ArgParser([], this.#rootDefs as ArgDefs).helpTextArgs(programName);
			if (rootText) lines.push("", rootText);
			return lines.join("\n");
		}

		const description = descriptionOf(
			(leaf?.defs ?? this.commands) as Record<string, unknown>,
		);
		if (description) lines.push(description, "");

		if (!leaf) {
			const rootHelp = new ArgParser([], this.#rootDefs as ArgDefs).helpText();
			if (rootHelp) lines.push(rootHelp, "");
		}

		const available = this.#pending ?? topLevelCommands(this.commands as Record<string, unknown>);
		const heading = leaf ? `Subcommands of ${this.commandPath.join(" ")}:` : "Commands:";
		const rows = Object.entries(available).map(([name, defs]) =>
			[name, descriptionOf(defs as Record<string, unknown>)] as const
		);
		lines.push(colorize(heading, "gray"), ...formatListLines(rows));
		return lines.join("\n");
	}

	/** Answers `--help` per {@linkcode CommandArgParser.setHelpMode}. */
	handleHelp(): void {
		const text = this.helpText();
		if (this._helpMode === "throw") throw new HelpRequested(text);
		_write(text + "\n");
		Deno.exit(0);
	}

	/**
	 * @param options.promptForCommand When set and no valid command was given, prompt for one
	 * via `selectMenuInteractive` instead of throwing. Pass a string to customize the prompt.
	 * Nested levels are prompted for in turn, so a group never resolves half-chosen.
	 */
	async resolve(
		options?: { promptForCommand?: boolean | string },
	): Promise<CommandResolvedArgs<C>> {
		if (isHelpFlag(this.rawArgs)) this.handleHelp();

		const owned: CliSession | null = currentSession() || !Deno.stdout.isTerminal()
			? null
			: startCliSession({ mode: this._mode });
		try {
			return await this.#resolve(options);
		} finally {
			owned?.cleanup();
		}
	}

	async #resolve(
		options?: { promptForCommand?: boolean | string },
	): Promise<CommandResolvedArgs<C>> {
		await this.#completeChain(options);
		this.#settleDeferred();
		if (this.#issues.length > 0) throw new ArgParseError(this.#issues);

		const rootParser = new ArgParser(this.#rootTokens, this.#rootDefs as ArgDefs)
			.setInteractiveMode(this._mode);
		let accumulated = await rootParser.resolve() as Record<string, unknown>;

		for (const [index, level] of this.#chain.entries()) {
			const isLeaf = index === this.#chain.length - 1;
			// Positionals are the leaf's: an intermediate group only owns its named options.
			const tokens = isLeaf ? [...level.tokens, ...this.#positionals] : level.tokens;
			const parser = new ArgParser(tokens, level.defs as ArgDefs)
				.setInteractiveMode(this._mode);
			parser._interactive = rootParser._interactive;
			accumulated = {
				...accumulated,
				...await parser.resolve(accumulated as never) as Record<string, unknown>,
			};
		}

		return {
			...accumulated,
			command: this.command,
			commandPath: this.commandPath,
		} as CommandResolvedArgs<C>;
	}

	/** Fills in every unchosen level, by prompt where allowed and by error where not. */
	async #completeChain(options?: { promptForCommand?: boolean | string }) {
		while (this.#pending) {
			const available = Object.keys(this.#pending);

			if (this.#unknownCommand !== undefined) {
				const where = this.#chain.length > 0 ? ` for ${this.commandPath.join(" ")}` : "";
				const suggestion = suggestName(this.#unknownCommand, available);
				throw new Error(
					`Unknown command "${this.#unknownCommand}"${where}. Expected one of: ${
						available.join(", ")
					}${suggestion ? `. Did you mean "${suggestion}"?` : ""}`,
				);
			}

			// Nothing was given at this level. A top-level command is optional unless
			// `$requireCommand` says otherwise; a subcommand of a group never is.
			const optional = this.#chain.length === 0 && !this.#requireCommand();

			if (options?.promptForCommand && canPrompt()) {
				const q = typeof options.promptForCommand === "string"
					? options.promptForCommand
					: this.#chain.length > 0
					? `Select a ${this.commandPath.join(" ")} command`
					: "Select a command";
				const chosen = await selectMenuInteractive(q, available);
				if (chosen) {
					this.#descend(chosen);
					continue;
				}
			}

			if (optional) {
				this.#pending = undefined;
				return;
			}

			const where = this.#chain.length > 0 ? ` for ${this.commandPath.join(" ")}` : "";
			throw new Error(`Missing command${where}. Expected one of: ${available.join(", ")}`);
		}
	}
}
