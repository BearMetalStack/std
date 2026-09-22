import { TrustedModule } from "@bearmetal/router";
import { isDev } from "@bearmetal/miscellanea/environment";
import { defaultBundleName } from "./components.ts";

/** URL prefix that every component bundle and shared chunk is served under. */
export const componentsEndpoint = "/@bearmetal/components";

/** Served name of the stylesheet holding every component's CSS. */
export const stylesheetName = `${defaultBundleName}.css`;

/** Serves the client bundle at the reserved `/@bearmetal/components` endpoint. */
export class StackComponentsModule extends TrustedModule {
	constructor() {
		super("@bearmetal/components");
	}
}

/**
 * The `<link>` and `<script>` every page references the components through.
 *
 * The default bundle is the only one referenced. Subset bundles are opt-in via
 * their own script tag, and shared chunks are pulled in by the entries that
 * import them.
 */
export function componentHeadTags(styles: string, version: string, hasDefault: boolean) {
	const tags = [];
	if (styles) {
		tags.push(
			<link rel="stylesheet" href={`${componentsEndpoint}/${stylesheetName}?v=${version}`} />,
		);
	}
	if (hasDefault) {
		tags.push(
			<script type="module" src={`${componentsEndpoint}/${defaultBundleName}?v=${version}`} />,
		);
	}
	return tags;
}

/**
 * The bundle URLs carry a content hash, so the answer can be cached forever.
 * In dev it must not be cached at all — the URL is the same across a rebuild
 * whenever the hash happens not to change.
 */
export function cache(res: Response): Response {
	res.headers.set(
		"Cache-Control",
		isDev() ? "no-store" : "public, max-age=31536000, immutable",
	);
	return res;
}

/** Short content hash, enough to bust a cache when the bundle moves. */
export async function fingerprint(...parts: string[]): Promise<string> {
	const data = new TextEncoder().encode(parts.join(" "));
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest).slice(0, 6)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
