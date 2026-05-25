// TODO: type this properly
export type Theme = {
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
