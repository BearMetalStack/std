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

// =================

/**
 * OKLCH-based color stop generator.
 *
 * Given a single seed color + which stop index it represents, generates
 * a full perceptually-even lightness ramp (e.g. a 50–950 Tailwind-style scale)
 * by holding chroma and hue fixed and sweeping L, then gamut-mapping any
 * stop that falls outside sRGB.
 *
 * No dependencies — includes its own sRGB <-> Linear sRGB <-> Oklab <-> OKLCH math.
 */

// ---------- Types ----------

interface Oklch {
	l: number; // 0-1
	c: number; // roughly 0-0.4 in practice
	h: number; // degrees, 0-360
}

interface Srgb {
	r: number; // 0-1
	g: number;
	b: number;
}

// ---------- sRGB <-> Linear sRGB ----------

function srgbToLinear(c: number): number {
	const abs = Math.abs(c);
	return abs <= 0.04045 ? c / 12.92 : Math.sign(c) * Math.pow((abs + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
	const abs = Math.abs(c);
	return abs <= 0.0031308 ? c * 12.92 : Math.sign(c) * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055);
}

// ---------- Linear sRGB <-> Oklab ----------
// Matrices from Björn Ottosson's Oklab reference implementation.

function linearSrgbToOklab(r: number, g: number, b: number) {
	const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
	const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
	const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

	const l_ = Math.cbrt(l);
	const m_ = Math.cbrt(m);
	const s_ = Math.cbrt(s);

	return {
		L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
		a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
		b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
	};
}

function oklabToLinearSrgb(L: number, a: number, b: number): Srgb {
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;

	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;

	return {
		r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	};
}

// ---------- OKLCH <-> Oklab ----------

export function oklchToOklab(oklch: Oklch): { L: number; a: number; b: number } {
	const hRad = (oklch.h * Math.PI) / 180;
	return {
		L: oklch.l,
		a: oklch.c * Math.cos(hRad),
		b: oklch.c * Math.sin(hRad),
	};
}

export function oklabToOklch(L: number, a: number, b: number): Oklch {
	const c = Math.sqrt(a * a + b * b);
	let h = (Math.atan2(b, a) * 180) / Math.PI;
	if (h < 0) h += 360;
	return { l: L, c, h };
}

// ---------- Top-level conversions ----------

export function oklchToSrgb(oklch: Oklch): Srgb {
	const lab = oklchToOklab(oklch);
	const linear = oklabToLinearSrgb(lab.L, lab.a, lab.b);
	return {
		r: linearToSrgb(linear.r),
		g: linearToSrgb(linear.g),
		b: linearToSrgb(linear.b),
	};
}

export function srgbToOklch(srgb: Srgb): Oklch {
	const linear = {
		r: srgbToLinear(srgb.r),
		g: srgbToLinear(srgb.g),
		b: srgbToLinear(srgb.b),
	};
	const lab = linearSrgbToOklab(linear.r, linear.g, linear.b);
	return oklabToOklch(lab.L, lab.a, lab.b);
}

export function hexToSrgb(hex: string): Srgb {
	const clean = hex.replace("#", "");
	const r = parseInt(clean.slice(0, 2), 16) / 255;
	const g = parseInt(clean.slice(2, 4), 16) / 255;
	const b = parseInt(clean.slice(4, 6), 16) / 255;
	return { r, g, b };
}

function srgbToHex(srgb: Srgb): string {
	const toByte = (c: number) =>
		Math.round(Math.min(1, Math.max(0, c)) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${toByte(srgb.r)}${toByte(srgb.g)}${toByte(srgb.b)}`;
}

function isInGamut(srgb: Srgb, epsilon = 0.0001): boolean {
	return (
		srgb.r >= -epsilon &&
		srgb.r <= 1 + epsilon &&
		srgb.g >= -epsilon &&
		srgb.g <= 1 + epsilon &&
		srgb.b >= -epsilon &&
		srgb.b <= 1 + epsilon
	);
}

/**
 * Gamut-map an OKLCH color into sRGB by reducing chroma (holding L and H fixed)
 * via binary search until it lands in-gamut. This is the "CSS Color 4" style
 * approach: preserve lightness and hue exactly, sacrifice chroma minimally.
 */
function gamutMapToSrgb(oklch: Oklch, precision = 0.0001): Srgb {
	const direct = oklchToSrgb(oklch);
	if (isInGamut(direct)) return direct;

	let loC = 0;
	let hiC = oklch.c;
	let candidate = direct;

	// Binary search for the largest in-gamut chroma at this L/H.
	while (hiC - loC > precision) {
		const midC = (loC + hiC) / 2;
		const testColor = oklchToSrgb({ l: oklch.l, c: midC, h: oklch.h });
		if (isInGamut(testColor)) {
			loC = midC;
			candidate = testColor;
		} else {
			hiC = midC;
		}
	}

	// Final clamp as a safety net for float error at the boundary.
	return {
		r: Math.min(1, Math.max(0, candidate.r)),
		g: Math.min(1, Math.max(0, candidate.g)),
		b: Math.min(1, Math.max(0, candidate.b)),
	};
}

// ---------- Stop scale generation ----------

interface StopScaleOptions {
	/** Seed color as hex, e.g. "#7c3aed" */
	seedHex: string;
	/** Which stop the seed represents, e.g. 500 */
	seedStop: number;
	/** All stop indices to generate, e.g. [50,100,200,...,900,950] */
	stops: number[];
	/**
	 * Target L value (0-1) for each stop index. This is your "perceptual ladder" —
	 * tune these once, reuse for every seed color/hue.
	 * Keys must match every value in `stops`.
	 */
	lightnessMap: Record<number, number>;
}

function generateStopScale(
	opts: StopScaleOptions,
): Record<number, { hex: string; oklch: Oklch; clamped: boolean }> {
	const seedSrgb = hexToSrgb(opts.seedHex);
	const seedOklch = srgbToOklch(seedSrgb);

	const result: Record<
		number,
		{ hex: string; oklch: Oklch; clamped: boolean }
	> = {};

	for (const stop of opts.stops) {
		const targetL = opts.lightnessMap[stop];
		if (targetL === undefined) {
			throw new Error(`No lightness mapping provided for stop ${stop}`);
		}

		const stopOklch: Oklch = {
			l: targetL,
			c: seedOklch.c, // hold chroma fixed from the seed
			h: seedOklch.h, // hold hue fixed from the seed
		};

		const direct = oklchToSrgb(stopOklch);
		const clamped = !isInGamut(direct);
		const finalSrgb = clamped ? gamutMapToSrgb(stopOklch) : direct;

		result[stop] = {
			hex: srgbToHex(finalSrgb),
			oklch: stopOklch,
			clamped,
		};
	}

	return result;
}

// ---------- Example usage ----------

// A perceptual lightness ladder — tune this once. These are illustrative;
// you'll want to eyeball/adjust based on your actual design needs.
export const DEFAULT_LIGHTNESS_MAP: Record<number, number> = {
	50: 0.97,
	100: 0.93,
	200: 0.85,
	300: 0.75,
	400: 0.65,
	500: 0.55, // <- typical "base" stop
	600: 0.45,
	700: 0.35,
	800: 0.27,
	900: 0.2,
	950: 0.14,
} as const;

export const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export function seededScale(
	seedHex: string,
	seedStop: number = 500,
	lightnessMap = DEFAULT_LIGHTNESS_MAP,
): Record<number, { hex: string; oklch: Oklch; clamped: boolean }> {
	return generateStopScale({
		seedHex,
		seedStop,
		stops: STOPS,
		lightnessMap,
	});
}

export function isValidHex(hex: string): boolean {
	return /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
}

/**
 * Generates a lightness map derived from one seed stop's lightness value,
 * spanning the full range of the given bounds: the lightest stop lands on
 * `bounds.max` (nearly white) and the darkest on `bounds.min` (nearly black).
 * Steps are evenly spaced within each side of the seed, but the two sides
 * may pace differently so both extremes are always reached.
 *
 * With `uniformStep` set, both sides instead share a single step size — the
 * smaller of the two — so the ramp is evenly spaced across the whole scale.
 * The trade-off is that the roomier side no longer reaches its extreme: a
 * seed placed at an unusual position — e.g. stop 200 = 0.5 — steps out by a
 * modest, uniform amount rather than stretching to the bounds.
 *
 * @param lightnessSeed - L value (0-1) for the seed stop
 * @param seedStop - which stop index the seed lightness represents
 * @param stops - full ordered list of stop indices, lightest to darkest
 *   (defaults to a Tailwind-style 50-950 scale)
 * @param bounds - the L range the ramp fills, so extreme stops never
 *   overshoot into implausible lightness/darkness
 * @param uniformStep - share one step size across both sides of the seed
 *   instead of reaching both extremes
 */
export function generateRelativeLightnessMap(
	lightnessSeed: number,
	seedStop: number,
	stops: number[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
	bounds: { min: number; max: number } = { min: 0.1, max: 0.98 },
	uniformStep: boolean = false,
): Record<number, number> {
	const seedIndex = stops.indexOf(seedStop);
	if (seedIndex === -1) {
		throw new Error(`seedStop ${seedStop} is not present in stops list`);
	}

	const stepsAboveSeed = seedIndex; // toward lighter stops (index 0 = lightest)
	const stepsBelowSeed = stops.length - 1 - seedIndex; // toward darker stops

	// Room available on each side, bounded so we never propose an L outside [min, max].
	const roomAbove = bounds.max - lightnessSeed;
	const roomBelow = lightnessSeed - bounds.min;

	// Step size per side — each side paces itself to land exactly on its
	// bound, so the scale always reaches nearly-white and nearly-black.
	let stepAbove = stepsAboveSeed > 0 ? roomAbove / stepsAboveSeed : 0;
	let stepBelow = stepsBelowSeed > 0 ? roomBelow / stepsBelowSeed : 0;

	if (uniformStep) {
		// Share the smaller of the two non-zero steps across both sides, so the
		// ramp feels evenly spaced across the whole scale rather than having a
		// visibly different pace above vs. below the seed. The roomier side
		// will fall short of its bound.
		const candidateSteps = [stepAbove, stepBelow].filter((s) => s > 0);
		const sharedStep = candidateSteps.length > 0 ? Math.min(...candidateSteps) : 0;
		stepAbove = sharedStep;
		stepBelow = sharedStep;
	}

	const map: Record<number, number> = {};

	stops.forEach((stop, index) => {
		const distanceFromSeed = seedIndex - index; // positive = lighter side
		const step = distanceFromSeed > 0 ? stepAbove : stepBelow;
		const l = lightnessSeed + distanceFromSeed * step;
		map[stop] = Math.min(bounds.max, Math.max(bounds.min, l));
	});

	return map;
}
