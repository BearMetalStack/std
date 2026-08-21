/**
 * @module
 * The build: enumerate, permute, render, write.
 *
 * The router is the renderer. Every page is produced by dispatching a synthetic
 * `Request` through `Router.handler`, exactly as a live server would, so a page
 * generated here is the page the app serves.
 */

import type { Router } from "@bearmetal/router";
import { ensureDir } from "@bearmetal/miscellanea/fs";
import { joinPath } from "@bearmetal/miscellanea";
import { classifyRoutes, routesOfClass } from "./classify.ts";
import {
	checkManifest,
	checkPermutation,
	fillPath,
	resolvePermutations,
	withQuery,
} from "./manifest.ts";
import {
	decodeEntities,
	discoverFrom,
	discoverFromScript,
	rawReferences,
	resolveReference,
	rootFallbackFor,
	scriptImports,
} from "./discover.ts";
import { hrefFor, isHtml, isScript, redirectShim, writeResponse } from "./write.ts";
import type {
	DiecastConfig,
	GeneratedPage,
	GenerationFailure,
	GenerationReport,
	ManifestProblem,
} from "./types.ts";

/** One URL queued for rendering. */
type Job = {
	url: URL;
	/** Explicit output path from a manifest permutation, when there was one. */
	out?: string;
	/** Assets are not scanned for links, and may fall back to the site root. */
	kind: "page" | "asset";
};

const DEFAULTS = {
	origin: "http://localhost",
	outputStyle: "index",
	concurrency: 8,
} as const;

/**
 * Generate a static site from a router.
 *
 * Dispatches through `router.handler` rather than the `handle` getter: `handle`
 * re-checks trusted-namespace warnings and re-awaits `ready()` on every call,
 * and neither needs doing per page.
 *
 * @example
 * ```ts
 * const report = await diecast(router, { outDir: "dist", manifest });
 * if (!report.ok) Deno.exit(1);
 * ```
 */
