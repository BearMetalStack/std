import { emitCalcCSS } from "./calc.ts";
import type { CalcNode, Theme, Variant } from "./types.ts";
import { indent } from "@bearmetal/miscellanea";

export function buildVariantsCss(theme: Theme) {
	const variants = theme["#variants"]?.sort((a, b) => {
		if (a.default && !b.default) return -1;
		if (!a.default && b.default) return 1;
		return 0;
	}) ?? [];
	variants.forEach((v) => {
		return v.__compiled = compileVariant(v);
	});
	return variants.flatMap((v) => {
		const sections: string[] = [];
		if (v.default) sections.push(`:root {\n${v.__compiled}\n}`);
		if (v.media) sections.push(`@media ${v.media} {\n${indent(`:root {\n${v.__compiled}\n}`)}\n}`);
		sections.push(`:root[data-theme="${v.name}"] {\n${v.__compiled}\n}`);
		return sections;
	}).join("\n\n");
}

function compileVariant(variant: Variant) {
	return indent(
		Object.entries(variant.rules).map(([k, v]) => `${k}: ${resolveValueCSS(v)};`.replace(";;", ";"))
			.join("\n"),
	);
}

function resolveValueCSS(v: string | CalcNode) {
	if (typeof v === "object" && v["$calc"]) return emitCalcCSS(v);
	else if (typeof v === "string" && v.startsWith("$")) {
		return `var(${v.replace("$", "--").replaceAll(".", "-")})`;
	}
	return v;
}
