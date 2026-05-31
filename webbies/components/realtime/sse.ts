// This usage appends new messages to the end of the div with data-sse-append="<event name>" and creates a new <p> element for each message, setting its text content to the value of the "data" field from the SSE event.After the number of messages exceeds the value of data-sse-max, the oldest message is removed from the div to maintain a maximum of 50 messages. data-sse-max is optional; if not provided, messages will continue to be appended without limit.
// <bm-sse src="/api/sse">
// 	<div data-sse-append="<event name>" data-sse-max="50">
//		<template>
// 			<p data-sse="data"></p>
//		</template>
// 	</div>
// </bm-sse>

// This usage updates the text contents of each element with data-sse="<data key>" to the value of the corresponding field from the SSE event.
// <bm-sse src="/api/sse">
// 	<div sse-swap="<event name>">
//		<p data-sse="status"></p>
//		<p>Last check: <span data-sse="timestamp"></span></p>
// 	</div>
// </bm-sse>

import { registerElement } from "@lib/registerElements.ts";
import { appendToContainer, parseData, swapContainer } from "./utils.ts";

export class BmSse extends HTMLElement {
	private _es: EventSource | null = null;

	constructor() {
		super();
		this.style.display = "contents";
	}

	connectedCallback() {
		Promise.resolve().then(() => this._connect());
	}

	disconnectedCallback() {
		this._es?.close();
		this._es = null;
	}

	private _connect() {
		if (!this.isConnected) return;
		const src = this.getAttribute("src");
		if (!src) return;

		const appendContainers = Array.from(
			this.querySelectorAll<HTMLElement>("[data-sse-append]"),
		);
		const swapContainers = Array.from(
			this.querySelectorAll<HTMLElement>("[sse-swap]"),
		);

		const eventNames = new Set<string>();
		for (const el of appendContainers) {
			const ev = el.getAttribute("data-sse-append");
			if (ev) eventNames.add(ev);
		}
		for (const el of swapContainers) {
			const ev = el.getAttribute("sse-swap");
			if (ev) eventNames.add(ev);
		}

		this._es = new EventSource(src);

		for (const eventName of eventNames) {
			this._es.addEventListener(eventName, (e: Event) => {
				const parsed = parseData((e as MessageEvent).data);

				for (const container of appendContainers) {
					if (container.getAttribute("data-sse-append") !== eventName) continue;
					appendToContainer(container, parsed, "data-sse", "data-sse-max");
				}
				for (const container of swapContainers) {
					if (container.getAttribute("sse-swap") !== eventName) continue;
					swapContainer(container, parsed, "data-sse");
				}
			});
		}
	}
}

registerElement("bm-sse", BmSse);
