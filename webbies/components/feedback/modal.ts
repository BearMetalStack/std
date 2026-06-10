import { BMElement, define } from "@bearmetal/app";
import { css, html } from "@bearmetal/miscellanea";
import { injectStyle } from "@bearmetal/drip";

injectStyle(
	"bm-modal",
	css`
		bm-modal {
			display: contents;
		}
	`,
);

const shadowStyles = css`
	dialog {
		background: var(--modal-bg);
		color: var(--color-text);
		border: var(--border-1) solid var(--modal-border);
		border-radius: var(--modal-radius);
		box-shadow: var(--modal-shadow);
		padding: var(--modal-padding);
		max-width: var(--modal-max-width-base);
		width: calc(100% - var(--space-8));
		position: relative;
	}

	:host([sm]) dialog {
		max-width: var(--modal-max-width-sm);
	}
	:host([lg]) dialog {
		max-width: var(--modal-max-width-lg);
	}
	:host([xl]) dialog {
		max-width: var(--modal-max-width-xl);
	}

	dialog::backdrop {
		background: var(--modal-backdrop);
		backdrop-filter: blur(var(--modal-backdrop-blur));
	}

	button[data-dismiss] {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
	}
`;

@define("bm-modal", import.meta)
export class Modal extends BMElement {
	#dialog!: HTMLDialogElement;
	#resolvers: Array<(returnValue: string) => void> = [];

	init() {
		const shadow = this.useShadow();

		const style = document.createElement("style");
		style.textContent = shadowStyles;

		this.#dialog = document.createElement("dialog");

		const closeBtn = document.createElement("button");
		closeBtn.setAttribute("data-dismiss", "");
		closeBtn.classList.add("icon", "ghost", "xs");
		closeBtn.innerHTML = html`
			<bm-icon icon="x">Close</bm-icon>
		`;
		closeBtn.addEventListener("click", () => this.close());

		this.#dialog.append(closeBtn, document.createElement("slot"));
		shadow.append(style, this.#dialog);

		this.#dialog.addEventListener("click", (e) => {
			if (e.target === this.#dialog) this.close();
		});

		this.#dialog.addEventListener("close", () => {
			const returnValue = this.#dialog.returnValue;
			this.dispatchEvent(
				new CustomEvent("bm-close", {
					bubbles: true,
					detail: { returnValue },
				}),
			);
			for (const resolve of this.#resolvers.splice(0)) {
				resolve(returnValue);
			}
		});
	}

	show() {
		this.#dialog.showModal();
	}

	close(returnValue?: string) {
		this.#dialog.close(returnValue);
	}

	get returnValue(): string {
		return this.#dialog.returnValue;
	}

	waitForClose(): Promise<string> {
		return new Promise((resolve) => {
			if (!this.#dialog.open) {
				resolve(this.#dialog.returnValue);
			} else {
				this.#resolvers.push(resolve);
			}
		});
	}
}
