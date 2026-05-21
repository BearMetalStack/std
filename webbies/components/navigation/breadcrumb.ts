import { html, css } from "@lib/tags.ts";
import { injectStyle } from "@lib/injectStyle.ts";
import { registerElement } from "@lib/registerElements.ts";

injectStyle("bm-breadcrumb", css`
	bm-breadcrumb {
		display: flex;
		align-items: center;
		text-transform: capitalize;
		font-size: var(--breadcrumb-font-size);
		padding: var(--space-1);

		a {
			color: var(--breadcrumb-color);
			text-decoration: none;
			display: flex;
			align-items: center;
			line-height: 1em;
			&:not(:first-child)::before {
				content: '/';
				margin: 0 var(--space-2);
				color: var(--breadcrumb-separator-color);
			}
			&:hover, &.active {
				color: var(--breadcrumb-color-active);
			}
		}
	}
`);

function buildBreadCrumbs(base: string) {
	const subs = location.pathname.replace(base, "").split("/").filter(
		Boolean,
	);
	const as: HTMLAnchorElement[] = [];
	while (subs.length) {
		const path = base + subs.join("/");
		const a = document.createElement("a");
		a.textContent = subs.pop()!;
		if (path === location.pathname) a.classList.add("active");
		else a.href = path;
		as.unshift(a);
	}
	return as;
}

export class Breadcrumb extends HTMLElement {
	constructor() {
		super();
		document.addEventListener("route-change", (_) => {
			this.build();
		});
	}

	connectedCallback() {
		this.build();
	}

	private build() {
		this.innerHTML = "";
		const base = this.getAttribute("base") ?? "/";
		this.append(...buildBreadCrumbs(base));
		const root = document.createElement("a");
		if (location.pathname === base) root.classList.add("active");
		else root.href = base;
		root.innerHTML = this.getAttribute("base-name") ?? html`
			<bm-icon icon="house">Home</bm-icon>
		`;
		this.prepend(root);
	}
}

registerElement("bm-breadcrumb", Breadcrumb);
