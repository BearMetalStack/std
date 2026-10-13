/**
 * A path reduced to absolute `M`, `L`, `C`, `Q`, `A` and `Z` commands. Two
 * shapes that differ only in how an editor chose to write them — relative vs
 * absolute, `H` vs `L`, `S` vs `C` — normalize to the same signature.
 */
export interface NormalizedPath {
	/** One letter per command. */
	signature: string;
	/** Every command's arguments, in order. */
	values: Float64Array;
}

const ARITY: Record<string, number> = {
	M: 2,
	L: 2,
	H: 1,
	V: 1,
	C: 6,
	S: 4,
	Q: 4,
	T: 2,
	A: 7,
	Z: 0,
};

function tokenize(d: string): (string | number)[] {
	const tokens: (string | number)[] = [];
	const re = /([MLHVCSQTAZmlhvcsqtaz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
	let arcArg = -1;
	let i = 0;
	while (i < d.length) {
		const ch = d[i];
		if (/[\s,]/.test(ch)) {
			i++;
			continue;
		}
		if (arcArg === 3 || arcArg === 4) {
			if (ch !== "0" && ch !== "1") throw new SyntaxError(`Bad arc flag at ${i} in "${d}"`);
			tokens.push(Number(ch));
			arcArg = (arcArg + 1) % 7;
			i++;
			continue;
		}
		re.lastIndex = i;
		const m = re.exec(d);
		if (!m || m.index !== i) throw new SyntaxError(`Unexpected "${ch}" at ${i} in "${d}"`);
		if (m[1]) {
			tokens.push(m[1]);
			arcArg = m[1].toUpperCase() === "A" ? 0 : -1;
		} else {
			tokens.push(Number(m[2]));
			if (arcArg >= 0) arcArg = (arcArg + 1) % 7;
		}
		i += m[0].length;
	}
	return tokens;
}

/** Parses and normalizes a path `d` attribute. Throws on malformed data. */
export function normalizePath(d: string): NormalizedPath {
	const tokens = tokenize(d);
	let signature = "";
	const values: number[] = [];
	let x = 0, y = 0, startX = 0, startY = 0;
	let lastCtrlX = 0, lastCtrlY = 0, lastCmd = "";
	let cmd = "";
	let t = 0;

	while (t < tokens.length) {
		if (typeof tokens[t] === "string") cmd = tokens[t++] as string;
		else if (!cmd) throw new SyntaxError(`Path "${d}" does not start with a command`);
		const upper = cmd.toUpperCase();
		const rel = cmd !== upper;
		const args = tokens.slice(t, t + ARITY[upper]) as number[];
		if (args.length < ARITY[upper] || args.some((a) => typeof a !== "number")) {
			throw new SyntaxError(`Command ${cmd} is missing arguments in "${d}"`);
		}
		t += ARITY[upper];
		const ox = rel ? x : 0, oy = rel ? y : 0;

		switch (upper) {
			case "M":
				x = args[0] + ox, y = args[1] + oy;
				startX = x, startY = y;
				signature += "M", values.push(x, y);
				cmd = rel ? "l" : "L";
				break;
			case "L":
			case "H":
			case "V":
				if (upper === "L") x = args[0] + ox, y = args[1] + oy;
				else if (upper === "H") x = args[0] + ox;
				else y = args[0] + oy;
				signature += "L", values.push(x, y);
				break;
			case "C":
			case "S": {
				let c1x: number, c1y: number;
				let rest = args;
				if (upper === "S") {
					const smooth = lastCmd === "C";
					c1x = smooth ? 2 * x - lastCtrlX : x;
					c1y = smooth ? 2 * y - lastCtrlY : y;
				} else {
					c1x = args[0] + ox, c1y = args[1] + oy;
					rest = args.slice(2);
				}
				const c2x = rest[0] + ox, c2y = rest[1] + oy;
				x = rest[2] + ox, y = rest[3] + oy;
				signature += "C", values.push(c1x, c1y, c2x, c2y, x, y);
				lastCtrlX = c2x, lastCtrlY = c2y;
				break;
			}
			case "Q":
			case "T": {
				let cx: number, cy: number;
				if (upper === "T") {
					const smooth = lastCmd === "Q";
					cx = smooth ? 2 * x - lastCtrlX : x;
					cy = smooth ? 2 * y - lastCtrlY : y;
					x = args[0] + ox, y = args[1] + oy;
				} else {
					cx = args[0] + ox, cy = args[1] + oy;
					x = args[2] + ox, y = args[3] + oy;
				}
				signature += "Q", values.push(cx, cy, x, y);
				lastCtrlX = cx, lastCtrlY = cy;
				break;
			}
			case "A":
				x = args[5] + ox, y = args[6] + oy;
				signature += "A", values.push(args[0], args[1], args[2], args[3], args[4], x, y);
				break;
			case "Z":
				x = startX, y = startY;
				signature += "Z";
				break;
		}
		lastCmd = upper === "S" ? "C" : upper === "T" ? "Q" : upper;
	}
	return { signature, values: Float64Array.from(values) };
}

/** Whether two shapes can be blended: same commands in the same order. */
export function compatible(a: NormalizedPath, b: NormalizedPath): boolean {
	return a.signature === b.signature;
}

/** The value offsets in `values` that are arc flags and must not be interpolated. */
export function flagOffsets(path: NormalizedPath): number[] {
	const flags: number[] = [];
	let offset = 0;
	for (const c of path.signature) {
		if (c === "A") flags.push(offset + 3, offset + 4);
		offset += ARITY[c];
	}
	return flags;
}

/**
 * Additive blend, as with shape keys: `base + Σ weight × (target − base)`.
 * Weights of 0 contribute nothing; weights may exceed 1 to exaggerate.
 * Arc flags are taken from the heaviest target above 0.5, else the base.
 */
export function blend(
	base: NormalizedPath,
	targets: readonly NormalizedPath[],
	weights: readonly number[],
	out: Float64Array = new Float64Array(base.values.length),
): Float64Array {
	out.set(base.values);
	for (let t = 0; t < targets.length; t++) {
		const w = weights[t];
		if (!w) continue;
		const tv = targets[t].values;
		for (let i = 0; i < out.length; i++) out[i] += w * (tv[i] - base.values[i]);
	}
	const flags = flagOffsets(base);
	if (flags.length) {
		let heaviest = -1, heaviestWeight = 0.5;
		for (let t = 0; t < targets.length; t++) {
			if (weights[t] > heaviestWeight) heaviest = t, heaviestWeight = weights[t];
		}
		const src = heaviest < 0 ? base.values : targets[heaviest].values;
		for (const f of flags) out[f] = src[f];
	}
	return out;
}

/** Linear interpolation between two compatible shapes' values. */
export function lerpValues(a: Float64Array, b: Float64Array, t: number, out: Float64Array) {
	for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
	return out;
}

/** Serializes normalized values back into a `d` attribute. */
export function serializePath(signature: string, values: ArrayLike<number>, precision = 4): string {
	const parts: string[] = [];
	let offset = 0;
	for (const c of signature) {
		const n = ARITY[c];
		const args: string[] = [];
		for (let i = 0; i < n; i++) {
			const v = values[offset + i];
			args.push(
				c === "A" && (i === 3 || i === 4) ? String(Math.round(v)) : +v.toFixed(precision) + "",
			);
		}
		parts.push(n ? `${c} ${args.join(" ")}` : c);
		offset += n;
	}
	return parts.join(" ");
}

/** A 2D affine transform in the `DOMMatrix` a–f layout. */
export interface Affine {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}

export function isIdentity(m: Affine, epsilon = 1e-9): boolean {
	return Math.abs(m.a - 1) < epsilon && Math.abs(m.b) < epsilon && Math.abs(m.c) < epsilon &&
		Math.abs(m.d - 1) < epsilon && Math.abs(m.e) < epsilon && Math.abs(m.f) < epsilon;
}

/**
 * Maps every point of a path through `m`. Returns `null` for a path with arcs
 * under a non-identity transform: an arc's radii and rotation do not map
 * linearly, so it cannot be moved between coordinate spaces this way.
 */
export function transformPath(path: NormalizedPath, m: Affine): NormalizedPath | null {
	if (isIdentity(m)) return path;
	if (path.signature.includes("A")) return null;
	const values = Float64Array.from(path.values);
	for (let i = 0; i < values.length; i += 2) {
		const px = values[i], py = values[i + 1];
		values[i] = m.a * px + m.c * py + m.e;
		values[i + 1] = m.b * px + m.d * py + m.f;
	}
	return { signature: path.signature, values };
}
