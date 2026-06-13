export * from "./html.ts";

export const NO_ESCAPE = Symbol.for("noescape");
export type NoEscape = string & { [NO_ESCAPE]: true };
export function noEscape(s: string): NoEscape {
	return Object.assign(s, { [NO_ESCAPE]: true }) as NoEscape;
}
export function isNoEscape(s: string | NoEscape): s is NoEscape {
	return (s as NoEscape)[NO_ESCAPE] === true;
}
