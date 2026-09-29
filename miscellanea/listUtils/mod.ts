export function random<T>(...args: T[]): T {
	return args[Math.floor(Math.random() * args.length)];
}

export { Chain, Grouping, OrderedChain } from "./chain.ts";
