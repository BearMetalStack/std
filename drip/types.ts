// TODO: type this properly
export type Theme = {
	/**
	 * Theme variants. `#variants` is the original spelling and is still read for
	 * compatibility; new themes are written with `variants`.
	 */
	variants?: Variant[];
	"#variants"?: Variant[];
	[key: string]: Theme | CalcRoot | Variant[] | string | undefined;
};
export interface Variant {
	name: string;
	media?: string;
	default?: boolean;
	rules: Record<string, string | CalcRoot>;
	__compiled?: string;
}
export type SectionedTokens = ([string, string, PropertyType] | string)[];
export type PropertyType = "<color>" | "<*>";
export type CalcRoot = { $calc: BinaryOp };
export type CalcNode =
	| CalcRoot
	| string
	| number;

export type BinaryOp = {
	op: "+" | "-" | "*" | "/";
	left: CalcNode;
	right: CalcNode;
};

export type { CompliantID } from "./css/compliantCSS.ts";
export type { DiagnosticLevel, DripDiagnostic } from "./css/validate.ts";
export type { FillRole, SemanticRole, VariantTokenDef, VariantTokenGroup } from "./css/tokens.ts";
export type { BuildVariantsOptions } from "./css/variants.ts";
