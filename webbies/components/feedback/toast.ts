import { type TimeString, timeStringToMillis } from "@lib/time.ts";
import { css, html } from "@lib/tags.ts";
import { injectStyle } from "@lib/injectStyle.ts";
import { registerElements } from "@lib/registerElements.ts";

injectStyle(
	"bm-toast",
	css`
		bm-toast {
			display: block;
			background-color: var(--toast-bg);
			color: var(--toast-color);
			border-radius: var(--toast-border-radius);
			border: var(--toast-border) solid var(--border-2);
			padding: var(--toast-padding-y) var(--toast-padding-x);
			max-width: var(--toast-max-width);
			font-size: var(--toast-font-size);
			box-shadow: var(--toast-shadow);
			opacity: 0;
			margin-bottom: var(--space-2);
			overflow: clip;
			height: auto;

			--shrink-anim: shrink-height;
			--slide-anim: slide-in-left;
			animation:
				var(--slide-anim) 200ms ease-out normal both,
				fade-in 200ms ease-out normal both;

				&[fading] {
					animation:
						fade-out 200ms ease-out normal both,
						var(--shrink-anim) 200ms 190ms ease-in-out normal;
					button {
						display: none;
					}
				}

				--h-color: var(--toast-color);
				--bar-color: var(--toast-border);

				&[danger] {
					border-color: var(--color-danger-vibrant);
					--h-color: var(--color-danger-light);
					background-color: var(--color-danger-bg);
					color: var(--color-danger-text);
					--bar-color: var(--color-danger-vibrant);
				}
				&[warn] {
					border-color: var(--color-warning-vibrant);
					--h-color: var(--color-warning-light);
					background-color: var(--color-warning-bg);
					color: var(--color-warning-text);
					--bar-color: var(--color-warning-vibrant);
				}
				&[info] {
					border-color: var(--color-info-vibrant);
					--h-color: var(--color-info-light);
					background-color: var(--color-info-bg);
					color: var(--color-info-text);
					--bar-color: var(--color-info-vibrant);
				}
				&[success] {
					border-color: var(--color-success-vibrant);
					--h-color: var(--color-success-light);
					background-color: var(--color-success-bg);
					color: var(--color-success-text);
					--bar-color: var(--color-success-vibrant);
				}

				h1, h2, h3, h4, h5, h6 {
					font-weight: var(--weight-bold);
					font-size: var(--toast-font-size);
					color: currentColor;
				}

				button[data-dismiss].ghost {
					position: absolute;
					top: var(--space-1);
					right: var(--space-1);
					color: currentColor;
					--btn-hover-color: #00000050;
					svg {
						fill: currentColor;
					}
				}

				bm-progress {
					color: var(--bar-color);
				}
			}

			bm-toast-host {
				z-index: var(--z-toast);
				position: fixed;
				top: var(--space-2);
				right: var(--space-2);
				display: flex;
				flex-direction: column;

				&[position="bottom"] {
					inset: unset;
					bottom: var(--space-2);
					left: 50%;
					translate: -50%;
					flex-direction: column-reverse;
				}
				&[position="bottom-right"] {
					inset: unset;
					bottom: var(--space-2);
					right: var(--space-2);
					flex-direction: column-reverse;
				}
				&[position="bottom-left"] {
					inset: unset;
					bottom: var(--space-2);
					right: var(--space-2);
					flex-direction: column-reverse;
				}
				&[position="top"] {
					inset: unset;
					top: var(--space-2);
					left: 50%;
					translate: 0 -50%;
				}
				&[position="top-left"] {
					inset: unset;
					top: var(--space-2);
					right: var(--space-2);
				}

				&[direction="left"] {
					flex-direction: row;
					bm-toast {
						margin-right: var(--space-2);
					}
				}
				&[direction="right"] {
					flex-direction: row-reverse;
					bm-toast {
						margin-left: var(--space-2);
					}
				}
				&[direction="left"], &[direction="right"] {
					bm-toast {
						--shrink-anim: shrink-width;
						max-width: calc(var(--toast-max-width) / 2);
						margin-bottom: 0;
					}
				}
			}
		`,
	);

	const OBSERVED = ["fade", "dismissible"] as const;
	type Attribute = typeof OBSERVED[number];
	export class Toast extends HTMLElement {
		static get observedAttributes(): typeof OBSERVED {
			return OBSERVED;
		}

		private host: ToastHost;
		constructor() {
			super();

			this.host = document.querySelector("bm-toast-host") ??
				document.body.appendChild(
					document.createElement("bm-toast-host"),
				) as ToastHost;
			this.host.append(this);

			this.addEventListener("animationend", (e) => {
				if (
					e.animationName === "shrink-height" ||
					e.animationName === "shrink-width"
				) {
					this.remove();
				}
				if (e.animationName === "fade-out") {
					this.style.height = this.clientHeight + "px";
					this.style.width = this.clientWidth + "px";
				}
			});

			if (this.hasAttribute("dismissible")) {
				this.createDismissButton();
			}
		}

		private _closeTimeout?: number;
		attributeChangedCallback(name: Attribute, _old: string, value: string) {
			switch (name) {
				case "fade": {
					clearTimeout(this._closeTimeout);
					if (value === null) break;
					const timeString = value as TimeString || "3s";
					const time = timeStringToMillis(timeString);
					this._closeTimeout = setTimeout(() => {
						this.setAttribute("fading", "");
					}, time);
					const prog = document.createElement("bm-progress");
					prog.classList.add(
						"small",
						"bottom",
					);
					prog.setAttribute("reverse", "");
					prog.style.setProperty("--duration", timeString);
					this.append(prog);
					break;
				}
				case "dismissible":
					if (this.hasAttribute("dismissible") && !this._dismissBtn) {
						this.createDismissButton();
					} else {
						this._dismissBtn?.remove();
						this._dismissBtn = undefined;
					}
					break;
			}
		}

		private _dismissBtn?: HTMLButtonElement;
		private createDismissButton() {
			this._dismissBtn = document.createElement("button");
			this._dismissBtn.classList.add("icon", "ghost", "xs");
			this._dismissBtn.setAttribute("data-dismiss", "");
			this._dismissBtn.innerHTML = html`
				<bm-icon icon="x">Dismiss</bm-icon>
			`;
			this._dismissBtn.addEventListener("click", (_) => {
				this.setAttribute("fading", "");
			});
			this.prepend(this._dismissBtn);
		}
	}

	export class ToastHost extends HTMLElement {
		constructor() {
			super();
			// this.setAttribute("position", "bottom");
		}
	}

	registerElements(["bm-toast", Toast], ["bm-toast-host", ToastHost]);
