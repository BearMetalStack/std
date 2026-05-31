import { css } from "@bearmetal/miscellanea";
import { registerElement } from "@lib/registerElements.ts";
import { injectStyle } from "@bearmetal/drip";

const DURATION = 200;
injectStyle(
	"bm-drawer",
	css`
		.backdrop {
			display: none;
			position: fixed;
			inset: 0;
			background: var(--drawer-backdrop);
			backdrop-filter: blur(var(--drawer-backdrop-blur));
			opacity: 0;
			transition:
				display ${DURATION}ms allow-discrete,
				opacity ${DURATION}ms var(--ease-in);
			}

			.backdrop.is-open {
				display: block;
				opacity: 1;
				transition: opacity ${DURATION}ms var(--ease-out);
				@starting-style {
					opacity: 0;
				}
			}

			:root {
				--handle-height: 4px;
				--handle-row-height: calc(
					var(--space-3) + var(--handle-height) + var(--space-3)
				);
			}

			body[data-top-drawer] {
				margin-top: var(--handle-row-height);
			}
			body[data-bottom-drawer] {
				margin-bottom: var(--handle-row-height);
			}
		`,
	);

	const shadowStyles = css`
		:host {
			display: flex;
			flex-direction: column;
			position: fixed;
			z-index: var(--z-modal);
			inset: auto 0 0 0;
			background: var(--drawer-bg);
			color: var(--color-text);
			border: var(--border-1) solid var(--drawer-border);
			border-radius: var(--drawer-radius) var(--drawer-radius) 0 0;
			box-shadow: var(--drawer-shadow);
			overflow: hidden;
			overscroll-behavior: contain;

			--starting-translate: 0 calc(100% - var(--handle-row-height));

			translate: var(--bm-drag-translate, var(--starting-translate));
			transition: translate ${DURATION}ms var(--ease-in);
		}

		:host([open]) {
			height: max-content;
			max-height: var(--drawer-max-height);
			translate: var(--bm-drag-translate, 0 0);
			transition: translate ${DURATION}ms var(--ease-out);
			@starting-style {
				translate: var(--starting-translate);
			}
		}

		:host([position="top"]) {
			inset: 0 0 auto 0;
			border-radius: 0 0 var(--drawer-radius) var(--drawer-radius);
			flex-direction: column-reverse;
			--starting-translate: 0 calc(-100% + var(--handle-row-height));
		}

		:host([position="left"]) {
			inset: 0 auto 0 0;
			border-radius: 0 var(--drawer-radius) var(--drawer-radius) 0;
			height: 100%;
			flex-direction: row-reverse;
			--starting-translate: -100% 0;
		}

		:host([position="right"]) {
			inset: 0 0 0 auto;
			border-radius: var(--drawer-radius) 0 0 var(--drawer-radius);
			height: 100%;
			flex-direction: row;
			--starting-translate: 100% 0;
		}

		:host([position="left"][open]),
		:host([position="right"][open]) {
			width: max-content;
			min-width: 240px;
			max-width: var(--drawer-max-width);
			max-height: 100%;
		}

		.handle-row {
			position: relative;
			z-index: 1;
			display: flex;
			justify-content: center;
			align-items: center;
			padding: var(--space-3) 0;
			flex-shrink: 0;
			cursor: grab;
			touch-action: none;
			user-select: none;
			-webkit-user-select: none;
		}

		:host([position="left"]) .handle-row,
		:host([position="right"]) .handle-row {
			display: none;
		}

		.handle {
			width: 2.5rem;
			height: var(--handle-height);
			border-radius: var(--radius-full);
			background: var(--drawer-handle-color);
		}

		.container {
			position: relative;
			z-index: 1;
			flex: 1;
			overflow-y: auto;
			overscroll-behavior: contain;
			padding: var(--drawer-padding);
			padding-top: 0;
		}

		:host([position="top"]) .container {
			padding-top: var(--drawer-padding);
			padding-bottom: 0;
		}

		:host([position="left"]) .container,
		:host([position="right"]) .container {
			padding-top: var(--drawer-padding);
		}
	`;

	export class Drawer extends HTMLElement {
		#backdrop: HTMLDivElement;
		#handleRow: HTMLDivElement;
		#container: HTMLDivElement;
		#resolvers: Array<(returnValue: string) => void> = [];
		#returnValue = "";
		#touchStartY = 0;
		#touchStartX = 0;
		#dragging = false;
		#dragFromHandle = false;
		#dragWasOpen = false;
		#dragDelta = 0;

		constructor() {
			super();
			const shadow = this.attachShadow({ mode: "open" });

			const style = document.createElement("style");
			style.textContent = shadowStyles;

			this.#backdrop = document.createElement("div");
			this.#backdrop.className = "backdrop";
			this.#backdrop.addEventListener("click", () => this.close());

			this.#handleRow = document.createElement("div");
			this.#handleRow.className = "handle-row";
			const handle = document.createElement("div");
			handle.className = "handle";
			this.#handleRow.append(handle);

			this.#container = document.createElement("div");
			this.#container.className = "container";
			this.#container.append(document.createElement("slot"));

			shadow.append(style, this.#handleRow, this.#container);
		}

		connectedCallback() {
			const existingDrawer = document.querySelector(
				`bm-drawer[position='${this.position}']`,
			);
			if (existingDrawer && existingDrawer !== this) {
				throw new Error(
					`Only one <bm-drawer> with position="${this.position}" can be used at a time.`,
				);
			}

			switch (this.position) {
				case "top":
					document.body.dataset.topDrawer = "";
					break;
				case "bottom":
					document.body.dataset.bottomDrawer = "";
					break;
			}

			this.insertAdjacentElement("afterend", this.#backdrop);
			(this.position === "bottom" || this.position === "top")
				? this.#setupDrag()
				: this.#setupHDrag(this.position);
			this.#handleRow.addEventListener("click", () => {
				if (this.open) this.close();
				else this.show();
			});
			this.addEventListener("touchstart", (e) => {
				if (this.position !== "bottom") return;
				this.#initDrag(e.touches[0], false);
				globalThis.addEventListener("touchmove", this.#onTouchMove, {
					passive: true,
				});
				globalThis.addEventListener("touchend", this.#onTouchEnd, {
					once: true,
				});
			}, { passive: true });
		}

		disconnectedCallback() {
			if (this.open) document.removeEventListener("keydown", this.#onKeyDown);
			globalThis.removeEventListener("touchmove", this.#onTouchMove);
		}

		get position(): string {
			return this.getAttribute("position") ?? "bottom";
		}

		#setupHDrag(side: string = "left") {
			document.addEventListener("touchstart", (e) => {
				const touch = e.touches[0];
				const touchArea = this.open ? this.clientWidth : 100;
				if (side === "left" && touch.clientX > touchArea && !this.open) return;
				if (
					side === "right" &&
					touch.clientX < globalThis.innerWidth - touchArea && !this.open
				) return;
				e.stopPropagation();

				this.#initDrag(touch, false);
				globalThis.addEventListener("touchmove", this.#onTouchMove, {
					passive: false,
				});
				globalThis.addEventListener("touchend", this.#onTouchEnd, {
					once: true,
				});
			});
		}

		#setupDrag() {
			this.#handleRow.addEventListener("touchstart", (e) => {
				e.stopPropagation();
				this.#initDrag(e.touches[0], true);
				globalThis.addEventListener("touchmove", this.#onTouchMove, {
					passive: false,
				});
				globalThis.addEventListener("touchend", this.#onTouchEnd, {
					once: true,
				});
			}, { passive: true });
		}

		#initDrag(touch: Touch, fromHandle: boolean) {
			this.#touchStartY = touch.clientY;
			this.#touchStartX = touch.clientX;
			this.#dragging = false;
			this.#dragFromHandle = fromHandle;
			this.#dragWasOpen = this.open;
			this.#dragDelta = 0;
		}

		#onTouchMove = (e: TouchEvent) => {
			const touch = e.touches[0];
			const position = this.position;
			const wasOpen = this.#dragWasOpen;

			let rawDelta: number;
			if (position === "bottom") rawDelta = touch.clientY - this.#touchStartY;
			else if (position === "top") rawDelta = this.#touchStartY - touch.clientY;
			else if (position === "left") {
				rawDelta = this.#touchStartX - touch.clientX;
			} else rawDelta = touch.clientX - this.#touchStartX;

			// Positive = dismiss direction; flip when closed so opening gesture = positive.
			const delta = wasOpen ? Math.max(0, rawDelta) : Math.max(0, -rawDelta);

			if (!this.#dragFromHandle && wasOpen && this.#container.scrollTop > 0) {
				return;
			}
			if (delta === 0) return;

			if (delta > 4 && !this.#dragging) {
				this.#dragging = true;
				this.style.transition = "none";
				if (!wasOpen) {
					// Show backdrop without triggering CSS @starting-style — we drive opacity manually.
					this.#backdrop.style.display = "block";
					this.#backdrop.style.opacity = "0";
				}
			}

			if (!this.#dragging) return;

			e.preventDefault();
			this.#dragDelta = delta;

			if (wasOpen) {
				const tr: Record<string, string> = {
					bottom: `0 ${delta}px`,
					top: `0 -${delta}px`,
					left: `-${delta}px 0`,
					right: `${delta}px 0`,
				};
				this.style.setProperty(
					"--bm-drag-translate",
					tr[position] ?? `0 ${delta}px`,
				);
			} else {
				const handleH = this.#handleRow.offsetHeight;
				const size = position === "bottom" || position === "top"
					? this.offsetHeight
					: this.offsetWidth;
				const newOffset = Math.max(0, size - handleH - delta);
				const tr: Record<string, string> = {
					bottom: `0 ${newOffset}px`,
					top: `0 -${newOffset}px`,
					left: `-${newOffset}px 0`,
					right: `${newOffset}px 0`,
				};
				this.style.setProperty(
					"--bm-drag-translate",
					tr[position] ?? `0 ${newOffset}px`,
				);
			}

			const size = position === "bottom" || position === "top"
				? this.offsetHeight
				: this.offsetWidth;
			const travel = wasOpen ? size : size - this.#handleRow.offsetHeight;
			const progress = wasOpen
				? Math.max(0, 1 - delta / travel)
				: Math.min(1, delta / travel);
			this.#backdrop.style.opacity = String(progress);
		};

		#onTouchEnd = () => {
			globalThis.removeEventListener("touchmove", this.#onTouchMove);
			if (!this.#dragging) return;

			const wasOpen = this.#dragWasOpen;
			const position = this.position;
			const size = position === "bottom" || position === "top"
				? this.offsetHeight
				: this.offsetWidth;
			const travel = wasOpen ? size : size - this.#handleRow.offsetHeight;

			if (this.#dragDelta > travel * 0.35) {
				if (wasOpen) {
					this.close();
				} else {
					// Snap to open: re-enable transition, set [open], flush, release drag translate.
					this.style.transition = "";
					this.setAttribute("open", "");
					void this.offsetHeight;
					this.style.removeProperty("--bm-drag-translate");
					// Hand backdrop control to CSS — clear inline styles then add class.
					this.#backdrop.style.display = "";
					this.#backdrop.style.opacity = "";
					this.#backdrop.classList.add("is-open");
					document.addEventListener("keydown", this.#onKeyDown);
				}
			} else {
				this.#snapBack();
			}
			this.#dragging = false;
		};

		#snapBack() {
			this.style.transition = "";
			void this.offsetHeight;
			this.style.removeProperty("--bm-drag-translate");
			// Backdrop disappears immediately on snap-back (no animation needed).
			this.#backdrop.style.display = "";
			this.#backdrop.style.opacity = "";
			this.#dragDelta = 0;
		}

		#onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				this.close();
			}
		};

		get open(): boolean {
			return this.hasAttribute("open");
		}

		show() {
			if (this.open) return;
			this.setAttribute("open", "");
			this.#backdrop.classList.add("is-open");
			document.addEventListener("keydown", this.#onKeyDown);
		}

		close(returnValue = "") {
			if (!this.open) return;
			this.#dragging = false;
			document.removeEventListener("keydown", this.#onKeyDown);

			this.style.transition = "";
			this.removeAttribute("open");
			void this.offsetHeight;
			this.style.removeProperty("--bm-drag-translate");

			// Clear any drag-driven inline opacity so the CSS exit transition can run
			// from whatever opacity the backdrop was at → 0.
			this.#backdrop.style.opacity = "";
			this.#backdrop.classList.remove("is-open");

			this.#returnValue = returnValue;
			this.dispatchEvent(
				new CustomEvent("bm-close", { bubbles: true, detail: { returnValue } }),
			);
			for (const resolve of this.#resolvers.splice(0)) resolve(returnValue);
		}

		get returnValue(): string {
			return this.#returnValue;
		}

		waitForClose(): Promise<string> {
			return new Promise((resolve) => {
				if (!this.open) resolve(this.#returnValue);
				else this.#resolvers.push(resolve);
			});
		}
	}

	registerElement("bm-drawer", Drawer);
