/**
 * Embedding images in an office package.
 *
 * clawmark never opens a file, so on its own an image can only be written as a
 * link to wherever its `src` points. A caller that *does* have the bytes hands
 * over an {@linkcode ImageResolver}; every image it resolves is written into
 * the package as a media part, referenced from inside, and sized from its real
 * pixel dimensions. Anything it declines keeps the link.
 *
 * The bytes come back on {@linkcode WriteResult.media}, beside the string
 * `parts` - the result is still unzipped, so the caller packs both.
 *
 * @module
 */

import type { ResolvedPage } from "./page.ts";

/** What a resolver hands back for an image it can embed. */
export interface ImageSource {
	bytes: Uint8Array;
	/** Its media type, e.g. `"image/png"`. */
	mime: string;
	/** Pixel size, if known. Without it the format's fallback size is used. */
	width?: number;
	height?: number;
}

/** Bytes for an image `src`, or nothing to leave it as a link. */
export type ImageResolver = (src: string) => ImageSource | null | undefined;

/** An image that was embedded, and where in the package it went. */
export interface EmbeddedImage extends ImageSource {
	src: string;
	/** Package path, e.g. `word/media/image1.png` or `Pictures/image1.png`. */
	path: string;
	ext: string;
}

const MEDIA = "clawmark:media";

const EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpeg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
	"image/bmp": "bmp",
	"image/tiff": "tiff",
	"image/avif": "avif",
};

/** The file extension a media type is written under. */
export function extensionFor(mime: string): string {
	return EXTENSIONS[mime] ?? (mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin");
}

function registry(state: Map<string, unknown>): Map<string, EmbeddedImage> {
	let map = state.get(MEDIA) as Map<string, EmbeddedImage> | undefined;
	if (!map) {
		map = new Map();
		state.set(MEDIA, map);
	}
	return map;
}

/**
 * The embedded copy of `src`, adding it on first use - one media part per
 * distinct image however often it appears. `null` if there's no resolver or
 * it declined.
 */
export function embedImage(
	state: Map<string, unknown>,
	src: string,
	resolve: ImageResolver | undefined,
	dir: string,
): EmbeddedImage | null {
	if (!resolve || !src) return null;
	const map = registry(state);
	const hit = map.get(src);
	if (hit) return hit;
	const source = resolve(src);
	if (!source?.bytes?.length) return null;
	const ext = extensionFor(source.mime);
	const image: EmbeddedImage = {
		...source,
		src,
		ext,
		path: `${dir}image${map.size + 1}.${ext}`,
	};
	map.set(src, image);
	return image;
}

/** Every image embedded during a write pass, in first-use order. */
export function embeddedImages(state: Map<string, unknown>): EmbeddedImage[] {
	return [...registry(state).values()];
}

/** The `media` field of a write result, keyed by package path. */
export function mediaParts(images: EmbeddedImage[]): Record<string, Uint8Array> {
	return Object.fromEntries(images.map((image) => [image.path, image.bytes]));
}

/** Points across the text block: the page width less its side margins. */
export function textWidth(page: ResolvedPage): number {
	const width = page.size?.width ?? 612;
	const left = page.margins?.left ?? 72;
	const right = page.margins?.right ?? 72;
	return Math.max(72, width - left - right);
}

/**
 * An image's size in points: its pixels at 96 per inch, scaled down
 * (keeping the aspect ratio) to fit `maxWidth`. `null` without both
 * dimensions.
 */
export function imageSize(
	image: { width?: number; height?: number },
	maxWidth: number,
): { width: number; height: number } | null {
	if (!image.width || !image.height) return null;
	let width = image.width * 0.75;
	let height = image.height * 0.75;
	if (width > maxWidth) {
		height = height * maxWidth / width;
		width = maxWidth;
	}
	return { width, height };
}
