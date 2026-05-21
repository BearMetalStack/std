import { css, html } from "@lib/tags.ts";
import { injectStyle } from "@lib/injectStyle.ts";
import { registerElement } from "@lib/registerElements.ts";

injectStyle("bm-card", css`
	bm-card {
		background-color: var(--card-bg);
		border: var(--card-border) solid var(--card-border-width);
		border-radius: var(--card-radius);
		box-shadow: var(--card-shadow);
		overflow: clip;
		height: max-content;

		> img {
			margin: var(--space-4) 0;
			&:nth-child(2) { margin-top: 0; }
			&:last-child { margin-bottom: 0; }
		}

		> *:not(img) {
			padding: 0 var(--card-padding);
			&:first-child { padding-top: var(--card-padding-sm); }
			&:last-child { padding-bottom: var(--card-padding-sm); }
		}
	}
`);

export class Card extends HTMLElement {
	connectedCallback() {
		const shadow = this.attachShadow({ mode: "open" });

		const shadowStyle = document.createElement("style");
		shadowStyle.textContent = css`
			:host {
				display: grid;
				grid-template-areas: "pic" "title" "body" "foot";
			}
		`;

		shadow.appendChild(shadowStyle);
		const tmp = document.createElement("template");
		tmp.innerHTML = html`
			<slot style="grid-area:pic" name="pic"></slot>
			<slot style="grid-area:title" name="title"></slot>
			<slot style="grid-area:body" name="body"></slot>
			<slot style="grid-area:foot" name="foot"></slot>
		`;
		shadow.appendChild(tmp.content.cloneNode(true));

		let hasBody = false;
		for (const child of this.children) {
			if (child instanceof HTMLElement && !child.slot) {
				switch (child.tagName) {
					case "DIV":
						child.slot = hasBody ? "foot" : "body";
						hasBody = true;
						break;
					case "H1":
					case "H2":
					case "H3":
					case "H4":
					case "H5":
					case "H6":
						child.slot = "title";
						break;
					case "IMG":
						child.slot = "pic";
						break;
				}
			}
		}

		this.style.display = "block";
	}
}

registerElement("bm-card", Card);
