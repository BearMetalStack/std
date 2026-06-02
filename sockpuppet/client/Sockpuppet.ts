import type { channelCallback, socketCallback } from "./types.ts";
import { Channel } from "./Channel.ts";
import { Message } from "./Message.ts";

const bus = new EventTarget();
type SockpuppetPingEvent = CustomEvent<{ id: string }>;

class WebsocketClient {
	#tenants: number = 0;
	socket: WebSocket;

	constructor(private connString: string, private refreshInterval: number = 30_000) {
		this.socket = new WebSocket(this.connString);
		const send = this.socket.send.bind(this.socket);
		this.socket.send = (data) => {
			this.#refresh();
			send(data);
		};
	}

	#refresh() {
		this.#checkTenants(this.refreshInterval);
	}

	acquire() {
		this.#tenants++;
		return this;
	}

	release() {
		this.#tenants--;
		this.#checkTenants(10_000);
	}

	#timer: ReturnType<typeof setTimeout> | undefined;
	#checkTenants(delay: number) {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#pulse();
		}, delay);
	}

	#pulse() {
		let live = 0;
		const handler = (e: Event) => {
			if ((e as SockpuppetPingEvent).detail.id === this.connString) live++;
		};

		bus.addEventListener("sockpuppet:pong", handler);
		bus.dispatchEvent(new CustomEvent("sockpuppet:ping", { detail: { id: this.connString } }));

		setTimeout(() => {
			bus.removeEventListener("sockpuppet:pong", handler);
			if (live === 0) this.#close();
		}, 0);
	}

	#close() {
		requestClose(this.connString);
	}

	close() {
		this.socket.close();
	}
}

const connections = new Map<string, WebsocketClient>();

function requestClose(connString: string) {
	connections.get(connString)?.close();
	connections.delete(connString);
}

function requestConnection(connString: string) {
	if (connections.has(connString)) return connections.get(connString)!.acquire();
	const conn = new WebsocketClient(connString);
	connections.set(connString, conn);
	return conn.acquire();
}

interface PuppetOptions {
	keepAlive?: boolean;
}
export class Sockpuppet {
	private socket: WebSocket;
	private socketClient: WebsocketClient;

	public channels: Map<string, Channel>;

	public callbacks: Map<string, socketCallback[]>;

	private initialPing?: NodeJS.Timeout;

	private keepAlive = true;

	private _versionMismatch?: boolean;
	get versionMismatch() {
		return this._versionMismatch;
	}
	private _handshakeAccepted = false;
	get handshakeAccepted() {
		return this._handshakeAccepted;
	}
	private handshakeCheckDelay = 4000;
	private socketReady = false;

	static readonly puppetVersion = "0.6";

	// deno-lint-ignore no-explicit-any
	private messageQueue: MessageEvent<any>[] = [];

	constructor(path: string, onConnect?: () => void, options?: PuppetOptions) {
		if (!isFullUrl(path)) path = `${globalThis.location.host}${path}`;
		this.socketClient = requestConnection(path);
		this.socket = this.socketClient.socket;

		if (onConnect) {
			this.socket.addEventListener("open", () => {
				this.socket.send("handshake");
				this.socketReady = true;
				setTimeout(() => {
					if (!this.handshakeAccepted && this.socketReady) {
						this._versionMismatch = true;
						console.warn(
							`Socket has connected successfully but did not receive a handshake. If the host is a Sockpuppet server, then it may be an older version that does not support handshakes. Consider upgrading the server to ${Sockpuppet.puppetVersion}`,
						);
					}
				}, this.handshakeCheckDelay);
				onConnect();
			});
		}

		this.keepAlive = options?.keepAlive ?? this.keepAlive;

		this.socket.addEventListener("message", this.handleMessage);

		if (this.keepAlive) {
			this.initialPing = setTimeout(
				() => this.socket.OPEN && this.socket.send("pong"),
				5000,
			);
		}

		this.channels = new Map();
		this.callbacks = new Map([
			["disconnect", []],
		]);

		bus.addEventListener("sockpuppet:ping", (e) => {
			if ((e as SockpuppetPingEvent).detail.id === path) {
				bus.dispatchEvent(new CustomEvent("sockpuppet:pong", { detail: { id: path } }));
			}
		});
	}

