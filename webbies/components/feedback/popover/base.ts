import { registerElement } from "@lib/registerElements.ts";
import { html } from "@bearmetal/miscellanea";

export class PopoverBase extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.shadowRoot!.innerHTML = html`
			<style>
			span {
				text-decoration: underline dashed;
				cursor: pointer;
				anchor-name: --trigger;
			}

			div[popover] {
				position: absolute;
				position-anchor: --trigger;
				position-try-fallbacks: --top, --top-right, --bottom, --bottom-right;
				inset: auto;
				bottom: anchor(top);
				left: anchor(left);

				max-width: 20em;
				min-width: max-content;

				background: var(--popover-bg);
				border: var(--popover-border);
				color: var(--color-text);
				border-radius: var(--popover-radius);
				box-shadow: var(--popover-shadow);
				padding: var(--popover-padding);

				opacity: 0;
				pointer-events: none;
				transition-property: opacity, display;
				transition-duration: 200ms;
				transition-behavior: allow-discrete;
			}
			[popover]:popover-open {
				display: block;
				opacity: 1;
				pointer-events: auto;
				@starting-style {
					opacity: 0;
				}
			}

			@position-try --bottom {
				inset: auto;
				top: anchor(bottom);
				left: anchor(left);
			}
			@position-try --bottom-right {
				inset: auto;
				top: anchor(bottom);
				right: anchor(right);
			}
			@position-try --top {
				inset: auto;
				bottom: anchor(top);
				left: anchor(left);
			}
			@position-try --top-right {
				inset: auto;
				bottom: anchor(top);
				right: anchor(right);
			}
			</style>
			<div popover><slot name="content"></slot></div>
			<span><slot name="trigger"></slot></span>
		`;
	}

	#timer: number | null = null;
	#overTrigger = false;
	#overContent = false;

	connectedCallback() {
		for (const child of this.children) {
			child.setAttribute(
				"slot",
				child.getAttribute("slot") || child.tagName.toLowerCase(),
			);
		}
		this.#initialize();
	}

	#initialize() {
		const trigger = this.shadowRoot!.querySelector("span")!;
		const popover = this.shadowRoot!.querySelector(
			"[popover]",
		) as HTMLElement;

		trigger.addEventListener("mouseenter", () => {
			this.#overTrigger = true;
			clearTimeout(this.#timer!);
			this.#timer = setTimeout(
				() => popover.showPopover(),
				Number(this.getAttribute("in-time") || 500),
			);
		});
		trigger.addEventListener("click", () => {
			popover.showPopover();
		});
		trigger.addEventListener("mouseleave", () => {
			this.#overTrigger = false;
			this.#scheduleHide(popover);
		});

		popover.addEventListener("mouseenter", () => {
			this.#overContent = true;
			clearTimeout(this.#timer!);
		});
		popover.addEventListener("mouseleave", () => {
			this.#overContent = false;
			this.#scheduleHide(popover);
		});
	}

	#scheduleHide(popover: HTMLElement) {
		if (this.#overTrigger || this.#overContent) return;
		clearTimeout(this.#timer!);
		this.#timer = setTimeout(
			() => popover.hidePopover(),
			Number(this.getAttribute("out-time") || 300),
		);
	}
}

registerElement("bm-popover", PopoverBase);
