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

import { BMElement, define } from "@bearmetal/app";
import { Sockpuppet } from "@bearmetal/sockpuppet/client";
import { appendToContainer, swapContainer } from "./utils.ts";

@define("bm-sockpuppet")
export class BmSockpuppet extends BMElement {
	private _ws: Sockpuppet | null = null;

	init() {
		this.style.display = "contents";
		Promise.resolve().then(() => this._connect());
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		this._ws?.leaveChannel(this.getAttribute("channel")!);
		this._ws = null;
	}

	private _connect() {
		if (!this.isConnected) return;
		const src = this.getAttribute("src");
		if (!src) return;

		const channel = this.getAttribute("channel") ?? undefined;

		if (!channel) throw new Error("bm-sockpuppet: channel is required");

		const appendContainers = Array.from(
			this.querySelectorAll("[data-sockpuppet-append]"),
		) as HTMLElement[];
		const swapContainers = Array.from(
			this.querySelectorAll("[sse-swap]"),
		) as HTMLElement[];

		const puppet = new Sockpuppet(src);
		this._ws = puppet;

		puppet.joinChannel(channel, (m) => {
			let msg: Record<string, string> | null = null;
			try {
				msg = JSON.parse(m);
			} catch {
				return;
			}

			const type = msg!["type"];
			if (!type) return;

			for (const container of appendContainers) {
				if (container.getAttribute("data-sockpuppet-append") !== type) continue;
				appendToContainer(container, msg!, "data-sockpuppet", "data-sockpuppet-max");
			}
			for (const container of swapContainers) {
				if (container.getAttribute("sockpuppet-swap") !== type) continue;
				swapContainer(container, msg!, "data-sse");
			}
		});

		for (
			const form of this.querySelectorAll<HTMLFormElement>(
				"[data-sockpuppet-form]",
			)
		) {
			form.addEventListener("submit", (e) => {
				e.preventDefault();
				const type = form.getAttribute("data-sockpuppet-form")!;
				const payload: Record<string, string> = { type };
				if (channel) payload["channel"] = channel;
				for (const [k, v] of new FormData(form)) {
					if (typeof v === "string") payload[k] = v;
				}
				this._ws?.getChannel(channel)?.send(JSON.stringify(payload));
				form.reset();
			});
		}
	}
}
