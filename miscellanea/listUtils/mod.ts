export function random<T>(...args: T[]): T {
	return args[Math.floor(Math.random() * args.length)];
}
