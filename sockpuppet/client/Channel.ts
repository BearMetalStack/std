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

	public send = (message: string, clientToSendTo?: number) =>
		this.socket.OPEN && this.socket.send(JSON.stringify({
			send_packet: {
				to: this.id,
				message,
				clientToSendTo,
				echo: this.echo,
			},
		}));

	public addListener = (callback: channelCallback<T>) => this.callbacks.push(callback);

	public onJoinConfirm = (callback: channelCallback<"join">) => this.joinCallbacks.push(callback);
	public onLeave = (callback: channelCallback<"leave">) => this.leaveCallbacks.push(callback);

	public execListeners = (message: T) => this.callbacks.forEach((cb) => cb(message));
	public execJoinListeners = () => this.joinCallbacks.forEach((cb) => cb("join"));
	public execLeaveListeners = () => this.leaveCallbacks.forEach((cb) => cb("leave"));
}
