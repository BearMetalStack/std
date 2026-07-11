import type { Schema } from "@bearmetal/forge";
import { colorize } from "./style.ts";
import { cliConfirm, cliPrompt } from "./prompts.ts";
import { selectMenuInteractive } from "./select.ts";

// ─── Required spec ────────────────────────────────────────────────────────────

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
	| { if: string; message?: string; cannotBe?: string[] }
	| { ifNot: string; message?: string; cannotBe?: string[] };

export type RequiredInput = RequiredSpec | RequiredSpec[];

// ─── Arg definition types ─────────────────────────────────────────────────────

/** Boolean presence flag. Set via `--flag` / `--no-flag` / `-f`. Never prompts. */
export type FlagDef = {
	type: "flag";
	aliases?: string[];
	default?: boolean;
	/** Shown next to this arg in `--help` output */
	$description?: string;
};

/** Yes/no confirmation. Set via `--confirm` / `--no-confirm`. Prompts with y/n when required. */
export type ConfirmDef = {
	type: "confirm";
	aliases?: string[];
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
	aliases?: string[];
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
	aliases?: string[];
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
	aliases?: string[];
	default?: string;
	required?: RequiredInput;
	/** Label shown in the interactive select */
	prompt?: string;
	/** Set `false` to suppress the hint. Default: `true` */
	showHint?: boolean;
	/** Shown next to this arg in `--help` output */
	$description?: string;
};

export type ArgDef = FlagDef | ConfirmDef | StringArgDef | NumArgDef | EnumArgDef;
export type ArgDefs = Record<string, ArgDef>;

/**
 * Reserved key. Set `$description` at the root of an `ArgDefs` object (alongside the arg
 * keys) to document the whole group — the arg-def structure passed to `.from()`, or a single
 * command's defs within `.commandFrom()`. Shown as the header in `--help` output.
 */
const DESCRIPTION_KEY = "$description";
type DescriptionKey = typeof DESCRIPTION_KEY;

/**
 * Validates that every key of `T` holds an `ArgDef`, except the reserved `$description` key,
 * which must be a `string`. Used as a self-referential generic bound so arg-def object literals
 * keep their precise inferred type while still being checked against this shape.
 */
export type ArgDefsShape<T> = {
	[K in keyof T]: K extends DescriptionKey ? string : ArgDef;
};

/** Keys of `T` that hold real arg defs (i.e. everything but `$description`). */
type ArgKeys<T> = Exclude<keyof T, DescriptionKey>;

type ArgDefOf<T, K extends keyof T> = T[K] extends ArgDef ? T[K] : never;

// ─── Type inference ────────────────────────────────────────────────────────────

type InferValue<D extends ArgDef> = D extends { type: "flag" } ? boolean
	: D extends { type: "confirm" } ? boolean | undefined
	: D extends { type: "enum"; values: readonly (infer V extends string)[] } ? V | undefined
	: D extends { type: "number" } ? number | undefined
	: string | undefined;

/**
 * Bound as `Record<string, unknown>` rather than `ArgDefsShape<T>` so this composes inside
 * other generics (e.g. indexing a command map) without re-proving the self-referential shape
 * constraint at every nesting level — `ArgDefOf` falls back to `never` for anything malformed,
 * which `.from()`/`.commandFrom()` already reject at the point a defs object is constructed.
 */
export type ParsedArgs<T extends Record<string, unknown>> = {
	[K in keyof T as K extends DescriptionKey ? never : K]: InferValue<ArgDefOf<T, K>>;
};

type ResolveValue<V> = [V] extends [boolean | undefined] ? boolean : V;

