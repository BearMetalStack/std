import type { ImageFit, ImagePaint, ImageSource, Paint, RawImage, Rect } from "../types.ts";

/** `true` for raw pixels, as opposed to a DOM image source. */
export function isRawImage(src: ImageSource): src is RawImage {
	return "pixels" in src;
}

/** `true` when a fill is an image rather than a color. */
export function isImagePaint(p: Paint): p is ImagePaint {
	return typeof p === "object" && !Array.isArray(p) && "image" in p;
}

/** Intrinsic size in pixels. `0×0` for an image element that has not loaded yet. */
export function imageSize(src: ImageSource): { width: number; height: number } {
	if (isRawImage(src)) return { width: src.width, height: src.height };
	if ("naturalWidth" in src) return { width: src.naturalWidth, height: src.naturalHeight };
	if ("videoWidth" in src) return { width: src.videoWidth, height: src.videoHeight };
	if ("displayWidth" in src) return { width: src.displayWidth, height: src.displayHeight };
	return { width: src.width, height: src.height };
}

/** Where an `iw×ih` image lands when fitted into `box`, as in CSS `object-fit`/`object-position`. */
export function fitImage(
	iw: number,
	ih: number,
	box: Rect,
	fit: ImageFit,
	[px, py]: readonly [number, number],
): Rect {
	if (fit === "fill") return box;
	const k = fit === "contain"
		? Math.min(box.w / iw, box.h / ih)
		: fit === "cover"
		? Math.max(box.w / iw, box.h / ih)
		: 1;
	const w = iw * k, h = ih * k;
	return { x: box.x + (box.w - w) * px, y: box.y + (box.h - h) * py, w, h };
}
