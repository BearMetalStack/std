export function drain<T>(cleanups: T[], drainFn: (a: T) => void): void {
	while (cleanups.length) drainFn(cleanups.shift()!);
}
