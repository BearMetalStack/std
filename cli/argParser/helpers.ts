import { currentSession } from "../render/mod.ts";
import { colorize } from "../style.ts";
import type {
	ArgDef,
	ConfirmDef,
	EnumArgDef,
	FlagDef,
	ListArgDef,
	NumArgDef,
	RequiredInput,
	RequiredSpec,
	RequiredSpecIf,
	RequiredSpecIfNot,
	StringArgDef,
} from "./types.ts";
import { DESCRIPTION_KEY } from "./types.ts";
import { compareStrings, toKebabCase } from "@bearmetal/miscellanea";

export function normalizeSpecs(required: RequiredInput | undefined): RequiredSpec[] {
	if (required === undefined) return [];
	return Array.isArray(required) ? required : [required];
}

/** Truthiness for `if`/`ifNot` conditions — an empty `list` result is "not present" even though `[]` is truthy in JS. */
export function isPresent(value: unknown): boolean {
	return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export function specIsActive(spec: RequiredSpec, resolved: Record<string, unknown>): boolean {
	if (spec === false) return false;
	if (spec === true || typeof spec === "string") return true;
	if ("if" in spec) return isPresent(resolved[spec.if]);
	return !isPresent(resolved[(spec as { ifNot: string }).ifNot]);
}

export function activeSpecs(
	specs: RequiredSpec[],
	resolved: Record<string, unknown>,
): RequiredSpec[] {
	return specs.filter((spec) => specIsActive(spec, resolved));
}

export function collectCannotBe(specs: RequiredSpec[]): string[] {
	const result: string[] = [];
	for (const spec of specs) {
		if (typeof spec === "object" && "cannotBe" in spec && spec.cannotBe) {
			result.push(...spec.cannotBe);
		}
	}
	return [...new Set(result)];
}

export function collectHint(specs: RequiredSpec[]): string {
	return specs
		.map((spec) => {
			if (typeof spec === "string") return spec;
			if (typeof spec === "object" && "message" in spec) return spec.message ?? "";
			return "";
		})
		.filter(Boolean)
		.join("; ");
}

export function isHelpFlag(rawArgs: string[]): boolean {
	return rawArgs.includes("--help") || rawArgs.includes("-h");
}

// ─── Token classification ─────────────────────────────────────────────────────

/**
 * A single argv token, read for shape only — before it is matched against any defs.
 *
 * Classifying up front is what makes a mistyped or malformed option *detectable*. The parser
 * previously pattern-matched inline and fell through silently on anything it didn't recognise,
 * so `--contnet=x`, `--name value` and `-f=path` all ended up doing nothing at all.
 */
export type ArgToken =
	/** Not an option: a command name, or a positional. */
	| { kind: "positional"; raw: string }
	/** `--` — everything after it is positional, whatever it looks like. */
	| { kind: "terminator"; raw: string }
	| {
		kind: "named";
		raw: string;
		/** The name with dashes and any `no-` prefix stripped. */
		name: string;
		/** Present only for the `=value` form. */
		value?: string;
		negated: boolean;
		short: boolean;
	};

/** Reads one argv token's shape. */
export function classifyToken(raw: string): ArgToken {
	if (raw === "--") return { kind: "terminator", raw };
	// A negative number is a value, not an option. Without this, `-5` reads as `-5`.
	if (!raw.startsWith("-") || /^-\d/.test(raw)) return { kind: "positional", raw };

	const short = !raw.startsWith("--");
	const body = raw.slice(short ? 1 : 2);
	if (body.length === 0) return { kind: "positional", raw };

	const eq = body.indexOf("=");
	const rawName = eq === -1 ? body : body.slice(0, eq);
	const value = eq === -1 ? undefined : body.slice(eq + 1);
	const negated = value === undefined && rawName.startsWith("no-");

	return {
		kind: "named",
		raw,
		name: negated ? rawName.slice(3) : rawName,
		value,
		negated,
		short,
	};
}

/** How a named token was spelled, for error messages. */
export function tokenLabel(token: Extract<ArgToken, { kind: "named" }>): string {
	return `${token.short ? "-" : "--"}${token.negated ? "no-" : ""}${token.name}`;
}

/** Whether a token is `--help`/`-h`, which every parser answers before anything else. */
export function isHelpToken(token: ArgToken): boolean {
	return token.kind === "named" && (token.name === "help" || token.name === "h");
}

/** Booleans accepted for the `--flag=value` form. */
export function parseBooleanValue(value: string): boolean | undefined {
	const normalized = value.trim().toLowerCase();
	if (["true", "yes", "y", "1", "on"].includes(normalized)) return true;
	if (["false", "no", "n", "0", "off"].includes(normalized)) return false;
	return undefined;
}

/** The closest declared name to `name`, when one is close enough to be worth suggesting. */
export function suggestName(name: string, known: Iterable<string>): string | undefined {
	let best: string | undefined;
	let bestScore = Infinity;
	for (const candidate of known) {
		const score = compareStrings(name, candidate);
		if (score < bestScore) {
			bestScore = score;
			best = candidate;
		}
	}
	// Two edits on a short name is already a different word. Two on anything longer usually is
	// not — and a transposition, the most common typo of all, costs two in plain Levenshtein
	// (`nmae` → `name`), so a limit of one would miss exactly the case worth catching.
	const limit = name.length >= 4 ? 2 : 1;
	return best !== undefined && bestScore <= limit ? best : undefined;
}

/** `Unknown option --foo. Did you mean --food?` */
export function unknownOptionMessage(
	token: Extract<ArgToken, { kind: "named" }>,
	known: Iterable<string>,
): string {
	const suggestion = suggestName(token.name, known);
	const base = `Unknown option ${tokenLabel(token)}`;
	return suggestion ? `${base}. Did you mean --${suggestion}?` : base;
}

export function descriptionOf(defs: Record<string, unknown>): string | undefined {
	const raw = defs[DESCRIPTION_KEY];
	return typeof raw === "string" ? raw : undefined;
}

export function formatArgName(key: string, def: ArgDef): string {
	const kebab = toKebabCase(key);
	const aliases = (def.aliases ?? []).map((a) => a.replace(/^-+/, ""));
	const names = [`--${kebab}`, ...aliases.map((a) => a.length === 1 ? `-${a}` : `--${a}`)];
	if (def.type === "confirm") return `${names.join(", ")} / --no-${kebab}`;
	if (def.type === "enum") return `${names.join(", ")} <${def.values.join("|")}>`;
	if (def.type === "flag") return names.join(", ");
	return `${names.join(", ")} =${
		def.schema && def.schema.getDescription() ? def.schema.getDescription() : "<value>"
	}`;
}

export function formatArgMeta(def: ArgDef): string[] {
	const meta: string[] = [];
	if (def.required) meta.push(formatRequired(def));
	if (def.type === "list") meta.push("repeatable");
	if ("default" in def && def.default !== undefined) {
		if (Array.isArray(def.default)) {
			if (def.default.length > 0) meta.push(`default: ${def.default.join(", ")}`);
		} else {
			meta.push(`default: ${def.default}`);
		}
	}
	return meta;
}

export type RequirableArgDef =
	| FlagDef
	| ConfirmDef
	| StringArgDef
	| NumArgDef
	| EnumArgDef
	| ListArgDef;
export function isRequiredSpecIf(req: RequiredSpec): req is RequiredSpecIf {
	return typeof req === "object" && "if" in req;
}
export function isRequiredSpecIfNot(req: RequiredSpec): req is RequiredSpecIfNot {
	return typeof req === "object" && "ifNot" in req;
}
export function formatRequired(def: RequirableArgDef): string {
	if (!def.required) return "";
	let res = "required";
	if (Array.isArray(def.required)) {
		const ifs = def.required.reduce<{ if: string[]; ifNot: string[] }>((acc, v) => {
			if (typeof v === "string") {
				acc.if.push(v);
			}
			if (isRequiredSpecIf(v)) acc.if.push(v.if);
			if (isRequiredSpecIfNot(v)) acc.ifNot.push(v.ifNot);
			return acc;
		}, { if: [], ifNot: [] });
		res += [
			ifs.if.filter(Boolean).map((e) => "--" + toKebabCase(e)).join(", ").replace(
				/^(\w)/,
				"when $1",
			),
			ifs.ifNot.filter(Boolean).map((e) => "--" + toKebabCase(e)).join(", ").replace(
				/^(\w)/,
				"without $1",
			),
		]
			.filter(Boolean).join("; required").replace(/^(\w)/, " $1");
	} else if (typeof def.required === "object") {
		const ifs: string[] = [];
		if (isRequiredSpecIf(def.required)) ifs.push(`when --${toKebabCase(def.required.if)}`);
		if (isRequiredSpecIfNot(def.required)) {
			ifs.push(`without --${toKebabCase(def.required.ifNot)}`);
		}
		res += ifs.join("; ").replace(/^(\w)/, " $1");
	}
	return res;
}

export function formatListLines(rows: (readonly [string, string | undefined])[]): string[] {
	const width = Math.max(0, ...rows.map(([name]) => name.length));
	return rows.map(([name, desc]) =>
		`  ${colorize(name.padEnd(width), "porple")}${desc ? `  ${desc}` : ""}`
	);
}

export function formatArgLines(entries: [string, ArgDef][]): string[] {
	return formatListLines(entries.map(([key, def]) => {
		const meta = formatArgMeta(def);
		const desc = [def.$description, meta.length ? `(${meta.join("; ")})` : ""]
			.filter(Boolean)
			.join(" ");
		return [formatArgName(key, def), desc] as const;
	}));
}

const _enc = new TextEncoder();

/**
 * Writes to wherever the active session is drawing, or straight to stdout.
 *
 * Going through the session matters when one is running: it keeps this output on
 * the same sink the widgets use, so a test can capture it and a redirected run
 * does not mix streams.
 */
export function _write(s: string) {
	const session = currentSession();
	if (session) session.out.write(s);
	else Deno.stdout.writeSync(_enc.encode(s));
}
