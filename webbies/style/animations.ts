import { compliantCSS } from "@bearmetal/drip";

/**
 * Drip's shared keyframes as a constructed sheet, adopted by the document and
 * by any shadow root that animates with them (keyframes don't cross the shadow
 * boundary). `null` outside a browser.
 */
export const animationSheet: CSSStyleSheet = ((): CSSStyleSheet => {
	if (typeof document === "undefined") return null!;
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(compliantCSS("animations"));
	document.adoptedStyleSheets = [sheet, ...document.adoptedStyleSheets];
	return sheet;
})();
