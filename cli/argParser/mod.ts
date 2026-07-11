import { colorize } from "../style.ts";
import { cliConfirm, cliPrompt } from "../prompts.ts";
import { selectMenuInteractive } from "../select.ts";
import {
	_write,
	activeSpecs,
	collectCannotBe,
	collectHint,
	descriptionOf,
	formatArgLines,
	formatListLines,
	isHelpFlag,
	isPresent,
	normalizeSpecs,
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
	ResolvedArgs,
	StringArgDef,
} from "./types.ts";
import { DESCRIPTION_KEY } from "./types.ts";
import { toKebabCase } from "@bearmetal/miscellanea";

// ─── Exports ──────────────────────────────────────────────────────────────────

export type * from "./types.ts";
export { DESCRIPTION_KEY } from "./types.ts";

// ─── ArgParser ────────────────────────────────────────────────────────────────

export class ArgParser<T extends ArgDefsShape = ArgDefs> {
	private _parsed: Record<string, string | boolean | number | unknown[] | undefined> = {};
	private _explicitlySet = new Set<string>();
	private _rootCommand?: string;

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
			const kebab = toKebabCase(key);
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
					} else if (def?.type === "list") {
						const mapped = def.map ? def.map(value) : value;
						this._parsed[key] = this._explicitlySet.has(key)
							? [...(this._parsed[key] as unknown[]), mapped]
							: [mapped];
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

	setRootCommand(command: string): ArgParser<T> {
		this._rootCommand = command;
		return this;
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
	 * Checks every `required` spec against the fully-resolved `result`, once every arg's value
	 * is settled. Run as a separate pass after collection (rather than inline, interleaved with
	 * it) so a requirement that depends on another arg declared *later* in the defs object is
	 * checked against that arg's real final value, not whatever it happened to be mid-collection
	 * — collection order no longer has to match dependency order, in either direction.
	 *
	 * Satisfaction is type-aware: a `flag` must resolve `true` (there's no "unset" flag state); a
	 * `list` must resolve to a non-empty array; everything else just needs to be defined.
	 */
	private _validateRequired(result: Record<string, unknown>): string[] {
		const errors: string[] = [];
		for (const [key, def] of this._entries()) {
			if (!("required" in def) || def.required === undefined) continue;
			const active = activeSpecs(normalizeSpecs(def.required), result);
			if (active.length === 0) continue;
			const current = result[key];
			const satisfied = def.type === "flag" ? Boolean(current) : isPresent(current);
			if (satisfied) continue;
			const hint = collectHint(active);
			const displayKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
			errors.push(`--${displayKey}${hint ? `: ${hint}` : ""}`);
		}
		return errors;
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
	 *
	 * Either way, `required` itself is only checked once — see `_validateRequired`.
	 */
	async resolve(): Promise<ResolvedArgs<T>> {
		if (isHelpFlag(this.rawArgs)) {
			_write(this.helpText(this._rootCommand) + "\n");
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
					const active = activeSpecs(normalizeSpecs(def.required), result);
					if (active.length === 0) result[key] = def.default ?? false;
					continue;
				}
				if (def.type === "list") {
					const active = activeSpecs(normalizeSpecs(def.required), result);
					if (active.length === 0) result[key] = def.default ?? [];
					continue;
				}
				// string/enum/number left unresolved when unset — `_validateRequired`, below,
				// reports it if required, once every other arg's value is also settled.
			}
			errors.push(...this._validateRequired(result));
			if (errors.length > 0) {
				throw new Error(`Missing required arguments:\n${errors.map((e) => `  ${e}`).join("\n")}`);
			}
			return result as ResolvedArgs<T>;
		}

		for (const [key, def] of this._entries()) {
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
				const label = def.prompt ?? key;
				const hint = def.showHint !== false ? collectHint(active) : "";
				const hintStr = hint ? ` ${colorize(`(${hint})`, "gray")}` : "";
				const q = `${colorize("?", "porple")} ${colorize(label, "white")}${hintStr}`;
				result[key] = await cliConfirm(q, def.default);
				continue;
			}

			if (def.type === "list") {
				if (current === undefined && active.length === 0) result[key] = def.default ?? [];
				// Otherwise left as-is (already collected from the CLI, or still missing) — lists
				// can't be prompted for, so a missing-but-required list is `_validateRequired`'s
				// call, below, once every other arg's value is settled too.
				if ("schema" in def && def.schema) {
					const check = def.schema.safeParse(current as string[]);
					if (!check.success) {
						throw new Error(`--${key}: ${check.issues.map((i) => i.message).join(", ")}`);
					}
				}
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

		const errors = this._validateRequired(result);
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
export type CommandDefsShape = Record<string, ArgDefsShape | string>;

/** Keys of `C` that are real commands (i.e. everything but `$description`). */
type CommandKeys<C> = Exclude<keyof C, DescriptionKey>;

/**
 * `C[K]`, narrowed to `ArgDefsShape` (falling back to `never` otherwise). Since `CommandDefsShape`
 * is `Record<string, ArgDefsShape | string>`, an abstract `C[K]` widens to include `string` — this
 * degrades safely instead of failing `ResolvedArgs`'s constraint, the same trick `ArgDefOf` uses.
 */
type CommandDefOf<C, K extends keyof C> = C[K] extends ArgDefsShape ? C[K] : never;

/** Union of all command names in `C`. */
export type CommandName<C extends CommandDefsShape> = CommandKeys<C>;

/** Discriminated union of `{ command } & ResolvedArgs` for each command in `C`. */
export type CommandResolvedArgs<C extends CommandDefsShape> = {
	[K in CommandKeys<C>]: { command: K } & ResolvedArgs<CommandDefOf<C, K>>;
}[CommandKeys<C>];

export class CommandArgParser<C extends CommandDefsShape> {
	private _command: CommandKeys<C> | undefined;
	private _parser: ArgParser<ArgDefs> | undefined;
	private _rootCommand?: string;

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

	setRootCommand(command: string | undefined): CommandArgParser<C> {
		this._rootCommand = command;
		return this;
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
			[
				String(name),
				descriptionOf(this.commands[name] as unknown as Record<string, unknown>),
			] as const
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
			_write(this.helpText(this._rootCommand) + "\n");
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