/** After `resolve()`, all confirms are filled in and `boolean | undefined` collapses to `boolean`. */
export type ResolvedArgs<T extends Record<string, unknown>> = {
	[K in keyof T as K extends DescriptionKey ? never : K]: ResolveValue<InferValue<ArgDefOf<T, K>>>;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeSpecs(required: RequiredInput | undefined): RequiredSpec[] {
	if (required === undefined) return [];
	return Array.isArray(required) ? required : [required];
}

function specIsActive(spec: RequiredSpec, resolved: Record<string, unknown>): boolean {
	if (spec === false) return false;
	if (spec === true || typeof spec === "string") return true;
	if ("if" in spec) return Boolean(resolved[spec.if]);
	return !resolved[(spec as { ifNot: string }).ifNot];
}

function activeSpecs(specs: RequiredSpec[], resolved: Record<string, unknown>): RequiredSpec[] {
	return specs.filter((spec) => specIsActive(spec, resolved));
}

function collectCannotBe(specs: RequiredSpec[]): string[] {
	const result: string[] = [];
	for (const spec of specs) {
		if (typeof spec === "object" && "cannotBe" in spec && spec.cannotBe) {
			result.push(...spec.cannotBe);
		}
	}
	return [...new Set(result)];
}

function collectHint(specs: RequiredSpec[]): string {
	return specs
		.map((spec) => {
			if (typeof spec === "string") return spec;
			if (typeof spec === "object" && "message" in spec) return spec.message ?? "";
			return "";
		})
		.filter(Boolean)
		.join("; ");
}

function toKebab(key: string): string {
	return key.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function isHelpFlag(rawArgs: string[]): boolean {
	return rawArgs.includes("--help") || rawArgs.includes("-h");
}

function descriptionOf(defs: Record<string, unknown>): string | undefined {
	const raw = defs[DESCRIPTION_KEY];
	return typeof raw === "string" ? raw : undefined;
}

function formatArgName(key: string, def: ArgDef): string {
	const kebab = toKebab(key);
	const aliases = (def.aliases ?? []).map((a) => a.replace(/^-+/, ""));
	const names = [`--${kebab}`, ...aliases.map((a) => a.length === 1 ? `-${a}` : `--${a}`)];
	if (def.type === "confirm") return `${names.join(", ")} / --no-${kebab}`;
	if (def.type === "enum") return `${names.join(", ")} <${def.values.join("|")}>`;
	if (def.type === "flag") return names.join(", ");
	return `${names.join(", ")} <value>`;
}

function formatArgMeta(def: ArgDef): string[] {
	const meta: string[] = [];
	if (def.type !== "flag" && def.required) meta.push("required");
	if ("default" in def && def.default !== undefined) meta.push(`default: ${def.default}`);
	return meta;
}

function formatListLines(rows: (readonly [string, string | undefined])[]): string[] {
	const width = Math.max(0, ...rows.map(([name]) => name.length));
	return rows.map(([name, desc]) =>
		`  ${colorize(name.padEnd(width), "porple")}${desc ? `  ${desc}` : ""}`
	);
}

function formatArgLines(entries: [string, ArgDef][]): string[] {
	return formatListLines(entries.map(([key, def]) => {
		const meta = formatArgMeta(def);
		const desc = [def.$description, meta.length ? `(${meta.join(", ")})` : ""]
			.filter(Boolean)
			.join(" ");
		return [formatArgName(key, def), desc] as const;
	}));
}

const _enc = new TextEncoder();
function _write(s: string) {
	Deno.stdout.writeSync(_enc.encode(s));
}

// ─── ArgParser ────────────────────────────────────────────────────────────────

export class ArgParser<T extends ArgDefsShape<T> = ArgDefs> {
	private _parsed: Record<string, string | boolean | number | undefined> = {};
	private _explicitlySet = new Set<string>();

	constructor(private rawArgs: string[], private defs: T = {} as T) {
		this._parse();
	}

	/** Real arg-def entries, excluding the reserved `$description` key. */
	private _entries(): [string, ArgDef][] {
		return (Object.entries(this.defs) as [string, ArgDef][]).filter(([key]) =>
			key !== DESCRIPTION_KEY
		);
	}

	private _aliasMap(): Map<string, string> {
		const map = new Map<string, string>();
		for (const [key, def] of this._entries()) {
			const kebab = toKebab(key);
			map.set(key, key);
			map.set(`--${key}`, key);
			if (kebab !== key) map.set(`--${kebab}`, key);
			for (const alias of (def.aliases ?? [])) {
				const bare = alias.replace(/^-+/, "");
				map.set(`-${bare}`, key);
				map.set(`--${bare}`, key);
			}
		}
		return map;
	}

	private _parse() {
		const aliasMap = this._aliasMap();
		const defs = this.defs as Record<string, ArgDef>;

		for (const [key, def] of this._entries()) {
			if (def.type === "flag") {
				this._parsed[key] = def.default ?? false;
			} else if (def.type === "number") {
				this._parsed[key] = def.default;
			} else if (def.type !== "confirm" && "default" in def && def.default !== undefined) {
				// ConfirmDef defaults are applied lazily in resolve() so we can detect unset values
				this._parsed[key] = def.default;
			}
		}

		for (const arg of this.rawArgs) {
			if (arg.startsWith("--") && arg.includes("=")) {
				const eqIdx = arg.indexOf("=");
				const rawName = arg.slice(2, eqIdx);
				const value = arg.slice(eqIdx + 1);
				const key = aliasMap.get(`--${rawName}`);
				if (key) {
					const def = defs[key];
					if (def?.type === "enum" && !def.values.includes(value)) {
						throw new Error(
							`Invalid value "${value}" for --${rawName}. Expected one of: ${
								def.values.join(", ")
							}`,
						);
					}
					if (def?.type === "number") {
						this._parsed[key] = Number(value);
					} else {
						this._parsed[key] = value;
					}
					this._explicitlySet.add(key);
				}
			} else if (arg.startsWith("-")) {
				const raw = arg.startsWith("--") ? arg.slice(2) : arg.slice(1);
				const isNegated = raw.startsWith("no-");
				const name = isNegated ? raw.slice(3) : raw;
				const key = aliasMap.get(`--${name}`) ?? aliasMap.get(`-${name}`);
				const def = key ? defs[key] : undefined;
				if (key && (def?.type === "flag" || def?.type === "confirm")) {
					this._parsed[key] = !isNegated;
					this._explicitlySet.add(key);
				}
			}
		}
	}

	get<K extends ArgKeys<T>>(key: K): InferValue<ArgDefOf<T, K>> {
		return this._parsed[key as string] as InferValue<ArgDefOf<T, K>>;
	}

	/** Renders `--help` output: the group's `$description` (if any) followed by its args. */
	helpText(programName?: string): string {
		const lines: string[] = [];
		if (programName) lines.push(colorize(`Usage: ${programName} [options]`, "gray"));
		const description = descriptionOf(this.defs);
		if (description) lines.push(description);
		const entries = this._entries();
		if (lines.length) lines.push("");
		if (entries.length) {
			lines.push(colorize("Options:", "gray"));
			lines.push(...formatArgLines(entries));
		}
		return lines.join("\n");
	}

	/**
	 * Validates and resolves all arg values.
	 *
	 * `--help`/`-h` short-circuits: prints `helpText()` and exits the process.
	 *
	 * Non-interactive (piped/CI): validates CLI-provided values and throws immediately
	 * listing all missing required args. No prompting is attempted.
	 *
	 * Interactive (TTY): prompts for any missing required values, validates schema
	 * on string inputs, and re-prompts on failure.
	 */
	async resolve(): Promise<ResolvedArgs<T>> {
		if (isHelpFlag(this.rawArgs)) {
			_write(this.helpText() + "\n");
			Deno.exit(0);
		}

		const result = { ...this._parsed } as Record<string, unknown>;
		const isInteractive = Deno.stdin.isTerminal();

		if (!isInteractive) {
			const errors: string[] = [];
			for (const [key, def] of this._entries()) {
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
					const specs = normalizeSpecs(def.required);
					const active = activeSpecs(specs, result);
					if (active.length === 0) {
						result[key] = def.default ?? false;
					} else {
						const hint = collectHint(active);
						errors.push(`--${displayKey}${hint ? `: ${hint}` : ""}`);
					}
					continue;
				}
				const specs = normalizeSpecs((def as StringArgDef | EnumArgDef).required);
				const active = activeSpecs(specs, result);
				if (active.length > 0) {
					const hint = collectHint(active);
					errors.push(`--${displayKey}${hint ? `: ${hint}` : ""}`);
				}
			}
			if (errors.length > 0) {
				throw new Error(`Missing required arguments:\n${errors.map((e) => `  ${e}`).join("\n")}`);
			}
			return result as ResolvedArgs<T>;
		}

		for (const [key, def] of this._entries()) {
			if (def.type === "flag") continue;

			const current = result[key];
			const specs = normalizeSpecs((def as ConfirmDef | StringArgDef | EnumArgDef).required);
			const active = activeSpecs(specs, result);

			if (def.type === "confirm") {
				if (current !== undefined || active.length === 0) {
					if (current === undefined) result[key] = def.default ?? false;
					continue;
				}
				const label = def.prompt ?? key;
				const hint = def.showHint !== false ? collectHint(active) : "";
				const hintStr = hint ? ` ${colorize(`(${hint})`, "gray")}` : "";
				const q = `${colorize("?", "porple")} ${colorize(label, "white")}${hintStr}`;
				result[key] = await cliConfirm(q, def.default);
				continue;
			}

			const isExplicit = this._explicitlySet.has(key);
			if (current !== undefined && (isExplicit || active.length === 0)) {
				if ("schema" in def && def.schema) {
					const check = def.schema.safeParse(current as string);
					if (!check.success) {
						throw new Error(`--${key}: ${check.issues.map((i) => i.message).join(", ")}`);
					}
				}
				continue;
			}

			if (active.length === 0) continue;

			const label = (def as StringArgDef | EnumArgDef).prompt ?? key;
			const cannotBe = collectCannotBe(active);
			const hint = (def as StringArgDef | EnumArgDef).showHint !== false ? collectHint(active) : "";
			const hintStr = hint ? ` ${colorize(`(${hint})`, "gray")}` : "";

			if (def.type === "enum") {
				const q = `${colorize("?", "porple")} ${colorize(label, "white")}${hintStr}`;
				const choices = cannotBe.length ? def.values.filter((v) => !cannotBe.includes(v)) : [
					...def.values,
				];
				const selected = await selectMenuInteractive(q, choices);
				result[key] = selected ?? def.default;
			} else {
				const promptLabel = `${colorize("?", "porple")} ${colorize(label, "white")}${hintStr}`;
				let value: string | undefined;
				while (!value || cannotBe.includes(value)) {
					if (value !== undefined) {
						_write(
							`  ${colorize("✗", "red")} ${colorize(`"${value}" is not allowed here`, "red")}\n`,
						);
					}
					value = await cliPrompt(
						promptLabel,
						current as string | undefined,
					);
					if (value && "schema" in def && def.schema) {
						const check = def.schema.safeParse(value);
						if (!check.success) {
							_write(
								`  ${colorize("✗", "red")} ${
									colorize(check.issues.map((i) => i.message).join(", "), "red")
								}\n`,
							);
							value = undefined;
						}
					}
				}
				result[key] = value;
			}
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

	static from<T extends ArgDefsShape<T>>(rawArgs: string[], defs: T): ArgParser<T> {
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
	static commandFrom<C extends CommandDefsShape<C>>(
		rawArgs: string[],
		commands: C,
	): CommandArgParser<C> {
		return new CommandArgParser(rawArgs, commands);
	}
}

// ─── Command dispatch ──────────────────────────────────────────────────────────

export type CommandDefs = Record<string, ArgDefs>;

/**
 * Validates each command's defs against `ArgDefsShape`, keeping their literal inferred types.
 * `$description` is reserved at this root level too — a string describing the whole program,
 * shown above the command list in `--help` output.
 */
export type CommandDefsShape<C> = {
	[K in keyof C]: K extends DescriptionKey ? string : ArgDefsShape<C[K]>;
};

/** Keys of `C` that are real commands (i.e. everything but `$description`). */
type CommandKeys<C> = Exclude<keyof C, DescriptionKey>;

/** Union of all command names in `C`. */
export type CommandName<C extends CommandDefsShape<C>> = CommandKeys<C>;

/** Discriminated union of `{ command } & ResolvedArgs` for each command in `C`. */
export type CommandResolvedArgs<C extends CommandDefsShape<C>> = {
	[K in CommandKeys<C>]: { command: K } & ResolvedArgs<C[K]>;
}[CommandKeys<C>];

export class CommandArgParser<C extends CommandDefsShape<C>> {
	private _command: CommandKeys<C> | undefined;
	private _parser: ArgParser<ArgDefs> | undefined;

	constructor(private rawArgs: string[], private commands: C) {
		const idx = rawArgs.findIndex((a) => !a.startsWith("-"));
		const name = idx === -1 ? undefined : rawArgs[idx];
		if (name !== undefined && name !== DESCRIPTION_KEY && name in commands) {
			this._activate(name as CommandKeys<C>);
		}
	}

	/** Sets the active command, dropping its positional token (if present) from the remaining args. */
	private _activate(command: CommandKeys<C>) {
		const idx = this.rawArgs.findIndex((a) => !a.startsWith("-"));
		const rest = idx === -1 || this.rawArgs[idx] !== command
			? this.rawArgs
			: [...this.rawArgs.slice(0, idx), ...this.rawArgs.slice(idx + 1)];
		this._command = command;
		this._parser = new ArgParser(rest, this.commands[command] as unknown as ArgDefs);
	}

	/** The matched command name, or `undefined` if the leading token isn't a known command. */
	get command(): CommandKeys<C> | undefined {
		return this._command;
	}

	/** All known command names. */
	get commandNames(): CommandKeys<C>[] {
		return (Object.keys(this.commands) as CommandKeys<C>[]).filter((k) => k !== DESCRIPTION_KEY);
	}

	/** Positional args following the command name. */
	get commandArgs(): string[] {
		return this._parser?.nonFlags ?? [];
	}

	/** Synchronous read of a single arg for the given command, typed from its arg defs. */
	get<K extends CommandKeys<C>, A extends ArgKeys<C[K]>>(
		command: K,
		key: A,
	): InferValue<ArgDefOf<C[K], A>> | undefined {
		if (this._command !== command || !this._parser) return undefined;
		return this._parser.get(key as string) as InferValue<ArgDefOf<C[K], A>> | undefined;
	}

	/** Renders `--help` output: the matched command's args, or the list of all commands if none matched. */
	helpText(programName = ""): string {
		if (this._command !== undefined && this._parser) {
			const label = programName ? `${programName} ${String(this._command)}` : String(this._command);
			return this._parser.helpText(label);
		}
		const lines: string[] = [];
		const description = descriptionOf(this.commands);
		if (description) lines.push(description, "");
		const rows = this.commandNames.map((name) =>
			[String(name), descriptionOf(this.commands[name])] as const
		);
		lines.push(colorize("Commands:", "gray"), ...formatListLines(rows));
		return lines.join("\n");
	}

	/**
	 * @param options.promptForCommand When set and no valid command was given, prompt for one
	 * via `selectMenuInteractive` instead of throwing. Pass a string to customize the prompt.
	 */
	async resolve(
		options?: { promptForCommand?: boolean | string },
	): Promise<CommandResolvedArgs<C>> {
		if (isHelpFlag(this.rawArgs)) {
			_write(this.helpText() + "\n");
			Deno.exit(0);
		}

		if ((this._command === undefined || !this._parser) && options?.promptForCommand) {
			const q = typeof options.promptForCommand === "string"
				? options.promptForCommand
				: "Select a command";
			const selected = await selectMenuInteractive(q, this.commandNames as string[]);
			if (selected && selected in this.commands) this._activate(selected as CommandKeys<C>);
		}

		if (this._command === undefined || !this._parser) {
			const name = this.rawArgs.find((a) => !a.startsWith("-"));
			const available = this.commandNames.join(", ");
			throw new Error(
				name
					? `Unknown command "${name}". Expected one of: ${available}`
					: `Missing command. Expected one of: ${available}`,
			);
		}
		const resolved = await this._parser.resolve();
		return { command: this._command, ...resolved } as CommandResolvedArgs<C>;
	}
}
