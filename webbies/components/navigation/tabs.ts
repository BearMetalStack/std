import { BMElement, define } from "@bearmetal/app";

@define("bm-tab", import.meta)
export class BmTab extends BMElement {
	init() {
		if (!this.hasAttribute("active")) this.style.display = "none";
	}

	activate() {
		this.setAttribute("active", "");
		this.style.display = "";
	}

	deactivate() {
		this.removeAttribute("active");
		this.style.display = "none";
	}
}

@define("bm-tabs", import.meta)
export class BmTabs extends BMElement {
	init() {
		Promise.resolve().then(() => this._build());
	}

	private _build() {
		const tabs = Array.from(
			this.querySelectorAll<BmTab>(":scope > bm-tab"),
		);
		if (!tabs.length) return;

		const bar = document.createElement("div");
		bar.className = "tab-bar";

		const buttons: HTMLButtonElement[] = [];

		const activate = (index: number) => {
			tabs.forEach((t, i) => (i === index ? t.activate() : t.deactivate()));
			buttons.forEach((b, i) => b.toggleAttribute("active", i === index));
		};

		for (let i = 0; i < tabs.length; i++) {
			const tab = tabs[i];
			const btn = document.createElement("button");

			const icon = tab.getAttribute("icon");
			if (icon) {
				const bmi = document.createElement("bm-icon");
				bmi.setAttribute("icon", icon);
				btn.appendChild(bmi);
			}

			btn.append(tab.getAttribute("label") ?? `Tab ${i + 1}`);
			btn.addEventListener("click", () => activate(i));
			bar.appendChild(btn);
			buttons.push(btn);
		}

		this.prepend(bar);
		activate(0);
	}
}
