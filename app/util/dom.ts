/**
 * Whether `el` is a custom element, going by name alone.
 *
 * A hyphen in the local name is what makes an element custom — the same test
 * the browser applies to decide whether a tag can even be registered. This
 * does not check `instanceof BMElement`: callers of this (`hydration.ts`'s
 * path-building, `ssr/mod.ts`'s `usedTags()`) need to run against markup that
 * may not yet have upgraded to a live class instance, where the tag name is
 * all there is to go on.
 */
export function isComponentElement(el: Element): boolean {
	return el.localName.includes("-");
}
