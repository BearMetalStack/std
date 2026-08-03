/** Components for `render.test.ts`. Separate because the test file is `.ts`. */

import { BMElement } from "../BMElement.ts";
import { define } from "../define.ts";
import { prop } from "../prop.ts";
import { state } from "../state.ts";

/** Records the order things happened in, so tests can assert on overlap. */
export const log: string[] = [];

export function resetLog(): void {
	log.length = 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@define("load-greeting", import.meta)
export class LoadGreeting extends BMElement {
	@prop()
	accessor who = this.signal("world");
	@state()
	accessor greeting = this.signal("");

	protected override async serverInit() {
		log.push(`serverInit:start:${this.who.get()}`);
		await sleep(10);
		this.greeting.set(`hello, ${this.who.get()}`);
		log.push(`serverInit:end:${this.who.get()}`);
	}

	protected override init() {
		log.push("init");
	}

	protected override get template() {
		return <p>{this.greeting}</p>;
	}
}

/** A component whose `serverInit()` reveals another one that also has to load. */
@define("load-outer", import.meta)
export class LoadOuter extends BMElement {
	@state()
	accessor ready = this.signal(false);

	protected override async serverInit() {
		await sleep(5);
		this.ready.set(true);
	}

	protected override get template() {
		return (
			<div>{this.computed(() => this.ready.get() ? <load-greeting who="nested" /> : null)}</div>
		);
	}
}

/** Renders nothing server-side: its tag and attributes are the whole output. */
@define("client-only-widget", import.meta)
export class ClientOnlyWidget extends BMElement {
	static override client = true;

	protected override get template() {
		return <span>should not be server rendered</span>;
	}
}

@define("plain-thing", import.meta)
export class PlainThing extends BMElement {
	protected override get template() {
		return <em>plain</em>;
	}
}

export const Greeting = () => <load-greeting who="you" />;

export const Two = () => (
	<div>
		<load-greeting who="a" />
		<load-greeting who="b" />
	</div>
);

export const Nested = () => <load-outer />;

export const ClientOnly = () => <client-only-widget data-x="1" />;

export const Plain = () => <plain-thing />;

export const AsyncChild = () => <section>{sleep(5).then(() => <b>late</b>)}</section>;
