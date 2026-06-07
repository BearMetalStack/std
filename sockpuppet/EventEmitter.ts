import Channel from "./Channel.ts";
import Client from "./Client.ts";
import Sender from "./Sender.ts";
import type { disconnectCallback, packetCallback } from "./types.ts";
import { Packet } from "./Packet.ts";

export default class EventEmitter {
	public id: string;

	public channels: Map<string, Channel>;

	public clients: Map<string, Client>;

	public sender: Sender;

	public channelMiddleware: Map<string, packetCallback> = new Map();

	constructor(id?: string) {
		this.channels = new Map();
		this.clients = new Map();
		this.sender = new Sender();
		this.id = id || "Server";
	}

	public _createNewChannel = (channelId?: string): Channel => {
		if (!channelId) {
			channelId = crypto.randomUUID();
		}
		const channel = new Channel(channelId);
		this.channels.set(channelId!, channel);
		for (const [nameRule, callback] of this.channelMiddleware.entries()) {
			const rx = new RegExp(nameRule, "g");
			if (rx.test(channelId)) {
				channel.middleware.push(callback);
			}
		}
		this.refreshChannels();
		return channel;
	};

	/**
	 * @param channelNameRule channelNameRule is used to construct a RegExp to test channel names to add the callback to
	 * @param callback callback to be called before any channel listeners are called
	 */
	public use = (channelNameRule: string, callback: packetCallback): void => {
		this.channelMiddleware.set(channelNameRule, callback);
	};

	public closeChannel = (channelId: string): void => {
		for (const client of this.clients.values()) {
			client.socket.send(`${channelId} closed.`);
		}
		this.channels.delete(channelId);
		this.refreshChannels();
	};

	public createClient = (clientId: string, clientSocket: WebSocket): Client => {
		if (!this.clients.get(clientId)) {
			const client = new Client(clientId, clientSocket);
			this.clients.set(clientId, client);
			return client;
		} else {
			return this.clients.get(clientId)!;
		}
	};

	public addClientToChannel = (channelId: string, clientId: string): void => {
		const channel: Channel | undefined = this.channels.get(channelId);
		if (!channel) throw new Error(`Channel "${channelId}; does not exist.`);
		const client: Client | undefined = this.clients.get(clientId);
		if (!client) throw new Error(`Client "${clientId}; does not exist.`);

		if (!channel!.listeners.get(clientId)) channel.listeners.set(clientId, client.socket);
		client.socket.send(`joined ${channelId}`);
		this.refreshChannels();
	};

	public removeClientFromChannel = (channelId: string, clientId: string): void => {
		const channel: Channel | undefined = this.channels.get(channelId);
		if (!channel) throw new Error(`Channel "${channelId}; does not exist.`);
		const client = this.clients.get(clientId);
		if (client) {
			client.socket.send(JSON.stringify({
				event: "leave",
				message: `left ${channelId}`,
				to: clientId,
				from: this.id,
			}));
		}
		channel.listeners.delete(clientId);
		channel.disconnectCallbacks.forEach((cb) => cb(clientId));
		this.refreshChannels();
	};

	public removeClient = (clientId: string): void => {
		for (const channel of this.channels.values()) {
			channel.listeners.delete(clientId);
		}
		this.clients.get(clientId)?.socket.close();
		this.clients.delete(clientId);
		this.refreshChannels();
	};

	public connectCallbacks: (packetCallback)[] = [];
	public onConnect = (callback: packetCallback): number => this.connectCallbacks.push(callback);

	public disconnectCallbacks: disconnectCallback[] = [];
	public onDisconnect = (callback: disconnectCallback): number =>
		this.disconnectCallbacks.push(callback);

	public getClients = (): Map<string, Client> => this.clients;
	public getChannels = (): Map<string, Channel> => this.channels;
	public getChannel = (channelId: string): Channel | undefined => this.channels.get(channelId);

	public to = (channelId: string, message: unknown, clientToSendTo?: string): void => {
		this.queuePacket(new Packet(this, channelId, message), clientToSendTo);
	};

	public queuePacket = (packet: Packet, clientToSendTo?: string): void => {
		const channel = this.channels.get(packet.to);
		if (channel) {
			this.sender.add(packet, channel, clientToSendTo);
		} else throw new Error(`Channel "${packet.to}" does not exist!`);
	};

	public refreshChannels = (): void => {
		const channels = Array.from(this.channels.values()).map((c) => ({
			id: c.id,
			listeners: c.listeners.size,
			createdAt: c.createdAt,
			lastMessage: c.lastMessage,
		}));

		this.clients.forEach((c) => {
			if (c.channelListSubscriber && c.socket.OPEN) {
				c.socket.send(JSON.stringify({ event: "channels", message: channels }));
			}
		});
	};
}
