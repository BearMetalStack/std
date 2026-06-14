import { BMElement, define } from "@bearmetal/app";
import type { SpaRoute } from "./SpaRoute.ts";

@define("bm-router", import.meta)
export class SpaRouter extends BMElement {
	private _parentRouter?: SpaRouter | null;

	init() {
		this.style.display = "contents";
		this._parentRouter = this.parentElement?.closest("bm-router");
		if (!this._parentRouter) {
			this._interceptClicks();
			this._patchHistory();
			globalThis.addEventListener(
				"popstate",
				() => this._handleRouteChange(),
			);
			Promise.resolve().then(() => this._handleRouteChange());
		}
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		globalThis.removeEventListener(
			"popstate",
			() => this._handleRouteChange(),
		);
	}

	_interceptClicks() {
		document.addEventListener("click", (e) => {
			if (!e.target || !("closest" in e.target)) return;
			const a = (e.target as HTMLElement).closest("a");
			if (!a || a.hostname !== location.hostname || a.target === "_blank") {
				return;
			}
			if (e.metaKey || e.ctrlKey || e.shiftKey) return;
			e.preventDefault();
			history.pushState(null, "", a.href);
		});
	}

	_patchHistory() {
		const orig = history.pushState.bind(history);
		history.pushState = (s, t, url) => {
			orig(s, t, url);
			this._handleRouteChange();
		};
	}

	_handleRouteChange() {
		const path = location.pathname;
		const routes = this.querySelectorAll("bm-route") as SpaRoute[];
		for (const route of routes) {
			const res = this._checkPath(route.path);
			if (res === null) route.deactivate();
			else route.activate(new Map(Object.entries(res.pathname.groups)));
		}
		document.dispatchEvent(
			new CustomEvent("route-change", {
				detail: { path },
				bubbles: true,
			}),
		);
	}

	navigate(path: string) {
		history.pushState(null, "", path);
	}

	private _checkPath(pathname: string) {
		const pattern = new URLPattern({ pathname });
		const result = pattern.exec(location.href);
		if (result) return result;

		if (pathname.endsWith("/*")) {
			const rootPattern = new URLPattern({ pathname: pathname.slice(0, -2) });
			return rootPattern.exec(location.href);
		}

		return null;
	}
}
