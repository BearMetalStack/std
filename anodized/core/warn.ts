const warned = new Set<string>();

/** Logs a warning the first time a given message comes up, and never again. */
export function warnOnce(msg: string): void {
	if (warned.has(msg)) return;
	warned.add(msg);
	console.warn(`anodized: ${msg}`);
}