	public joinChannel = (
		channelId: string,
		handler: channelCallback<string>,
	) => {
		if (this.socket.readyState === 1) {
			this._joinChannel(channelId, handler);
		} else {
			this.socket.addEventListener("open", () => {
				this._joinChannel(channelId, handler);
			});
		}
	};

	private _joinChannel(channelId: string, handler: channelCallback<string>) {
		const channel = new Channel(channelId, this.socket);
		this.channels.set(channelId, channel);
		channel.addListener(handler);
		this.socket.send(JSON.stringify({
			connect_to: [channelId],
		}));
	}

	public on = (event: string, callback: socketCallback) => {
		if (!this.callbacks.has(event)) {
			this.callbacks.set(event, []).get;
		}
		this.callbacks.get(event)?.push(callback);
	};

	public onDisconnect = (callback: socketCallback) =>
		this.callbacks.get("disconnect")?.push(callback);

	private handleMessage = (message: MessageEvent<string>) => {
		// Handle any events
		switch (message.data) {
			case "open":
			case "connected":
				//I'm sure these may be useful
				break;
			case "disconnected":
				this.callbacks.get("disconnect")?.forEach((cb) => cb(message.data));
				this.channels.forEach((channel) => channel.execLeaveListeners());
				break;
			case "ping":
				clearTimeout(this.initialPing);
				if (this.keepAlive) {
					this.socket.send("pong");
				}
				break;
			default:
				this.messageQueue.push(message);
				this.processQueue();
				break;
		}
	};

	private processQueue() {
		let message = this.messageQueue.shift();
		while (message) {
			try {
				const msg = new Message(JSON.parse(message.data));
				this.handleEvents(msg);
			} catch (_e) {
				const msg = message.data;
				this.callbacks.get(msg)?.forEach((cb) => cb(msg));
			}
			message = this.messageQueue.shift();
		}
	}

	private handleEvents = (message: Message) => {
		switch (message.event) {
			case "leave":
				this.deleteChannel(message.to);
				break;
			case "join":
				this.channels.get(message.to)?.execJoinListeners();
				break;
			case "create":
				this.onChannelCreate(message);
				break;
			case "handshake": {
				this._handshakeAccepted = true;
				this._versionMismatch = (message as unknown as Message<{ puppetVersion: string }>).message
					.puppetVersion < Sockpuppet.puppetVersion;
				if (this._versionMismatch) {
					console.warn(
						"Sockpuppet server version is older than client. Functionality is limited",
					);
				}
			}
		}
		this.callbacks.get(message.event || message.message)?.forEach((cb) => cb(message));
		this.channels.get(message.to)?.execListeners(message.message);
	};

	public leaveChannel = (channelId: string) =>
		this.socket.send(JSON.stringify({
			disconnect_from: [channelId],
		}));

	private deleteChannel = (channelId: string) => {
		const channel = this.channels.get(channelId);
		if (channel) {
			channel.execLeaveListeners();
			this.channels.delete(channelId);
		}
	};

	public getChannel = (channelId: string) => this.channels.get(channelId);

	public createChannel = (channelId: string) =>
		new Promise<Message>((res, rej) => {
			this.socket.send(JSON.stringify({
				create_channel: channelId,
			}));

			const poll = setInterval(() => {
				const channelMessage = this.channelCreateMessages.get(channelId);
				if (channelMessage) {
					clearInterval(poll);
					switch (channelMessage.status) {
						case "FAILED":
							rej(channelMessage);
							break;
						case "SUCCESS":
							res(channelMessage);
							break;
					}
					this.channelCreateMessages.delete(channelId);
				}
			}, 10);
		});

	private channelCreateMessages: Map<string, Message> = new Map();

	private onChannelCreate = (msg: Message) => {
		this.channelCreateMessages.set(msg.channelId!, msg);
	};
}

const isFullUrl = (url: string) =>
	/(wss?|https?):\/\/.+\.(io|com|org|net)(\/.*)?/i.test(url) ||
	url.includes("localhost");
