import { css } from "@lib/tags.ts";
import { PopoverBase } from "./base.ts";
import { registerElement } from "@lib/registerElements.ts";

export class PopoverIcon extends PopoverBase {
	override connectedCallback(): void {
		console.log(this.children);

		if (!this.hasAttribute("icon")) {
			console.warn("PopoverIcon has no icon attribute");
		}
		if (this.children.length === 0) console.warn("PopoverIcon has no content");
		super.connectedCallback();
		const icon = document.createElement("bm-icon");
		icon.setAttribute("slot", "trigger");
		icon.setAttribute("icon", this.getAttribute("icon")!);
		this.appendChild(icon);
		const style = document.createElement("style");
		style.textContent = css`
			bm-icon {
				display: inline-block;
				width: 1em;
				height: 1em;
			}

			bm-icon-popover[small] > bm-icon {
				width: 0.75em;
				height: 0.75em;
			}

			bm-icon-popover[large] > bm-icon {
				width: 1.25em;
				height: 1.25em;
			}
		`;
		this.prepend(style);
	}
}

registerElement("bm-icon-popover", PopoverIcon);
