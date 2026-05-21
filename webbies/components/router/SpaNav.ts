import { joinPath } from "@lib/joinPath.ts";
import type { SpaRoute } from "./SpaRoute.ts";
import { registerElement } from "@lib/registerElements.ts";

function isNavigable(path: string): boolean {
	try {
		const pattern = new URLPattern({ pathname: path });
		const result = pattern.exec({ pathname: path });
		if (!result) return false;
		return Object.keys(result.pathname.groups).length === 0;
	} catch {
		return false;
	}
}

function labelFor(route: SpaRoute, path: string): string {
	if (route.hasAttribute("label")) return route.getAttribute("label")!;
	const segments = path.split("/").filter(Boolean);
	const last = segments.findLast((s) => !s.startsWith(":") && s !== "*") ??
		segments.at(-1) ?? path;
	return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Walk the router's live DOM children, passing through arbitrary wrappers but
// stopping at bm-spa-tabs (whose routes are not eligible for the nav).
function directRouterRoutes(parent: HTMLElement): SpaRoute[] {
	const results: SpaRoute[] = [];
	for (const child of parent.children) {
		if (child.tagName === "BM-ROUTE") {
			results.push(child as SpaRoute);
		} else if (child.tagName !== "BM-SPA-TABS") {
			results.push(...directRouterRoutes(child as HTMLElement));
		}
	}
	return results;
}

interface NavNode {
	path: string;
	label: string;
	icon: string | null;
	hasRoot: boolean;
	children: NavNode[];
}

function buildNavTree(routes: SpaRoute[], parentPath: string): NavNode[] {
	const nodes: NavNode[] = [];
	const set = new Set<string>();
	for (const route of routes) {
		if (route.hasAttribute("ignore-nav")) continue;

		const attr = route.getAttribute("path") ?? "";
		if (attr === "/") continue;

		if (attr.split("/").some((s) => s.startsWith(":"))) continue;

		const path = parentPath ? joinPath(parentPath, attr) : attr;
		if (path === parentPath) continue;
		if (path.split("/").some((s) => s.startsWith(":"))) continue;

		if (set.has(path)) continue;
		set.add(path);

		const directChildren = route.directChildRoutes ?? [];
		const hasRoot = route.hasAttribute("has-root") ||
			directChildren.some((r) => (r.getAttribute("path") ?? "") === "/");
		const children = buildNavTree(directChildren, path);
		if (!isNavigable(path)) {
			const rootPath = joinPath(path, "/");
			if (hasRoot && isNavigable(rootPath)) {
				nodes.push({
					path: rootPath,
					label: labelFor(route, path),
					icon: route.getAttribute("icon"),
					hasRoot: true,
					children,
				});
				continue;
			}
			if (children.length === 0) continue;
			nodes.push({
				path,
				label: labelFor(route, path),
				icon: route.getAttribute("icon"),
				hasRoot: false,
				children,
			});
			continue;
		}

		nodes.push({
			path,
			label: labelFor(route, path),
			icon: route.getAttribute("icon"),
			hasRoot,
			children,
		});
	}
	return nodes;
}

function renderNavTree(nodes: NavNode[]): HTMLUListElement {
	const ul = document.createElement("ul");
	for (const { path, label, icon, hasRoot, children } of nodes) {
		const li = document.createElement("li");

		let expanded = false;
		try {
			expanded = new URLPattern({ pathname: path }).test({
				pathname: location.pathname,
			}) ||
				new URLPattern({ pathname: path + "/*" }).test({
					pathname: location.pathname,
				});
		} catch { /* ignore invalid patterns */ }
		if (expanded) li.setAttribute("open", "");

		if (children.length && !hasRoot) {
			const btn = document.createElement("button");
			if (icon) {
				const bmi = document.createElement("bm-icon");
				bmi.setAttribute("icon", icon);
				btn.appendChild(bmi);
			}
			btn.append(label);
			btn.addEventListener("click", () => li.toggleAttribute("open"));
			li.appendChild(btn);
		} else {
			const a = document.createElement("a");
			a.href = path;
			if (icon) {
				const bmi = document.createElement("bm-icon");
				bmi.setAttribute("icon", icon);
				a.appendChild(bmi);
			}
			a.append(label);
			li.appendChild(a);
		}

		if (children.length) li.appendChild(renderNavTree(children));

		ul.appendChild(li);
	}
	return ul;
}

export class SpaNav extends HTMLElement {
	private _router: HTMLElement | null = null;
	private _handleRouteChange = () =>
		Promise.resolve().then(() => this._build());

	connectedCallback() {
		this._router = this.closest("bm-router");
		document.addEventListener("route-change", this._handleRouteChange);
		Promise.resolve().then(() => this._build());
	}

	disconnectedCallback() {
		document.removeEventListener("route-change", this._handleRouteChange);
	}

	private _build() {
		if (!this._router) return;
		this.innerHTML = "";
		this.appendChild(
			renderNavTree(buildNavTree(directRouterRoutes(this._router), "")),
		);
	}
}

registerElement("bm-nav", SpaNav);
