import { BMElement, define, state } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";

@define("hmr-counter")
export class Counter extends BMElement {
	static get stylesheet() {
		return css`
			:scope {
				display: inline-flex;
				gap: 0.5rem;
				align-items: center;
				font-size: 1.5rem;
			}
		`;
	}

	#label = "Count";

	@state()
	accessor count = this.signal(0);

	change(amount: number) {
		return () => this.count.set(this.count.get() + amount);
	}

	get template() {
		return (
			<>
				<button type="button" onClick={this.change(-1)}>-</button>
				<span class="label">{this.#label}</span>
				<span class="value">{this.count}</span>
				<button type="button" onClick={this.change(1)}>+</button>
			</>
		);
	}
}
