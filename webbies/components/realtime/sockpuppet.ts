// Sockpuppet-based (websocket) implementation of the realtime component. This is a fallback for browsers that don't support SSE, and also allows for bi-directional communication.
// Usage is similar to the SSE component, but with some differences. The main difference is that you can have forms that send data back to the server, and you can also append new elements to the DOM based on incoming messages.

// <bm-sockpuppet src="/api/sockpuppet" channel="chat">
// 	<div data-sockpuppet-append="message">
// 		<template>
// 			<p><strong data-sockpuppet="user"></strong>: <span data-sockpuppet="text"></span></p>
// 		</template>
//  </div>
//  <form data-sockpuppet-form="message">
// 		<input name="user" placeholder="Your name">
// 		<input name="text" placeholder="Your message">
// 		<button type="submit">Send</button>
//  </form>
// </bm-sockpuppet>

// For implementation, this will eventually use the Sockpuppet library, but for now it's just a stub that mimics the SSE component's API and can be used for testing the UI without needing a websocket server set up.

// Incoming WS messages are JSON objects: { "type": "<event>", "channel"?: "...", ...data }
// Outgoing form messages:               { "type": "<event>", "channel"?: "...", ...formFields }

import { registerElement } from "@lib/registerElements.ts";
import { appendToContainer } from "./utils.ts";

export class BmSockpuppet extends HTMLElement {
	private _ws: WebSocket | null = null;

	constructor() {
		super();
		this.style.display = "contents";
	}

	connectedCallback() {
		Promise.resolve().then(() => this._connect());
	}

	disconnectedCallback() {
		this._ws?.close();
		this._ws = null;
	}

	private _connect() {
		if (!this.isConnected) return;
		const src = this.getAttribute("src");
		if (!src) return;

		const channel = this.getAttribute("channel") ?? undefined;

		const appendContainers = Array.from(
			this.querySelectorAll<HTMLElement>("[data-sockpuppet-append]"),
		);

		// TODO: replace with Sockpuppet library client
		const ws = new WebSocket(src);
		this._ws = ws;

		ws.addEventListener("message", (e: MessageEvent) => {
			let msg: Record<string, string>;
			try {
				msg = JSON.parse(e.data);
			} catch {
				return;
			}

			const type = msg["type"];
			if (!type) return;
			if (channel && msg["channel"] && msg["channel"] !== channel) return;

			for (const container of appendContainers) {
				if (container.getAttribute("data-sockpuppet-append") !== type) continue;
				appendToContainer(container, msg, "data-sockpuppet", "data-sockpuppet-max");
			}
		});

		for (const form of this.querySelectorAll<HTMLFormElement>(
			"[data-sockpuppet-form]",
		)) {
			form.addEventListener("submit", (e) => {
				e.preventDefault();
				if (this._ws?.readyState !== WebSocket.OPEN) return;
				const type = form.getAttribute("data-sockpuppet-form")!;
				const payload: Record<string, string> = { type };
				if (channel) payload["channel"] = channel;
				for (const [k, v] of new FormData(form)) {
					if (typeof v === "string") payload[k] = v;
				}
				this._ws.send(JSON.stringify(payload));
				form.reset();
			});
		}
	}
}

registerElement("bm-sockpuppet", BmSockpuppet);
