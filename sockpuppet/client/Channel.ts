import type { channelCallback } from "./types.ts";

export class Channel<T = string> {
	public id: string;

	private socket: WebSocket;

	public callbacks: channelCallback<T>[] = [];
	public joinCallbacks: channelCallback<"join">[] = [];
	public leaveCallbacks: channelCallback<"leave">[] = [];

	public echo?: boolean;

	constructor(id: string, socket: WebSocket) {
		this.id = id;
		this.socket = socket;
	}

	public send = (message: string, clientToSendTo?: number): void =>
		this.socket.OPEN && this.socket.send(JSON.stringify({
			send_packet: {
				to: this.id,
				message,
				clientToSendTo,
				echo: this.echo,
			},
		}));

	public addListener = (callback: channelCallback<T>): number => this.callbacks.push(callback);

	public onJoinConfirm = (callback: channelCallback<"join">): number =>
		this.joinCallbacks.push(callback);
	public onLeave = (callback: channelCallback<"leave">): number =>
		this.leaveCallbacks.push(callback);

	public execListeners = (message: T): void => this.callbacks.forEach((cb) => cb(message));
	public execJoinListeners = (): void => this.joinCallbacks.forEach((cb) => cb("join"));
	public execLeaveListeners = (): void => this.leaveCallbacks.forEach((cb) => cb("leave"));
}
