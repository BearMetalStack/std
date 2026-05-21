import { markdownToHtml } from "@lib/md/html.ts";
import { css, unescapeHtml } from "@bearmetal/miscellanea";
import { registerElement } from "@lib/registerElements.ts";

const STYLE = css`
	.root {
		max-width: 65rem;
		padding: 1rem;
		position: relative;
	}

	ul.none {
		list-style: none;
		padding: 0 1.25rem;
	}
	li.none {
		list-style: none;
	}
	sup {
		font-size: 0.75rem;
	}

	sup > a, aside > a {
		text-decoration: none;
	}

	img {
		display: block;
	}
`;

export class Markdown extends HTMLElement {
	static observedAttributes = ["src"];

	private _originalContent = "";
	private _abort: AbortController | null = null;

	connectedCallback() {
		if (!this._originalContent) {
			this._originalContent = unescapeHtml(this.innerHTML);
		}
		this.init().then((html) => this._render(html ?? ""));
	}

	async init(): Promise<string | undefined> {
		this._abort?.abort();
		const ctrl = new AbortController();
		this._abort = ctrl;

		const src = this.getAttribute("src");
		let md = this._originalContent;
		if (src) {
			try {
				md = await fetch(src, { signal: ctrl.signal }).then((r) => r.text());
			} catch (e) {
				if ((e as DOMException).name === "AbortError") return;
				throw e;
			}
		}

		if (ctrl.signal.aborted) return;
		const html = md ? await markdownToHtml(md) : "";
		if (ctrl.signal.aborted) return;

		return html;
	}

	private _render(html: string) {
		this.innerHTML = "";

		const style = document.createElement("style");
		style.textContent = STYLE;
		this.appendChild(style);

		if (html) {
			const root = document.createElement("div");
			root.className = "root";
			root.innerHTML = html;
			this.appendChild(root);
		}
	}

	attributeChangedCallback(name: string, oldValue: string, newValue: string) {
		if (name === "src" && newValue !== oldValue) {
			this.init().then((html) => this._render(html ?? ""));
		}
	}
}

registerElement("bm-md", Markdown);

// [GENERATED:link-mods] DO NOT EDIT BELOW
import "@style";
// [/GENERATED:link-mods]
