import type { CalcNode } from "../types.ts";

export function emitCalcCSS(node: CalcNode): string {
	if (typeof node === "number") return String(node);
	if (typeof node === "string") return resolveRefs(node);
	const { op, left, right } = node.$calc;
	return `calc(${emitCalcCSS(left)} ${op} ${emitCalcCSS(right)})`;
}
export function isCalcNode(v: unknown): v is CalcNode {
	return typeof v === "object" && v !== null && "$calc" in v;
}
export function resolveRefs(v: string, evaluate = false): string {
	// TODO: hoist this and give the evaluate case a resolver
	return evaluate ? v : `var(${v.replace("$", "..").replace(/\./g, "-")})`;
}
