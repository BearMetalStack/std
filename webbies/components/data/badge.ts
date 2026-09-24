import { BMElement, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";
import { injectStyle } from "@bearmetal/drip";

injectStyle(
	"bm-badge",
	css`
		bm-badge {
			font-size: var(--badge-font-size);
			font-weight: var(--badge-font-weight);
			padding: var(--badge-padding-y) var(--badge-padding-x);
			border-radius: var(--badge-radius);
			letter-spacing: var(--badge-letter-spacing);

			--color-badge-bg: var(--color-brand-50);
			--color-badge-border: var(--color-brand-300);
			--color-badge-text: var(--color-brand-400);

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
				--color-badge-bg: var(--color-green-100);
				--color-badge-border: var(--color-green-700);
				--color-badge-text: var(--color-success);
			}
			&[info] {
				--color-badge-bg: var(--color-blue-100);
				--color-badge-border: var(--color-blue-700);
				--color-badge-text: var(--color-info);
			}
			&[warn] {
				--color-badge-bg: var(--color-orange-100);
				--color-badge-border: var(--color-orange-700);
				--color-badge-text: var(--color-warning);
			}
			&[danger] {
				--color-badge-bg: var(--color-red-100);
				--color-badge-border: var(--color-red-700);
				--color-badge-text: var(--color-danger);
			}
			&[grey] {
				--color-badge-bg: var(--color-neutral-100);
				--color-badge-border: var(--color-neutral-400);
				--color-badge-text: var(--color-neutral-600);
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
	`,
);

@define("bm-badge")
export class Badge extends BMElement {}
