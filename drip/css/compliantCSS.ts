// import BaseCSS from "./base.css" with { type: "css" };
// import ComponentsCSS from "./components.css" with { type: "css" };
// import AnimationsCSS from "./animations.css" with { type: "css" };

import { dotBearmetalFile } from "@bearmetal/miscellanea/fs";
import { namespaces } from "../namespaces.ts";

// const base = Array.from(BaseCSS.cssRules).map((rule) => rule.cssText).join("\n");
// const components = Array.from(ComponentsCSS.cssRules).map((rule) => rule.cssText).join("\n");
// const animations = Array.from(AnimationsCSS.cssRules).map((rule) => rule.cssText).join("\n");

const COMPLIANT_IDS = ["base", "components", "animations"] as const;
export type CompliantID = typeof COMPLIANT_IDS[number];

export default async function compliantCSS(compliantId: CompliantID): Promise<string> {
	const url = new URL(`./${compliantId}.css`, import.meta.url);
	return await fetch(url).then((res) => res.text());
	// switch (compliantId) {
	// 	case "base":
	// 		return base;
	// 	case "components":
	// 		return components;
	// 	case "animations":
	// 		return animations;
	// }
}

export async function storeStylesheets() {
	for (const id of COMPLIANT_IDS) {
		const stylesheet = await compliantCSS(id);
		const file = await dotBearmetalFile(namespaces.stylesheets, `${id}.css`);
		file.write(stylesheet);
	}
}
