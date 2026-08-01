import { BMElement, define } from "@bearmetal/app";
import { html } from "@bearmetal/miscellanea";
import { joinPath } from "@bearmetal/miscellanea";

@define("bm-route", import.meta)
export class SpaRoute extends BMElement {
	static get observedAttributes(): string[] {
		return ["active", "path", "keep-alive"];
	}

	private _templ?: HTMLTemplateElement | null;
	private _observer?: MutationObserver;
	private _importedNodes: ChildNode[] = [];

	override connectedCallback() {
		const glorp = () => {
			if (this._templ) return true;
			this._templ = this.querySelector(":scope > template");

			if (this._active) this._import();
			return !!this._templ;
		};
		if (
			!glorp() && !this.subRoutesInTemplate() &&
			!this.querySelector(":scope > bm-route")
		) {
			this.noTemplateNoSubroute();
		}
		super.connectedCallback();
	}

	init(): () => void {
		this.style.display = "none";

		return () => {
			this._observer?.disconnect();
		};
	}

	private noTemplateNoSubroute() {
		this.innerHTML = html`
			<p class="danger banner">
				This bm-route (${this.getAttribute("path") ??
					"<no path?"}) was not provided with a child template or child routes. Please wrap
				children in a ${"<template>"} tag.
			</p>
		`;
	}

	private subRoutesInTemplate() {
		if (!this._templ) return false;
		if (this._templ.content.querySelector(":scope bm-route")) {
			this.innerHTML = html`
				<p class="danger banner">
					This bm-route (${this.getAttribute("path") ??
						"<no path?"}) has a child template, but that template contains sub-routes. This is
					not supported. Please move sub-routes outside of the template.
				</p>
			`;
			return true;
		}
	}

	params: Map<string, string | undefined> = new Map();

	/** Get a route param from the nearest ancestor bm-route. Returns "" if not found. */
	static param(el: Element, key: string): string {
		return (el.closest("bm-route") as SpaRoute | null)?.params.get(key) ?? "";
	}

	private _suppressWarning = false;
	private _active = false;
	activate(params: Map<string, string | undefined>) {
		if (this._active) {
			this.params = params;
			return;
		}
		this._suppressWarning = true;
		this.setAttribute("active", "true");
		this._suppressWarning = false;
		this._active = true;
		this.params = params;
		this.style.display = "contents";
		this._import();
	}

	private _import() {
		if (this._templ) {
			const b = document.importNode(this._templ.content, true);
			this._importedNodes = Array.from(b.childNodes);
			this._importedNodes.toReversed().forEach((n) => {
				switch (n.nodeType) {
					case Node.ELEMENT_NODE:
						this._templ!.insertAdjacentElement("afterend", n as Element);
						break;
					case Node.COMMENT_NODE:
						// ignore
						break;
					case Node.TEXT_NODE:
						this._templ!.insertAdjacentText("afterend", n.textContent ?? "");
						break;
					default:
						this.appendChild(n);
				}
			});
		} else if (!this.querySelector(":scope > bm-route")) {
			this.noTemplateNoSubroute();
		}
	}

	deactivate() {
		this._active = false;
		this._suppressWarning = true;
		this.removeAttribute("active");
		this._suppressWarning = false;
		this.style.display = "none";
		if (!this.hasAttribute("keep-alive")) {
			for (const node of this._importedNodes) {
				node.parentNode?.removeChild(node);
			}
			this._importedNodes = [];
		}
	}

	/** Direct bm-route children - from live DOM after activation, or template content before. */
	get directChildRoutes(): SpaRoute[] {
		const live = Array.from(
			this.querySelectorAll(":scope > bm-route"),
		) as SpaRoute[];
		if (live.length) return live;
		const tmpl = this.querySelector(":scope > template") as
			| HTMLTemplateElement
			| null;
		if (!tmpl) return [];
		return Array.from(tmpl.content.children).filter(
			(el: unknown): el is SpaRoute => (el as SpaRoute).tagName === "BM-ROUTE",
		) as unknown as SpaRoute[];
	}

	/** Whether this route has a path="/" child (an index subroute). */
	get hasIndexChild(): boolean {
		return this.directChildRoutes.some((r) => r.getAttribute("path") === "/");
	}

	get path(): string {
		const pr = this.parentElement?.closest("bm-route") as SpaRoute;
		const pa = this.getAttribute("path") ?? "";
		return pr ? joinPath(pr.path, pa) : pa;
	}

	attributeChangedCallback(
		name: "path" | "active" | "keep-alive",
		_oldValue: string,
		_newValue: string,
	) {
		if (name === "active" && !this._suppressWarning) { // This is not an official API, warn when modifying manually
			this.innerHTML = html`
				<p class="danger banner">
					You have manually toggled this route (${this.getAttribute("path") ??
						"&lt;no path&gt;"}). This is not supported in the API. If you must
					manually activate/deactivate a route, use the router's .navigate() method instead.
				</p>
			`;
		}
	}
}