export async function diecast(
	router: Router,
	config: DiecastConfig,
): Promise<GenerationReport> {
	const started = performance.now();
	const origin = config.origin ?? DEFAULTS.origin;
	const outputStyle = config.outputStyle ?? DEFAULTS.outputStyle;
	const concurrency = Math.max(1, config.concurrency ?? DEFAULTS.concurrency);
	const discover = {
		assets: config.discover?.assets ?? true,
		links: config.discover?.links ?? true,
		directories: config.discover?.directories ?? true,
	};

	const pages: GeneratedPage[] = [];
	const failures: GenerationFailure[] = [];
	const remaps = new Map<string, string>();

	const thrown = new Map<string, unknown>();
	router.onError((error, ctx) => {
		thrown.set(ctx.url.pathname + ctx.url.search, error);
	});

	await router.ready();

	const classified = classifyRoutes(router);
	const problems = checkManifest(config.manifest, classified);

	const queue: Job[] = [];
	const seen = new Set<string>();
	const enqueue = (job: Job): void => {
		const key = job.url.pathname + job.url.search;
		if (seen.has(key)) return;
		seen.add(key);
		queue.push(job);
	};

	for (const route of routesOfClass(classified, "static")) {
		if (!config.manifest?.[route.path]) {
			enqueue({ url: new URL(route.path, origin), kind: "page" });
		}
	}

	const permuted = [
		...routesOfClass(classified, "needs-manifest"),
		...routesOfClass(classified, "static").filter((r) => config.manifest?.[r.path]),
	];

	for (const route of permuted) {
		const entry = config.manifest?.[route.path];
		if (!entry || entry.skip) continue;

		let permutations;
		try {
			permutations = await resolvePermutations(entry);
		} catch (error) {
			problems.push({
				kind: "uncovered-route",
				path: route.path,
				message: `resolving permutations for "${route.path}" threw: ${messageOf(error)}`,
			});
			continue;
		}

		for (const permutation of permutations) {
			const bad = checkPermutation(route.path, permutation);
			if (bad.length > 0) {
				problems.push(...bad);
				continue;
			}
			const pathname = fillPath(route.path, permutation.params as Record<string, unknown>);
			enqueue({
				url: new URL(withQuery(pathname, permutation.query), origin),
				out: permutation.out,
				kind: "page",
			});
		}
	}

	if (config.strict && problems.length > 0) {
		return report(pages, failures, problems, [], started);
	}

	await ensureDir(config.outDir);

	let cursor = 0;
	let aborted = false;

	const renderOne = async (job: Job): Promise<void> => {
		if (aborted) return;
		const key = job.url.pathname + job.url.search;
		thrown.delete(key);

		let res: Response;
		try {
			res = await router.handler(
				new Request(job.url, { method: "GET" }),
				{} as unknown as Deno.ServeHandlerInfo<Deno.Addr>,
			);
		} catch (error) {
			failures.push({ url: key, error, message: messageOf(error) });
			if (config.strict) aborted = true;
			return;
		}

		if (job.kind === "asset" && (!res.ok || isHtml(res.headers.get("content-type")))) {
			const fallback = rootFallbackFor(job.url);
			if (fallback) {
				const retry = await router.handler(
					new Request(fallback, { method: "GET" }),
					{} as unknown as Deno.ServeHandlerInfo<Deno.Addr>,
				);
				if (retry.ok && !isHtml(retry.headers.get("content-type"))) res = retry;
			}
			if (res.ok && isHtml(res.headers.get("content-type"))) {
				failures.push({
					url: key,
					status: res.status,
					message: "expected an asset but the route returned HTML - no such asset is served",
				});
				if (config.strict) aborted = true;
				return;
			}
		}

		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get("location");
			if (location) {
				const written = await writeResponse(
					new Response(redirectShim(location), {
						headers: { "Content-Type": "text/html; charset=utf-8" },
					}),
					job.url,
					{ outDir: config.outDir, outputStyle, out: job.out },
				);
				pages.push({
					url: key,
					file: written.file,
					status: res.status,
					contentType: "text/html",
					bytes: written.bytes,
				});
				return;
			}
		}

		if (!res.ok) {
			const error = thrown.get(key);
			failures.push({
				url: key,
				status: res.status,
				error,
				message: error ? `handler threw: ${messageOf(error)}` : `responded ${res.status}`,
			});
			if (config.strict) aborted = true;
			return;
		}

		const contentType = res.headers.get("content-type");
		const html = isHtml(contentType) ? await res.clone().text() : null;
		const script = html === null && job.kind === "asset" && discover.assets &&
				isScript(contentType)
			? await res.clone().text()
			: null;

		const written = await writeResponse(res, job.url, {
			outDir: config.outDir,
			outputStyle,
			out: job.out,
		});
		pages.push({
			url: key,
			file: written.file,
			status: res.status,
			contentType,
			bytes: written.bytes,
		});

		if (!job.out) {
			// A page's own path is expected to move - `/about` is served from
			// `about/index.html` and every host resolves that. A query is not:
			// the file is named for it, so the references have to be too.
			const rewritable = job.kind === "asset" || job.url.search !== "";
			const requested = job.url.pathname + job.url.search;
			const served = hrefFor(written.file);
			if (rewritable && served !== requested) remaps.set(requested, served);
		}

		if (html !== null && job.kind === "page") {
			const servedFrom = new URL(`/${written.file}`, origin);
			const found = discoverFrom(html, servedFrom, discover);
			for (const asset of found.assets) enqueue({ url: asset, kind: "asset" });
			for (const link of found.links) enqueue({ url: link, kind: "page" });
		}

		if (script !== null) {
			for (const asset of discoverFromScript(script, job.url)) {
				enqueue({ url: asset, kind: "asset" });
			}
		}
	};

	while (cursor < queue.length && !aborted) {
		const batch = queue.slice(cursor, cursor + concurrency);
		cursor += batch.length;
		await Promise.all(batch.map(renderOne));
	}

	if (remaps.size > 0) await applyRemaps(config.outDir, pages, remaps, origin);

	const copiedDirs = discover.directories ? await copyStaticDirs(router, config) : [];

	return report(pages, failures, problems, copiedDirs, started);
}

