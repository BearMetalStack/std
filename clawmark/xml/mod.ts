/**
 * @module
 * A portable, zero-dependency XML/HTML parser, serializer, and builder.
 *
 * One tokenizer serves both grammars via a mode flag - the HTML quirks (void
 * elements, raw-text elements, implicit close, case folding, unquoted
 * attributes) are additive lookup tables in html_tables.ts, not a different
 * parse strategy. No DOMParser, no `Deno.*`, no `globalThis`: this runs the
 * same in Deno, a browser, and a worker.
 */

export * from "./types.ts";
export { parseHtml, parseXml, XmlParser } from "./parser.ts";
export { decodeEntities, namedEntities } from "./entities.ts";
export { fromDom } from "./dom.ts";
export { serializeXml } from "./serialize.ts";
export { append, cdata, comment, declareNamespaces, el, txt, XML_DECL } from "./build.ts";
export { AUTO_CLOSE, ESCAPABLE_RAW, PRE_ELEMENTS, RAW_TEXT, VOID } from "./html_tables.ts";
