import type { ImageSource } from "../types.ts";
import { decodePng } from "./png.ts";

/** `true` when this runtime can decode images itself and hand them to the GPU (browsers). */
function canUploadBitmaps(): boolean {
	if (typeof createImageBitmap !== "function") return false;
	return (typeof GPUQueue !== "undefined" &&
		typeof GPUQueue.prototype.copyExternalImageToTexture === "function") ||
		typeof WebGL2RenderingContext !== "undefined";
}

/**
 * Loads an image from a URL, file bytes or a `Blob`, ready to draw. In a browser it is decoded by
 * the browser, so any format it supports works, and you get an `ImageBitmap`. Elsewhere (Deno)
 * PNG files are decoded by {@linkcode decodePng} into raw pixels; other formats are rejected.
 */
export async function loadImage(src: string | URL | Uint8Array | Blob): Promise<ImageSource> {
	const blob = src instanceof Blob
		? src
		: src instanceof Uint8Array
		? new Blob([src as BlobPart])
		: await fetch(src).then((r) => {
			if (!r.ok) throw new Error(`anodized: loadImage: ${r.status} ${r.statusText} for ${src}`);
			return r.blob();
		});
	if (canUploadBitmaps()) return await createImageBitmap(blob);
	const bytes = new Uint8Array(await blob.arrayBuffer());
	if (bytes[0] === 0x89 && bytes[1] === 0x50) return await decodePng(bytes);
	const kind = bytes[0] === 0xff && bytes[1] === 0xd8 ? "JPEG" : "this format";
	throw new Error(
		`anodized: loadImage: ${kind} cannot be decoded in this runtime; only PNG can. Convert it, or pass raw RGBA pixels`,
	);
}
