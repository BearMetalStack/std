import type { disconnectCallback, packetCallback } from "./types.ts";

export default class Channel {
	public id: string;
	public createdAt = Date.now();
	public lastMessage?: number;

	public listeners: Map<string, WebSocket>;

	public callbacks: packetCallback[] = [];
	public middleware: packetCallback[] = [];
	public disconnectCallbacks: disconnectCallback[] = [];

	constructor(channelId: string) {
		this.id = channelId;
		this.listeners = new Map();

		this.callbacks.push((packet) => {
			this.lastMessage = Date.now();

			for (const [clientId, listener] of this.listeners.entries()) {
				if (clientId !== packet.from.id || packet.echo) {
					listener.send(JSON.stringify({
						message: packet.message,
						to: packet.to,
					}));
				}
			}
		});
	}

	public addListener = (callback: packetCallback) =>
		this.callbacks.push(callback, this.callbacks.pop()!);

	public onDisconnect = (callback: disconnectCallback) => this.disconnectCallbacks.push(callback);
}
