import type Client from "./Client.ts";
import type EventEmitter from "./EventEmitter.ts";

export class Packet<T = unknown> {
	from: Client | EventEmitter;
	message?: T;
	to: string;
	echo?: boolean;

	constructor(
		from: Client | EventEmitter,
		to: string,
		message?: T,
		echo?: boolean,
	) {
		this.from = from;
		this.to = to;
		// if (message) this.message = JSON.stringify(message);
		this.message = message;
		this.echo = echo;
	}
}
