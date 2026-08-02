import { BMElement, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";
import { injectStyle } from "@bearmetal/drip";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";

injectStyle(
	"bm-layout-alpha",
	css`
		bm-layout-alpha nav {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			width: 300px;
			height: 100%;
			background-color: var(--color-bg-subtle);

			a,
			ul > li > button {
				text-decoration: none;
				font-size: var(--text-md);
				color: var(--color-text-subtle);
				display: flex;
				align-items: center;
				justify-content: flex-start;
				gap: 0.5rem;
				width: 100%;
				padding: var(--space-1);
				border-radius: var(--radius-base);
				background-color: transparent;
				font-weight: var(--font-weight-medium);
				text-align: left;
				border: none;

				&:hover {
					color: inherit;
					background-color: #00000030 !important;
				}
			}

			ul {
				width: 100%;
				padding: 0;
				list-style: none;

				li {
					padding: var(--space-1) 0;

					&:not(:last-child) {
						border-bottom: var(--color-border-strong) var(--border-1) solid;
						width: 100%;
					}

					> ul {
						border-top: var(--color-border-strong) var(--border-1) solid;
						padding-left: var(--space-4);
						display: none;
					}

					&[open] > ul {
						display: block;
					}
				}
			}

			.logo {
				a {
					color: inherit;
				}
			}
		}

		bm-layout-alpha header {
			height: min-content;
			width: 100%;
		}

		bm-layout-alpha nav,
		bm-layout-alpha header,
		bm-layout-alpha main {
			padding: 1rem;
		}
	`,
);

@define("bm-layout-alpha", import.meta)
export class AlphaLayout extends BMElement {
	get template(): JSX.Element {
		return (
			<>
				<style $raw>
					{css`
						:host {
							display: grid;
							grid-template-areas:
								"a b"
								"a c";
							grid-template-columns: 300px 1fr;
							grid-template-rows: auto 1fr;
							width: 100vw;
							height: 100vh;
						}
						slot {
							display: block;
						}
						slot[name="nav"] {
							grid-area: a;
						}
						slot[name="header"] {
							grid-area: b;
						}
						slot[name="main"] {
							grid-area: c;
						}
					`}
				</style>
				<slot name="nav"></slot>
				<slot name="header"></slot>
				<slot name="main"></slot>
			</>
		);
	}

	init() {
		this.useShadow();

		for (const child of this.children) {
			if (child instanceof HTMLElement && !child.slot) {
				switch (child.tagName) {
					case "NAV":
						child.slot = "nav";
						break;
					case "HEADER":
						child.slot = "header";
						break;
					case "MAIN":
						child.slot = "main";
						break;
				}
			}
		}
	}
}