/**
 * Patch every written HTML or script file so a reference points at the file
 * that was actually written for it - the extension an extensionless asset
 * gained, or the digested name a query-carrying URL landed under.
 *
 * Runs once, after the whole site is known, because a page is written before
 * the assets it references have been fetched - there is no way to know at
 * write time whether one of them will need remapping.
 *
 * References are matched by resolving them, not by looking for the remapped
 * path as text: `badge.svg?x=1` in a page under `/md/` names the same file as
 * `/md/badge.svg?x=1`, and in real markup its `&` is written `&amp;`.
 */
async function applyRemaps(
	outDir: string,
	pages: GeneratedPage[],
	remaps: Map<string, string>,
	origin: string,
): Promise<void> {
	for (const page of pages) {
		const html = isHtml(page.contentType);
		if (!html && !isScript(page.contentType)) continue;
		const target = joinPath(outDir, page.file);
		let text: string;
		try {
			text = await Deno.readTextFile(target);
		} catch {
			continue;
		}
		const patched = rewriteReferences(
			text,
			new URL(`/${page.file}`, origin),
			remaps,
			html,
		);
		if (patched !== text) await Deno.writeTextFile(target, patched);
	}
}

/** Substitute every reference in one file that names a remapped URL. */
function rewriteReferences(
	text: string,
	pageUrl: URL,
	remaps: Map<string, string>,
	html: boolean,
): string {
	let out = text;
	for (const raw of new Set(html ? rawReferences(text) : scriptImports(text))) {
		const url = resolveReference(html ? decodeEntities(raw) : raw, pageUrl);
		if (!url) continue;
		const to = remaps.get(url.pathname + url.search);
		if (to && to !== raw) out = replaceReference(out, raw, to);
	}
	return out;
}

/**
 * Replace a reference where it is used as one - quoted, or as an unquoted
 * attribute value - rather than everywhere the same characters happen to
 * appear in the document.
 */
function replaceReference(text: string, from: string, to: string): string {
	const pattern = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	// Function replacements throughout: a written path may contain a `$`, which
	// a string replacement would read as a capture reference.
	return text
		.replace(new RegExp(`"${pattern}"`, "g"), () => `"${to}"`)
		.replace(new RegExp(`'${pattern}'`, "g"), () => `'${to}'`)
		.replace(new RegExp(`=${pattern}(?=[\\s>])`, "g"), () => `=${to}`);
}

/** Copy every directory the router serves from disk into the output. */
async function copyStaticDirs(
	router: Router,
	config: DiecastConfig,
): Promise<string[]> {
	const mounts = [
		...router.staticMounts,
		...(config.staticDirs ?? []).map((d) => ({
			dir: d.dir instanceof URL ? d.dir : new URL(`file://${d.dir}/`),
			root: d.root,
		})),
	];

	const copied: string[] = [];
	for (const mount of mounts) {
		const target = joinPath(config.outDir, mount.root.replace(/^\/+/, ""));
		try {
			await ensureDir(target);
			await copyTree(mount.dir, target);
			copied.push(mount.root);
		} catch {
			// A mount pointing at a directory that is not there is the app's
			// problem to report, not a reason to fail the build.
		}
	}
	return copied;
}

async function copyTree(from: URL, to: string): Promise<void> {
	for await (const entry of Deno.readDir(from)) {
		const source = new URL(entry.name + (entry.isDirectory ? "/" : ""), from);
		const target = joinPath(to, entry.name);
		if (entry.isDirectory) {
			await ensureDir(target);
			await copyTree(source, target);
		} else if (entry.isFile) {
			await Deno.copyFile(source, target);
		}
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function report(
	pages: GeneratedPage[],
	failures: GenerationFailure[],
	problems: ManifestProblem[],
	copiedDirs: string[],
	started: number,
): GenerationReport {
	return {
		pages,
		failures,
		problems,
		copiedDirs,
		duration: performance.now() - started,
		get ok(): boolean {
			return failures.length === 0 && problems.length === 0;
		},
	};
}
