import BaseCSS from "./base.css" with { type: "css" };
import ComponentsCSS from "./components.css" with { type: "css" };
import AnimationsCSS from "./animations.css" with { type: "css" };

const base = Array.from(BaseCSS.cssRules).map((rule) => rule.cssText).join("\n");
const components = Array.from(ComponentsCSS.cssRules).map((rule) => rule.cssText).join("\n");
const animations = Array.from(AnimationsCSS.cssRules).map((rule) => rule.cssText).join("\n");

export type CompliantID = "base" | "components" | "animations"

export default function compliantCSS(compliantId: CompliantID): string {
	switch (compliantId) {
		case "base":
			return base;
		case "components":
			return components;
		case "animations":
			return animations;
	}
}
