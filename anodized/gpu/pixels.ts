/** A premultiplied copy of straight-alpha RGBA bytes. */
export function premultiply(px: Uint8Array): Uint8Array {
	const out = new Uint8Array(px);
	for (let i = 0; i < out.length; i += 4) {
		const a = out[i + 3];
		if (a === 255) continue;
		out[i] = Math.round((out[i] * a) / 255);
		out[i + 1] = Math.round((out[i + 1] * a) / 255);
		out[i + 2] = Math.round((out[i + 2] * a) / 255);
	}
	return out;
}

/** Converts premultiplied RGBA bytes to straight alpha in place. */
export function unpremultiply(px: Uint8Array): void {
	for (let i = 0; i < px.length; i += 4) {
		const a = px[i + 3];
		if (a === 0 || a === 255) continue;
		const k = 255 / a;
		px[i] = Math.min(255, Math.round(px[i] * k));
		px[i + 1] = Math.min(255, Math.round(px[i + 1] * k));
		px[i + 2] = Math.min(255, Math.round(px[i + 2] * k));
	}
}
