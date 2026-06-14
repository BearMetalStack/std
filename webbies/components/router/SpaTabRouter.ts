import { BMElement, define } from "@bearmetal/app";
import type { SpaRoute } from "./SpaRoute.ts";

function labelFor(route: SpaRoute): string {
	if (route.hasAttribute("label")) return route.getAttribute("label")!;
	const segments = route.path.split("/").filter(Boolean);
	const last = segments.at(-1) ?? route.path;
	return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

@define("bm-spa-tabs", import.meta)
export class SpaTabRouter extends BMElement {
	private _bar: HTMLElement | null = null;
	private _handleRouteChange = () => this._updateActive();

	init() {
		document.addEventListener("route-change", this._handleRouteChange);
		Promise.resolve().then(() => this._build());
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		document.removeEventListener("route-change", this._handleRouteChange);
	}

	private _build() {
		const routes = Array.from(
			this.querySelectorAll(":scope > bm-route"),
		) as SpaRoute[];
		if (!routes.length) return;

		const bar = document.createElement("div");
		bar.className = "tab-bar";

		for (const route of routes) {
			const btn = document.createElement("button");

			const icon = route.getAttribute("icon");
			if (icon) {
				const bmi = document.createElement("bm-icon");
				bmi.setAttribute("icon", icon);
				btn.appendChild(bmi);
			}

			btn.append(labelFor(route));
			btn.addEventListener("click", () => history.pushState(null, "", route.path));
			bar.appendChild(btn);
		}

		this.prepend(bar);
		this._bar = bar;
		this._updateActive();
	}

	private _updateActive() {
		if (!this._bar) return;
		const routes = Array.from(
			this.querySelectorAll(":scope > bm-route"),
		) as SpaRoute[];
		const buttons = Array.from(this._bar.querySelectorAll("button"));
		routes.forEach((route, i) => {
			buttons[i]?.toggleAttribute("active", route.hasAttribute("active"));
		});
	}
}
