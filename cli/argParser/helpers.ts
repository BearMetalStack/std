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
import { toKebabCase } from "@bearmetal/miscellanea";

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
export function _write(s: string) {
	Deno.stdout.writeSync(_enc.encode(s));
}
