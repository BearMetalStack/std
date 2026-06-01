import type { Message } from "./Message.ts";

export type channelCallback<T> = (message: T) => void;
export type socketCallback = (message?: Message | string) => void;
