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

export function toHex(r: number, g: number, b: number): string {
	return "#" + [r, g, b]
		.map((c) => Math.round(linearToSrgb(c) * 255).toString(16).padStart(2, "0"))
		.join("").toUpperCase();
}

export function rainbowPalette(steps: number, lightness = 0.68, chroma = 0.14): string[] {
	return Array.from({ length: steps }, (_, i) => {
		const hue = (2 * Math.PI * i) / steps;
		const a = chroma * Math.cos(hue);
		const b = chroma * Math.sin(hue);
		const [lr, lg, lb] = oklabToLinear(lightness, a, b);
		return toHex(lr, lg, lb);
	});
}

// 28 subdued steps
// console.log(rainbowPalette(28));
