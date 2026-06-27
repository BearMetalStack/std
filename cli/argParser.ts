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
};

export type ArgDef = FlagDef | ConfirmDef | StringArgDef | EnumArgDef;
export type ArgDefs = Record<string, ArgDef>;

// ─── Type inference ────────────────────────────────────────────────────────────

type InferValue<D extends ArgDef> = D extends { type: "flag" } ? boolean
	: D extends { type: "confirm" } ? boolean | undefined
	: D extends { type: "enum"; values: readonly (infer V extends string)[] } ? V | undefined
	: string | undefined;

export type ParsedArgs<T extends ArgDefs> = {
	[K in keyof T]: InferValue<T[K]>;
};

type ResolveValue<V> = [V] extends [boolean | undefined] ? boolean : V;

/** After `resolve()`, all confirms are filled in and `boolean | undefined` collapses to `boolean`. */
export type ResolvedArgs<T extends ArgDefs> = {
	[K in keyof T]: ResolveValue<InferValue<T[K]>>;
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

const _enc = new TextEncoder();
function _write(s: string) {
	Deno.stdout.writeSync(_enc.encode(s));
}

// ─── ArgParser ────────────────────────────────────────────────────────────────

export class ArgParser<T extends ArgDefs = ArgDefs> {
	private _parsed: Record<string, string | boolean | undefined> = {};
	private _explicitlySet = new Set<string>();

	constructor(private rawArgs: string[], private defs: T = {} as T) {
		this._parse();
	}

	private _aliasMap(): Map<string, string> {
		const map = new Map<string, string>();
		for (const [key, def] of Object.entries(this.defs)) {
			const kebab = key.replace(/([A-Z])/g, "-$1").toLowerCase();
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

		for (const [key, def] of Object.entries(this.defs)) {
			if (def.type === "flag") {
				this._parsed[key] = def.default ?? false;
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
					const def = this.defs[key];
					if (def?.type === "enum" && !def.values.includes(value)) {
						throw new Error(
							`Invalid value "${value}" for --${rawName}. Expected one of: ${
								def.values.join(", ")
							}`,
						);
					}
					this._parsed[key] = value;
					this._explicitlySet.add(key);
				}
			} else if (arg.startsWith("-")) {
				const raw = arg.startsWith("--") ? arg.slice(2) : arg.slice(1);
				const isNegated = raw.startsWith("no-");
				const name = isNegated ? raw.slice(3) : raw;
				const key = aliasMap.get(`--${name}`) ?? aliasMap.get(`-${name}`);
				const def = key ? this.defs[key] : undefined;
				if (key && (def?.type === "flag" || def?.type === "confirm")) {
					this._parsed[key] = !isNegated;
					this._explicitlySet.add(key);
				}
			}
		}
	}

	get<K extends keyof T>(key: K): InferValue<T[K]> {
		return this._parsed[key as string] as InferValue<T[K]>;
	}

	/**
	 * Validates and resolves all arg values.
	 *
	 * Non-interactive (piped/CI): validates CLI-provided values and throws immediately
	 * listing all missing required args. No prompting is attempted.
	 *
	 * Interactive (TTY): prompts for any missing required values, validates schema
	 * on string inputs, and re-prompts on failure.
	 */
	async resolve(): Promise<ResolvedArgs<T>> {
		const result = { ...this._parsed } as Record<string, unknown>;
		const isInteractive = Deno.stdin.isTerminal();

		if (!isInteractive) {
			const errors: string[] = [];
			for (const [key, def] of Object.entries(this.defs)) {
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

		for (const [key, def] of Object.entries(this.defs)) {
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

	get task(): string {
		return this.nonFlags[0];
	}

	get taskArgs(): string[] {
		return this.nonFlags.slice(1);
	}

	static from<T extends ArgDefs>(rawArgs: string[], defs: T): ArgParser<T> {
		return new ArgParser(rawArgs, defs);
	}

	/** Backward-compatible: parse without definitions */
	static parse(args: string[]): ArgParser<ArgDefs> {
		return new ArgParser(args, {});
	}
}
