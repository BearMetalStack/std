import { parse } from "./parser.ts";
import { unwrapSignal } from "./unwrap.ts";
import type {
	ComparePredicate,
	EvaluateOptions,
	Location,
	Predicate,
	Query,
	SliceStep,
	Step,
} from "./types.ts";

type Unwrap = (value: unknown) => unknown;

/**
 * Runs `query` against `root` and returns every location it lands on, in
 * order. Never throws on data shape: a key that is missing, or a member that
 * is not an object, simply contributes nothing.
 *
 * A key step that lands on an array contributes the array's elements rather
 * than the array, so `characters` is the set of characters whether it holds
 * an array or one object, and filters always test members.
 *
 * Signals are read through wherever they appear (see `unwrapSignal`), so
 * evaluating inside a `Signal.Computed` tracks exactly what was read.
 */
export function evaluate(
	root: unknown,
	query: string | Query,
	options: EvaluateOptions = {},
): Location[] {
	const parsed = typeof query === "string" ? parse(query) : query;
	const unwrap = options.unwrap ?? unwrapSignal;
	const start = parsed.relative && "self" in options ? options.self : root;

	const value = unwrap(start);
	let set = spread(value === start ? { value } : { value, cell: start }, unwrap);
	for (const step of parsed.steps) set = apply(set, step, options, unwrap);
	return set;
}

/** `evaluate`, returning only the values. */
export function values(
	root: unknown,
	query: string | Query,
	options?: EvaluateOptions,
): unknown[] {
	return evaluate(root, query, options).map((location) => location.value);
}

function apply(set: Location[], step: Step, options: EvaluateOptions, unwrap: Unwrap): Location[] {
	switch (step.kind) {
		case "key":
			return set.flatMap((member) => readKey(member, step.key, unwrap));
		case "filter":
			return set.filter((member) =>
				step.predicates.every((predicate) => test(member.value, predicate, options, unwrap))
			);
		case "slice":
			return slice(set, step);
	}
}

function spread(location: Location, unwrap: Unwrap): Location[] {
	const { value } = location;
	if (!Array.isArray(value)) return [location];
	return value.map((element, index) => read(location, index, element, unwrap));
}

function read(up: Location, key: string | number, raw: unknown, unwrap: Unwrap): Location {
	const parent = up.value as object;
	const value = unwrap(raw);
	return value === raw ? { parent, key, value, up } : { parent, key, value, cell: raw, up };
}

function readKey(member: Location, key: string, unwrap: Unwrap): Location[] {
	const container = member.value;
	if (container === null || typeof container !== "object") return [];
	const raw = container instanceof Map
		? container.get(key)
		: (container as Record<string, unknown>)[key];
	if (raw === undefined || typeof raw === "function") return [];
	return spread(read(member, key, raw, unwrap), unwrap);
}

function readField(member: unknown, field: string[], unwrap: Unwrap): unknown[] {
	let set: Location[] = [{ value: member }];
	for (const key of field) set = set.flatMap((location) => readKey(location, key, unwrap));
	return set.map((location) => location.value);
}

function test(
	member: unknown,
	predicate: Predicate,
	options: EvaluateOptions,
	unwrap: Unwrap,
): boolean {
	const found = readField(member, predicate.field, unwrap);
	if (predicate.kind === "presence") {
		const present = found.some((value) => value !== null);
		return predicate.negate ? !present : present;
	}

	const operands = operandValues(predicate, options, unwrap);
	if (predicate.op === "!=") {
		return !found.some((left) => operands.some((right) => looseEquals(left, right)));
	}
	return found.some((left) => operands.some((right) => compare(left, predicate.op, right)));
}

function operandValues(
	predicate: ComparePredicate,
	options: EvaluateOptions,
	unwrap: Unwrap,
): unknown[] {
	if (predicate.value.kind === "literal") return [predicate.value.value];
	const value = unwrap(options.vars?.[predicate.value.name]);
	if (value === undefined) return [];
	return Array.isArray(value) ? value.map(unwrap) : [value];
}

function compare(left: unknown, op: ComparePredicate["op"], right: unknown): boolean {
	switch (op) {
		case "=":
			return looseEquals(left, right);
		case "~":
			return isText(left) && isText(right) &&
				String(left).toLowerCase().includes(String(right).toLowerCase());
		case "!=":
			return !looseEquals(left, right);
		default:
			return ordered(left, op, right);
	}
}

/** `3` equals `"3"`, `true` equals `"true"`, `null` equals `"null"`; objects only by identity. */
function looseEquals(left: unknown, right: unknown): boolean {
	if (left === right) return true;
	if (!isPrimitive(left) || !isPrimitive(right)) return false;
	if (typeof left === "number" || typeof right === "number") {
		const a = toNumber(left);
		const b = toNumber(right);
		return a !== undefined && a === b;
	}
	return String(left) === String(right);
}

function ordered(left: unknown, op: string, right: unknown): boolean {
	let a: number | string | undefined = toNumber(left);
	let b: number | string | undefined = toNumber(right);
	if (a === undefined || b === undefined) {
		if (typeof left !== "string" || typeof right !== "string") return false;
		a = left;
		b = right;
	}
	switch (op) {
		case ">":
			return a > b;
		case ">=":
			return a >= b;
		case "<":
			return a < b;
		default:
			return a <= b;
	}
}

function toNumber(value: unknown): number | undefined {
	if (typeof value === "number") return Number.isNaN(value) ? undefined : value;
	if (typeof value !== "string" || value.trim() === "") return undefined;
	const number = Number(value);
	return Number.isNaN(number) ? undefined : number;
}

function isPrimitive(value: unknown): boolean {
	return value === null || (typeof value !== "object" && typeof value !== "function");
}

function isText(value: unknown): boolean {
	return value !== null && value !== undefined && isPrimitive(value);
}

function slice(set: Location[], step: SliceStep): Location[] {
	if (!step.index) return set.slice(step.start, step.end);
	const index = step.start! < 0 ? set.length + step.start! : step.start!;
	const member = set[index];
	return member ? [member] : [];
}
