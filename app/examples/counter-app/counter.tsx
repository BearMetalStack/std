import { BMElement, define } from "@bearmetal/app";

@define("sample-counter")
export class MyCounter extends BMElement {
	#count = this.signal(0);

	override get template() {
		return (
			<>
				<h1>BearMetal App Counter</h1>
				<div>
					<button
						type="button"
						class="down"
						onClick={() => this.#count.set(this.#count.get() - 10)}
					>
						- -
					</button>
					<button
						type="button"
						class="down"
						onClick={() => this.#count.set(this.#count.get() - 1)}
					>
						-
					</button>
					<span>{this.#count}</span>
					<button
						type="button"
						onClick={() => this.#count.set(this.#count.get() + 1)}
					>
						+
					</button>
					<button
						type="button"
						onClick={() => this.#count.set(this.#count.get() + 10)}
					>
						+ +
					</button>
				</div>
			</>
		);
	}
}
