import {
	createService,
	createServiceToken,
	Module,
	type ServiceToken,
	UpgradeRequired,
} from "@bearmetal/router";

import type Channel from "./Channel.ts";
import type Client from "./Client.ts";
import EventEmitter from "./EventEmitter.ts";
import { Sockpuppet } from "./mod.ts";
import { Packet } from "./Packet.ts";
import Transmitter from "./Transmitter.ts";
import type { ITransmitterOptions, packetCallback } from "./types.ts";

export type SockpuppetActions = {
	sendToChannel: (channelId: string, message: string) => Promise<void>;
	createChannel: (channelId: string) => Promise<void>;
	closeChannel: (channelId: string) => Promise<void>;
	sendToClient: (clientId: string, message: string) => Promise<void>;
};

export const SockpuppetServiceToken: ServiceToken<SockpuppetActions> = createServiceToken<
	SockpuppetActions
>("SockpuppetService");

type BuilderActions = {
	build: () => Module;
	addMiddleware: (channelId: string, middleware: packetCallback) => BuilderActions;
	permanentChannel: (channelId: string) => BuilderActions;
};

export function sockpuppetModule(
	path: string = "/_sockpuppet",
	transmitterOptions?: ITransmitterOptions,
): BuilderActions {
	const puppet = new SocketServer(transmitterOptions);
	const SocketService = createService<SockpuppetActions>({
		sendToChannel: async (channelId: string, message: string) => {
			await puppet.getChannel(channelId)?.listeners.forEach((socket) => {
				socket.send(message);
			});
		},
		createChannel: async (channelId: string) => {
			await puppet.createChannel(channelId);
		},
		closeChannel: async (channelId: string) => {
			await puppet.closeChannel(channelId);
		},
		sendToClient: async (clientId: string, message: string) => {
			await puppet.getClients().get(clientId)?.socket.send(message);
		},
	});
	const mod = new Module();
	mod.provides(SockpuppetServiceToken, SocketService);
	mod.route(path).get((ctx) => {
		return puppet.requestHandler(ctx.request, ctx.connection);
	});

	const builderActions: BuilderActions = {
		// deno-lint-ignore ban-types
		build(): Module<{}> {
			return mod;
		},
		addMiddleware(channelPattern: string, middleware: packetCallback): BuilderActions {
			puppet.channelMiddleware.set(channelPattern, middleware);
			return builderActions;
		},
		permanentChannel(channelId: string): BuilderActions {
			puppet.createChannel(channelId);
			return builderActions;
		},
	};

	return builderActions;
}

interface ISocketServer {
	requestHandler: Deno.ServeHandler;
}

export class SocketServer extends EventEmitter implements ISocketServer {
	protected PermanentChannels: Map<string, Channel> = new Map();

	constructor(
		transmitterOptions?: ITransmitterOptions,
	) {
		super();
		this.transmitter = new Transmitter(this, transmitterOptions);
	}

	public transmitter: Transmitter;

	private startTime: number = Date.now();
	private totalMessages: number = 0;
	static dashVersion: string = "1";
	static readonly puppetVersion: string = "0.6";

	requestHandler(req: Request, _ctx: Deno.ServeHandlerInfo<Deno.Addr>): Response {
		if (req.headers.get("upgrade") === "websocket") {
			try {
				const { response, socket } = Deno.upgradeWebSocket(req, { idleTimeout: 0 });
				this.handleWs(socket);
				return response;
			} catch (err) {
				console.error(`failed to accept websocket: ${err}`);
				return new Response("There was an error while upgrading the socket\n" + err, {
					status: 500,
				});
			}
		} else {
			return UpgradeRequired();
		}
	}

	handleWs = (sock: WebSocket): void => {
		const client = this.createClient(crypto.randomUUID(), sock);

		sock.onopen = () => {
			setTimeout(() => sock.readyState === 1 && sock.send("ping"), 2000);
		};

		sock.onmessage = async (ev) => {
			this.totalMessages++;
			try {
				if (typeof ev.data === "string") {
					// text message.
					await this.handleMessageAsString(client, ev.data);
				} else if (ev.data instanceof Uint8Array) {
					// binary message.
					await this.handleMessageAsBinary(client, ev.data);
				}
			} catch (err) {
				console.error(`failed to receive frame: ${err}`);

				if (!sock.CLOSED) {
					await sock.close(1000);
				}
			}
		};

		sock.onclose = () => {
			this.removeClient(client.id);
		};
	};

