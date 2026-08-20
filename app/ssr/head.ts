/**
 * What every rendered page's `<head>` gets, and who puts it there.
 *
 * `Page()` renders a view; it does not know how that app delivers its client
 * bundle, and deliberately no longer works it out per page. Whoever *does* know
 * — `@bearmetal/stack`'s components module, a theme package, an analytics
 * snippet — registers a contributor here, and every page picks it up.
 *
 * @module
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";

/**
 * Builds tags to append to a page's `<head>`.
 *
 * Runs once per render, after the tree has settled, so it must be synchronous
 * and must not depend on a render scope: static tags, built fresh each time.
 * Returning the *same* node twice would move it between documents, so build new
 * ones rather than caching the elements themselves.
 */
export type HeadContributor = () => JSX.Element | Iterable<JSX.Element> | null | undefined;

const contributors = new Set<HeadContributor>();

/**
 * Registers `contributor` to run for every page rendered from here on.
 *
 * @returns a function that removes it again.
 *
 * @example
 * ```tsx
 * contributeHead(() => [
 *   <link rel="stylesheet" href="/@bearmetal/components/index.css" />,
 *   <script type="module" src="/@bearmetal/components/index" />,
 * ]);
 * ```
 */
export function contributeHead(contributor: HeadContributor): () => void {
	contributors.add(contributor);
	return () => {
		contributors.delete(contributor);
	};
}

/** Whether anything at all is contributing to `<head>`. */
export function hasHeadContributors(): boolean {
	return contributors.size > 0;
}

/** Every registered contributor's tags, in registration order. */
export function headContributions(): JSX.Element[] {
	const nodes: JSX.Element[] = [];
	for (const contributor of contributors) {
		let produced: ReturnType<HeadContributor>;
		try {
			produced = contributor();
		} catch (error) {
			// A broken contributor is a missing script tag, not a lost response.
			console.error("A <head> contributor threw and was skipped:", error);
			continue;
		}
		if (produced == null) continue;
		if (Symbol.iterator in produced) nodes.push(...produced);
		else nodes.push(produced);
	}
	return nodes;
}
