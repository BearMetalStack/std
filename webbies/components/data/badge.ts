import { BaseComponent } from "@lib/BaseComponent.ts";
import { css } from "@bearmetal/miscellanea";
import { registerElement } from "@lib/registerElements.ts";

export class Badge extends BaseComponent {
	readonly observedAttributes = [];
	constructor() {
		super();

		this.setStyle(css`
			${this.tagName.toLowerCase()} {
				font-size: var(--badge-font-size);
				font-weight: var(--badge-font-weight);
				padding: var(--badge-padding-y) var(--badge-padding-x);
				border-radius: var(--badge-radius);
				letter-spacing: var(--badge-letter-spacing);

				--color-badge-bg: var(--color-bearmetal-50);
				--color-badge-border: var(--color-bearmetal-300);
				--color-badge-text: var(--color-bearmetal-400);

				border: var(--border-1-5) solid var(--color-badge-border);
				background-color: var(--color-badge-bg);
				color: var(--color-badge-text);

				transition: var(--transition-colors);

				& > bm-icon {
					width: 1em;
					height: 1em;
					vertical-align: middle;
				}

				&[success] {
					--color-badge-bg: var(--color-success-light);
					--color-badge-border: var(--color-success-dark);
					--color-badge-text: var(--color-success);
				}
				&[info] {
					--color-badge-bg: var(--color-info-light);
					--color-badge-border: var(--color-info-dark);
					--color-badge-text: var(--color-info);
				}
				&[warn] {
					--color-badge-bg: var(--color-warning-light);
					--color-badge-border: var(--color-warning-dark);
					--color-badge-text: var(--color-warning);
				}
				&[danger] {
					--color-badge-bg: var(--color-danger-light);
					--color-badge-border: var(--color-danger-dark);
					--color-badge-text: var(--color-danger);
				}
				&[grey] {
					--color-badge-bg: var(--color-bearmetal-grey-100);
					--color-badge-border: var(--color-bearmetal-grey-400);
					--color-badge-text: var(--color-bearmetal-grey-600);
				}

				&[interactive] {
					cursor: pointer;

					&:hover {
						background-color: var(--color-badge-text);
						border-color: var(--color-badge-text);
						color: var(--color-badge-bg);
					}

					&:active {
						position: relative;
						&::before {
							content: "";
							position: absolute;
							inset: 0;
							z-index: 0;
							background-color: #00000030;
							border-radius: inherit;
						}

						& > * {
							position: relative;
							z-index: 10;
						}
					}
				}
			}
		`);
	}
}

registerElement("bm-badge", Badge);
