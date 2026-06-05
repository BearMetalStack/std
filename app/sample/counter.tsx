import { define } from "../define.ts";
import { BMElement } from "../mod.ts";

@define("sample-counter")
export class MyCounter extends BMElement {
	#count = this.signal(0);

	get template() {
		return (
			<div>
				<button type="button" onClick={() => this.#count.set(this.#count.get() - 1)}>
					-
				</button>
				<span>{this.#count}</span>
				<button type="button" onClick={() => this.#count.set(this.#count.get() + 1)}>
					+
				</button>
			</div>
		);
	}

	override init() {
		this.appendChild(
			<div>
				<button type="button" onClick={() => this.#count.set(this.#count.get() - 1)}>
					-
				</button>
				<span>{this.#count}</span>
				<button type="button" onClick={() => this.#count.set(this.#count.get() + 1)}>
					+
				</button>
			</div>,
		);
	}
}
