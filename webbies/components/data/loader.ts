import { BaseComponent } from "@lib/BaseComponent.ts";
import { css, html } from "@bearmetal/miscellanea";
import { animationSheet } from "@style";
import { registerElement } from "@lib/registerElements.ts";

export class Loader extends BaseComponent {
	constructor() {
		super();
		this.useShadow();
		this.adoptStyleSheet(animationSheet);
		this.setShadowStyle(css`
			.notched {
				width: var(--space-8);
				height: var(--space-8);
				animation: spin 1s steps(8, end) infinite;
			}

			:host > div {
				display: flex;
				flex-direction: column;
				justify-content: center;
				align-items: center;
			}
		`);

		this.setTemplate(html`
			<div>
				<bm-icon icon="spinner-gap" class="notched"></bm-icon>
				<div><slot></slot></div>
			</div>
		`);
	}
}

registerElement("bm-loader", Loader);
