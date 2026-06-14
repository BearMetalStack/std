// /**  @jsxImportSource "@bearmetal/jsx/client" */
// /**  @jsxImportSourceTypes "@bearmetal/jsx/client" */

import { BMElement, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";

@define("counter")
export class Counter extends BMElement {
	static get stylesheet() {
		return css`
			:scope {
				font-size: 2rem;
				display: flex;
				gap: 1rem;
				align-items: center;
			}

			button {
				font-weight: bold;
			}
		`;
	}

	#count = this.signal(0);

	change(amount: number) {
		return () => this.#count.set(this.#count.get() + amount);
	}

	get template() {
		return (
			<>
				<button
					type="button"
					class="danger"
					onClick={this.change(-1)}
				>
					-
				</button>
				<span>{this.#count}</span>
				<button
					type="button"
					class="success"
					onClick={this.change(1)}
				>
					+
				</button>
			</>
		);
	}
}
