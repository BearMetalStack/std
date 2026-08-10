/**
 * @module
 * Builders and normalisers for MCP content blocks and resource contents.
 */

import type {
	Annotations,
	AudioContent,
	ContentBlock,
	EmbeddedResource,
	ImageContent,
	ResourceContents,
	ResourceDescriptor,
	ResourceLink,
	TextContent,
} from "./types.ts";

/** Encode bytes as base64 without pulling in a dependency. */
export function toBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

/** Decode a base64 string back into bytes. */
export function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export function text(value: string, annotations?: Annotations): TextContent {
	return annotations ? { type: "text", text: value, annotations } : { type: "text", text: value };
}

/** A text block holding pretty-printed JSON. */
export function json(value: unknown, annotations?: Annotations): TextContent {
	return text(JSON.stringify(value, null, 2), annotations);
}

export function image(
	data: Uint8Array | string,
	mimeType: string,
	annotations?: Annotations,
): ImageContent {
	const block: ImageContent = {
		type: "image",
		data: typeof data === "string" ? data : toBase64(data),
		mimeType,
	};
	return annotations ? { ...block, annotations } : block;
}

export function audio(
	data: Uint8Array | string,
	mimeType: string,
	annotations?: Annotations,
): AudioContent {
	const block: AudioContent = {
		type: "audio",
		data: typeof data === "string" ? data : toBase64(data),
		mimeType,
	};
	return annotations ? { ...block, annotations } : block;
}

/** Point at a resource without inlining it. */
export function resourceLink(
	resource: ResourceDescriptor | (Omit<ResourceDescriptor, "name"> & { name?: string }),
): ResourceLink {
	const { uri, name, title, description, mimeType, annotations } = resource as ResourceDescriptor;
	const block: ResourceLink = { type: "resource_link", uri, name: name ?? uri };
	if (title !== undefined) block.title = title;
	if (description !== undefined) block.description = description;
	if (mimeType !== undefined) block.mimeType = mimeType;
	if (annotations !== undefined) block.annotations = annotations;
	return block;
}

/** Inline a resource's contents into a message. */
export function embeddedResource(
	uri: string,
	contents: string | Uint8Array | ResourceContents,
	mimeType?: string,
): EmbeddedResource {
	return { type: "resource", resource: toResourceContents(uri, contents, mimeType) };
}

/** Is this value already a content block? */
export function isContentBlock(value: unknown): value is ContentBlock {
	if (typeof value !== "object" || value === null) return false;
	const type = (value as { type?: unknown }).type;
	return type === "text" || type === "image" || type === "audio" ||
		type === "resource_link" || type === "resource";
}

/** Coerce a string, byte array or partial contents object into `ResourceContents`. */
export function toResourceContents(
	uri: string,
	value: string | Uint8Array | ResourceContents,
	mimeType?: string,
): ResourceContents {
	if (typeof value === "string") {
		return mimeType ? { uri, mimeType, text: value } : { uri, text: value };
	}
	if (value instanceof Uint8Array) {
		return { uri, mimeType: mimeType ?? "application/octet-stream", blob: toBase64(value) };
	}

	const contents = { ...value, uri: value.uri || uri };
	if (contents.mimeType === undefined && mimeType !== undefined) contents.mimeType = mimeType;
	return contents;
}
