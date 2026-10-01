/**
 * @module
 * Zero-dependency TrueType parsing and text layout. Glyphs come out as vector paths.
 */

export { Font, loadFont, parseFont } from "./ttf.ts";
export {
	type LayoutOptions,
	layoutText,
	measureText,
	type PlacedGlyph,
	type TextLayout,
	type TextLine,
	textPath,
} from "./layout.ts";
