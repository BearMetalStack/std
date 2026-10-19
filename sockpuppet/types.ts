import type Client from "./Client.ts";

export interface ITransmitterOptions {
	pingInterval?: number;
	pingTimeout?: number;
	reconnect?: boolean;
}

/** Options for a {@linkcode SocketServer}: transmitter timings plus access control. */
export interface SocketServerOptions extends ITransmitterOptions {
	/**
	 * Runs before a socket is upgraded. Return `false`, `null` or `undefined` to
	 * refuse it with a `401`; anything else is accepted and kept on the client as
	 * `client.meta` — the session or user it belongs to, say — for
	 * {@linkcode SocketServerOptions.canJoin} and channel middleware to read.
	 */
	authorize?: (
		req: Request,
		info?: Deno.ServeHandlerInfo<Deno.Addr>,
	) => unknown | Promise<unknown>;
	/** Decides whether a client may join a channel. Defaults to allowing every join. */
	canJoin?: (client: Client, channelId: string) => boolean | Promise<boolean>;
}
import type { Packet } from "./Packet.ts";

/**
 * Called with every packet sent to a channel. Middleware that returns `false`
 * drops the packet before the channel's listeners — including the broadcast to
 * other clients — ever see it.
 */
export type packetCallback = (packet: Packet<unknown>) => void | boolean;
export type disconnectCallback = (clientId: string) => void;
export type joinCallback = (client: Client, channelId: string) => void;
