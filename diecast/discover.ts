/**
 * @module
 * Finding what an emitted page references.
 *
 * A generated page is only servable if the things it points at were generated
 * too. Attribute scanning covers the obvious cases, but `@bearmetal/app`'s SSR
 * inlines its component scripts and lets them pull their shared chunks in by
 * relative specifier - those imports live inside script bodies, so a page can
 * look complete and still fail to hydrate.
 */

/** `src` / `href` on the elements that pull in a subresource. */
const ATTR_REF =
	/<(?:script|link|img|source|iframe|embed|video|audio)\b[^>]*?\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** `<a href>`, which points at another page rather than a subresource. */
const ANCHOR = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** Inline `<script type="module">` bodies, where import specifiers hide. */
const INLINE_MODULE = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Static and dynamic import specifiers. Covers `import x from "…"`,
 * `import "…"`, `export … from "…"` and `import("…")`.
 */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

/** What a page pointed at, split by how it should be handled. */
export type PageReferences = {
	/** Subresources: scripts, stylesheets, images, and module chunks. */
	assets: string[];
	/** Same-document navigation targets. */
	links: string[];
};

/** Character references that can appear in an attribute value. */
const ENTITY = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|#39));/g;

const NAMED: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	"#39": "'",
};

/**
 * Decode an HTML attribute value to the string the browser would use.
 *
 * A URL carrying more than one query parameter is written `?a=1&amp;b=2` in
 * conforming markup - decoding is what makes the second parameter `b` rather
 * than `amp;b`, and so what makes the request diecast issues the request the
 * browser issues.
 */
export function decodeEntities(value: string): string {
	if (!value.includes("&")) return value;
	return value.replace(ENTITY, (whole, dec: string, hex: string, name: string) => {
		if (dec !== undefined) return codePoint(Number(dec)) ?? whole;
		if (hex !== undefined) return codePoint(parseInt(hex, 16)) ?? whole;
		return NAMED[name] ?? whole;
	});
}

function codePoint(value: number): string | undefined {
	if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return undefined;
	return String.fromCodePoint(value);
}

function captured(match: RegExpMatchArray): string | undefined {
	return match[1] ?? match[2] ?? match[3];
}

/** Attribute values exactly as the document spells them, entities and all. */
function collectRaw(html: string, rx: RegExp): string[] {
	const out: string[] = [];
	for (const match of html.matchAll(rx)) {
		const value = captured(match);
		if (value) out.push(value);
	}
	return out;
}

function collect(html: string, rx: RegExp): string[] {
	return collectRaw(html, rx).map(decodeEntities);
}

/**
 * Every reference-shaped string in a document, spelled as the document spells
 * it - which is what a rewriter has to match on to substitute one.
 */
export function rawReferences(html: string): string[] {
	return [
		...collectRaw(html, ATTR_REF),
		...collectRaw(html, ANCHOR),
		...inlineModuleImports(html),
	];
}

/**
 * Module specifiers imported by inline `<script type="module">` blocks.
 *
 * These are the shared chunks `app/ssr` deliberately does not inline. Miss them
 * and the static site's custom elements never hydrate.
 */
export function inlineModuleImports(html: string): string[] {
	const out: string[] = [];
	for (const block of html.matchAll(INLINE_MODULE)) {
		const body = block[1] ?? "";
		for (const spec of body.matchAll(SPECIFIER)) {
			if (spec[1]) out.push(spec[1]);
		}
	}
	return out;
}

/** Everything an HTML document points at, before any filtering. */
export function extractReferences(html: string): PageReferences {
	return {
		assets: [...collect(html, ATTR_REF), ...inlineModuleImports(html)],
		links: collect(html, ANCHOR),
	};
}

/**
 * Import specifiers in a JS module's own source - the whole file is already a
 * script body, so no `<script>` extraction step is needed first.
 *
 * A shared chunk can itself import a further chunk - `@bearmetal/jsx`'s
 * isomorphic runtime boundary picks between a client and server module at
 * request time, and that split lives inside an already-fetched chunk rather
 * than the page's inline script. Miss it and the grandchild chunk is never
 * written, and every page that pulls it in silently fails to hydrate.
 */
export function scriptImports(js: string): string[] {
	const out: string[] = [];
	for (const spec of js.matchAll(SPECIFIER)) {
		if (spec[1]) out.push(spec[1]);
	}
	return out;
}

/** The same-origin module specifiers a JS file imports, resolved against its own URL. */
export function discoverFromScript(js: string, scriptUrl: URL): URL[] {
	const seen = new Map<string, URL>();
	for (const spec of scriptImports(js)) {
		const url = resolveReference(spec, scriptUrl);
		if (url) seen.set(url.href, url);
	}
	return [...seen.values()];
}

/**
 * Resolve a specifier against the page that contained it.
 *
 * Relative specifiers resolve against the document's own URL - that is what the
 * browser will request, and therefore where the file has to land on disk, even
 * when the live server happens to serve it from somewhere else.
 *
 * @returns the absolute URL, or `null` when it points off-origin or is not a
 * URL at all (a bare specifier, `data:`, `mailto:`, a fragment).
 */
export function resolveReference(specifier: string, pageUrl: URL): URL | null {
	const trimmed = specifier.trim();
	if (!trimmed || trimmed.startsWith("#")) return null;
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) return null;

	let resolved: URL;
	try {
		resolved = new URL(trimmed, pageUrl);
	} catch {
		return null;
	}
	if (resolved.origin !== pageUrl.origin) return null;
	resolved.hash = "";
	return resolved;
}

/**
 * The same-origin URLs a page references, resolved and de-duplicated.
 *
 * `links` is empty unless link following is enabled, so a caller can queue
 * assets and pages under different rules.
 */
export function discoverFrom(
	html: string,
	pageUrl: URL,
	opts: { assets?: boolean; links?: boolean } = {},
): { assets: URL[]; links: URL[] } {
	const refs = extractReferences(html);
	const resolve = (specs: string[]) => {
		const seen = new Map<string, URL>();
		for (const spec of specs) {
			const url = resolveReference(spec, pageUrl);
			if (url) seen.set(url.href, url);
		}
		return [...seen.values()];
	};

	return {
		assets: opts.assets === false ? [] : resolve(refs.assets),
		links: opts.links === false ? [] : resolve(refs.links),
	};
}

/**
 * Where else a chunk might be served from.
 *
 * `@bearmetal/stack` serves shared chunks from a single-segment `/:script`
 * route, so a page nested any deeper than one level asks for a path the live
 * server does not answer. The file still belongs at the path the browser asked
 * for, so diecast retries at the root and writes the result where it was wanted.
 */
export function rootFallbackFor(url: URL): URL | null {
	const segments = url.pathname.split("/").filter(Boolean);
	if (segments.length < 2) return null;
	const fallback = new URL(url.href);
	fallback.pathname = `/${segments.at(-1)}`;
	return fallback;
}