	protected async handleMessageAsBinary(client: Client, message: Uint8Array): Promise<void> {
		const decoded = JSON.parse(new TextDecoder().decode(message));
		const packet = new Packet(client, decoded.to, decoded.message);
		return await this.transmitter.handlePacket(packet);
	}

	protected handleMessageAsString = async (client: Client, message: string): Promise<void> => {
		switch (message) {
			case "id":
				client.socket.send(`Client ID: ${client.id}`);
				break;
			case "ping":
				client.socket.send("pong");
				break;
			case "pong": {
				this.totalMessages--;
				const packet = new Packet(client, "pong");
				this.transmitter.handlePacket(packet);
				// console.log(this.clients);
				break;
			}
			case "channels":
				{
					const packet = new Packet(client, "channels");
					packet.message = Array.from(this.channels.values()).map((c) => ({
						id: c.id,
						listeners: c.listeners.size,
						createdAt: c.createdAt,
						lastMessage: c.lastMessage,
						dashVersion: Sockpuppet.dashVersion,
					}));
					this.transmitter.handlePacket(packet);
				}
				break;
			case "meta":
				{
					this.totalMessages--;
					const packet = new Packet(client, "meta");
					packet.message = {
						dashVersion: Sockpuppet.dashVersion,
						serverStart: this.startTime,
						listeners: this.clients.size,
						totalMessages: this.totalMessages,
					}, this.transmitter.handlePacket(packet);
				}
				break;
			case "handshake":
				{
					this.totalMessages--;
					const packet = new Packet(client, "handshake");
					packet.message = {
						puppetVersion: Sockpuppet.puppetVersion,
					};
					this.transmitter.handlePacket(packet);
				}
				break;
			default:
				return await this.handleMessageAsJson(client, message);
		}
	};

	protected handleMessageAsJson = async (client: Client, message: string): Promise<void> => {
		try {
			const json = JSON.parse(message);

			if (json.send_packet) {
				const packet = new Packet(
					client,
					json.send_packet.to,
					json.send_packet.message,
					json.send_packet.echo,
				);
				return await this.transmitter.handlePacket(packet);
			}

			if (json.connect_to) {
				json.connect_to.forEach((channelId: string) => {
					try {
						this.addClientToChannel(channelId, client.id);
						client.listeningTo.push(channelId);
						client.socket.send(`Connected to ${channelId}`);
					} catch (e) {
						if (e instanceof Error) client.socket.send(e.message);
						if (typeof e === "string") client.socket.send(e);
					}
				});
				return;
			}

			if (json.disconnect_from) {
				json.disconnect_from.forEach((channelId: string) => {
					try {
						this.removeClientFromChannel(channelId, client.id);
						client.listeningTo.filter((cid) => cid !== channelId);
						client.socket.send(`Disconnected from ${channelId}`);
					} catch (e) {
						if (e instanceof Error) client.socket.send(e.message);
						if (typeof e === "string") client.socket.send(e);
					}
				});
			}

			if (json.create_channel) {
				try {
					let channel = this.channels.get(json.create_channel);
					if (!channel) {
						channel = this._createNewChannel(json.create_channel);
						channel.disconnectCallbacks.push(() => {
							if (!channel!.listeners.size) this.channels.delete(channel!.id);
						});
					}
					client.socket.send(JSON.stringify({
						event: "create",
						status: "SUCCESS",
						channelId: channel.id,
					}));
				} catch (e) {
					if (e instanceof Error) {
						client.socket.send(JSON.stringify({
							event: "create",
							status: "FAILED",
							reason: e.message,
						}));
					}
					if (typeof e === "string") {
						client.socket.send(JSON.stringify({
							event: "create",
							status: "FAILED",
							reason: e,
						}));
					}
				}
			}
		} catch (e) {
			if (e instanceof Error) client.socket.send(e.message);
			if (typeof e === "string") client.socket.send(e);
		}
	};

	public createChannel = (channelId: string): Channel => {
		this.PermanentChannels.set(channelId, this._createNewChannel(channelId));
		return this.PermanentChannels.get(channelId)!;
	};
}
