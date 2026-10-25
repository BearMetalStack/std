import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { readingMinutes } from "../site.ts";

/** A heading the reading chrome can list and jump to. */
export interface PageHeading {
	id: string;
	text: string;
	level: number;
}

/** What the chrome learns about a page by looking at its rendered body. */
export interface Measured {
	headings: PageHeading[];
	minutes: number;
	/** Glossary ids the body links, in first-use order. */
	terms: string[];
}

/** An empty measurement, for pages with no body. */
export const UNMEASURED: Measured = { headings: [], minutes: 0, terms: [] };

/**
 * Reads headings, reading time and glossary terms out of a rendered body. Works on the tree
 * itself rather than the source, so whatever produced the body — hand-written blocks now,
 * markdown later — the table of contents can't disagree with it.
 */
export function measure(body: JSX.Element): Measured {
	const headings = [...body.querySelectorAll("h2[id], .gb-steps h3[id]")].map((h) => ({
		id: h.id,
		text: h.getAttribute("data-text") ?? h.textContent ?? "",
		level: Number(h.tagName[1]),
	}));
	const terms = [
		...new Set(
			[...body.querySelectorAll("[data-term]")].map((t) => t.getAttribute("data-term")!),
		),
	];
	return { headings, minutes: readingMinutes(body.textContent ?? ""), terms };
}

/** The level-2 headings, or every heading when a page has none (a page that is only steps). */
export function outline(headings: PageHeading[]): PageHeading[] {
	const h2 = headings.filter((h) => h.level === 2);
	return h2.length ? h2 : headings;
}
