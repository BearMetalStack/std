/** A linear mapping from a data domain onto a range, e.g. data values onto world coordinates. */
export interface LinearScale {
	(value: number): number;
	/** The inverse mapping. */
	invert(value: number): number;
	readonly domain: readonly [number, number];
	readonly range: readonly [number, number];
	/** Round tick values covering the domain; see {@linkcode niceTicks}. */
	ticks(count?: number): number[];
}

/** Creates a {@linkcode LinearScale}. A zero-width domain maps everything to the range start. */
export function linearScale(
	domain: readonly [number, number],
	range: readonly [number, number],
): LinearScale {
	const [d0, d1] = domain, [r0, r1] = range;
	const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
	const f = ((v: number) => r0 + (v - d0) * k) as LinearScale;
	return Object.assign(f, {
		invert: (v: number) => (k === 0 ? d0 : d0 + (v - r0) / k),
		domain,
		range,
		ticks: (count = 5) => niceTicks(Math.min(d0, d1), Math.max(d0, d1), count),
	});
}

/** A step of 1, 2 or 5 times a power of ten, close to `span / count`. */
export function niceStep(span: number, count: number): number {
	if (!(span > 0) || count <= 0) return 0;
	const raw = span / count;
	const pow = 10 ** Math.floor(Math.log10(raw));
	const f = raw / pow;
	return (f >= Math.sqrt(50) ? 10 : f >= Math.sqrt(10) ? 5 : f >= Math.SQRT2 ? 2 : 1) * pow;
}

/** Roughly `count` round tick values inside `[min, max]`. */
export function niceTicks(min: number, max: number, count = 5): number[] {
	if (min === max) return [min];
	const step = niceStep(max - min, count);
	if (!step) return [];
	const start = Math.ceil(min / step - 1e-9);
	const end = Math.floor(max / step + 1e-9);
	const out: number[] = [];
	const decimals = Math.max(0, -Math.floor(Math.log10(step)));
	for (let i = start; i <= end; i++) out.push(Number((i * step).toFixed(decimals)));
	return out;
}
