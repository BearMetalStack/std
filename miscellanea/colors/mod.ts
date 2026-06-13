export function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
	];
}

export function linearToSrgb(x: number): number {
	const c = Math.max(0, Math.min(1, x));
	return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function srgbToOkLab(r: number, g: number, b: number): [number, number, number] {
	const L = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
	const a = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
	const br = 0.0883024619 * r + 0.2817188376 * g + 0.6302613616 * b;
	return [L, a, br];
}

export function toHex(r: number, g: number, b: number): string {
	return "#" + [r, g, b]
		.map((c) => c.toString(16).padStart(2, "0"))
		.join("").toUpperCase();
}

export function okLabToSrgb(L: number, a: number, b: number): [number, number, number] {
	return oklabToLinear(L, a, b).map((e) => Math.round(linearToSrgb(e) * 255)) as [
		number,
		number,
		number,
	];
}

export function rainbowPalette(steps: number, lightness = 0.68, chroma = 0.14): string[] {
	return Array.from({ length: steps }, (_, i) => {
		const hue = (2 * Math.PI * i) / steps;
		const a = chroma * Math.cos(hue);
		const br = chroma * Math.sin(hue);
		const [r, g, b] = okLabToSrgb(lightness, a, br);
		return toHex(r, g, b);
	});
}
