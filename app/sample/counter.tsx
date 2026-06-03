import { define } from "../define.ts";
import { BmElement } from "../mod.ts";

@define("sample-counter")
export class MyCounter extends BmElement {
	#count = this.signal(0);

	protected override render() {
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
