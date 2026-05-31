import { injectStyle } from "@bearmetal/drip";
import { css } from "@bearmetal/miscellanea";
import { registerElement } from "@lib/registerElements.ts";

injectStyle(
	"bm-progress",
	css`
		bm-progress {
			--duration: 10s;
			--direction: normal;

			height: var(--space-1);
			display: block;

			&[global] {
				position: fixed;
				top: 0;
				left: 0;
				right: 0;
			}

			&[reverse] {
				--direction: reverse;
			}

			&.small {
				height: var(--space-0-5);
			}

			&.bottom {
				position: absolute;
				bottom: 0;
				left: 0;
				right: 0;
			}

			&::before {
				content: "";
				height: 100%;
				display: block;
				background-color: currentColor;
			}
			&:not([percent])::before {
				animation: progress var(--duration) linear var(--direction) both;
			}
		}

		@keyframes progress {
			from {
				width: 0;
			}
			to {
				width: 100%;
			}
		}
	`,
);

const OBSERVED = ["percent"] as const;
type Attribute = typeof OBSERVED[number];

export class Progress extends HTMLElement {
	attributeChangedCallback(name: Attribute, _old: string, value: string) {
		if (name === "percent") {
			this.style.width = value;
		}
	}
}

registerElement("bm-progress", Progress);
