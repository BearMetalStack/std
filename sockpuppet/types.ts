export interface ITransmitterOptions {
	pingInterval?: number;
	pingTimeout?: number;
	reconnect?: boolean;
}
import type { Packet } from "./Packet.ts";

export type packetCallback = (packet: Packet<unknown>) => void;
export type disconnectCallback = (clientId: string) => void;
