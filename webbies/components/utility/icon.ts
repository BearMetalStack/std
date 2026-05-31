import { css, html } from "@bearmetal/miscellanea";
import { injectStyle } from "@bearmetal/drip";
import { registerElement } from "@lib/registerElements.ts";

injectStyle(
	"bm-icon",
	css`
		p, h1, h2, h3, h4, h5, h6, th, td, button, input, a {
			bm-icon {
				fill: currentColor;
				height: 1em;
				width: 1em;
			}
		}

		bm-icon {
			display: inline-flex;
			justify-content: center;
			align-items: center;
		}
	`,
);

const Observed = ["sheet", "icon"] as const;
export class Icon extends HTMLElement {
	static get observedAttributes(): typeof Observed {
		return Observed;
	}
	connectedCallback() {
		this.attachShadow({ mode: "open" });
		this.shadowRoot!.innerHTML = html`
			<span class="fallback"><slot></slot></span>
			<span class="icon"></span>
		`;
		const style = document.createElement("style");
		style.textContent = css`
			.icon {
				display: contents;
			}
			.fallback {
				display: contents;
			}
			:host([resolved]) .fallback {
				display: none;
			}
			:host(:not([resolved])) .icon {
				display: none;
			}
		`;
		this.shadowRoot!.prepend(style);

		this.style.fill = "currentColor";
	}

	private get icon(): SVGElement {
		return this.querySelector("svg")!;
	}
	private set icon(i: SVGElement) {
		const container = this.shadowRoot!.querySelector(".icon");
		if (!container) return;
		container.innerHTML = "";
		container.appendChild(i);
		this.toggleAttribute("resolved", true);
	}
	attributeChangedCallback(
		name: typeof Observed[number],
		_oldV: string,
		newV: string,
	) {
		switch (name) {
			case "sheet":
				Icon.registerSet({ type: "sheet", url: new URL(newV) });
				if (this.hasAttribute("icon")) {
					resolveIcon(newV, this.getAttribute("icon")!).then((i) =>
						this.icon = i
					);
				}
				break;
			case "icon": {
				if (!this.hasAttribute("sheet")) {
					this.setAttribute(
						"sheet",
						"https://cdn.bear-metal.dev/icons/phosphor/regular.svg",
					);
				}
				resolveIcon(this.getAttribute("sheet")!, newV).then((i) =>
					this.icon = i
				);
				break;
			}
		}
	}

	static registerSet({ type, url }: { type: "sheet"; url: string | URL }) {
		type === "sheet" && fetchSheet(url.toString());
	}
}

const cache = new Map<string, Promise<Document>>();

function fetchSheet(url: string): Promise<Document> {
	if (!cache.has(url)) {
		cache.set(
			url,
			fetch(url)
				.then((r) => r.text())
				.then((xml) => new DOMParser().parseFromString(xml, "image/svg+xml")),
		);
	}
	return cache.get(url)!;
}

async function resolveIcon(
	sheetUrl: string,
	name: string,
): Promise<SVGElement> {
	const doc = await fetchSheet(sheetUrl);
	const symbol = doc.querySelector(`#${name}`);

	if (!symbol) throw new Error(`Icon "${name}" not found in sheet`);

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

	const viewBox = symbol.getAttribute("viewBox");
	if (viewBox) svg.setAttribute("viewBox", viewBox);

	for (const child of symbol.children) {
		svg.appendChild(document.importNode(child, true));
	}

	return svg;
}

registerElement("bm-icon", Icon);
