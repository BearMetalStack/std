import { BMElement, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";

@define("bm-layout-alpha")
export class AlphaLayout extends BMElement {
	static override get stylesheet(): string {
		return css`
			bm-layout-alpha nav {
				display: flex;
				flex-direction: column;
				gap: 1rem;
				width: 300px;
				height: 100%;
				background-color: var(--sidebar-bg);

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
					border-radius: var(--nav-item-radius);
					background-color: transparent;
					font-weight: var(--weight-medium);
					text-align: left;
					border: none;

					&:hover {
						color: inherit;
						background-color: var(--sidebar-item-bg-hover) !important;
					}

					&:is([aria-current]:not([aria-current="false"]), [data-active]) {
						color: var(--nav-item-color-active);
						background-color: var(--sidebar-item-bg-active);
						font-weight: var(--nav-item-weight-active);
						text-decoration: none;
						box-shadow: var(--sidebar-item-indicator-active);
					}
				}

				ul {
					width: 100%;
					padding: 0;
					list-style: none;

					li {
						padding: var(--space-1) 0;

						&:not(:last-child) {
							border-bottom: var(--border-rule) solid var(--color-border-strong);
							width: 100%;
						}

						> ul {
							border-top: var(--border-rule) solid var(--color-border-strong);
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
		`;
	}

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
