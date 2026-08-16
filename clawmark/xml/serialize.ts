import type { SerializeMode, XmlNode } from "./types.ts";
import { DOCUMENT_NAME } from "./types.ts";
import { BOOLEAN_ATTRS, VOID } from "./html_tables.ts";

/**
 * Re-serializes an `XmlNode` tree back to markup. Needed by the crawler's
 * `raw` unmatched-policy, and worth its weight again in readable test-failure
 * messages.
 */
export function serializeXml(node: XmlNode, mode: SerializeMode = "xml"): string {
	switch (node.kind) {
		case "text":
			return escapeText(node.value);
		case "cdata":
			return `<![CDATA[${node.value}]]>`;
		case "comment":
			return `<!--${node.value}-->`;
		case "pi":
			return `<?${node.target}${node.value ? " " + node.value : ""}?>`;
		case "doctype":
			return `<!${node.value}>`;
		case "element": {
			if (node.name === DOCUMENT_NAME) {
				return node.children.map((c) => serializeXml(c, mode)).join("");
			}
			const attrs = [...node.attrs]
				.map(([k, v]) => {
					if (v === "" && BOOLEAN_ATTRS.has(k)) {
						// `<input disabled>` in html - XML has no bare-attribute form.
						if (mode === "html") return ` ${k}`;
						// `<input disabled="disabled">` in xhtml - the canonical
						// minimized form, not the `disabled=""` xml mode falls back to.
						if (mode === "xhtml") return ` ${k}="${k}"`;
					}
					return ` ${k}="${escapeAttr(v)}"`;
				})
				.join("");
			const isVoid = (mode === "html" || mode === "xhtml") && VOID.has(node.name);
			if (isVoid) return mode === "xhtml" ? `<${node.qname}${attrs}/>` : `<${node.qname}${attrs}>`;
			if (node.children.length === 0 && node.selfClosing) {
				return mode === "html"
					? `<${node.qname}${attrs}></${node.qname}>`
					: `<${node.qname}${attrs}/>`;
			}
			const inner = node.children.map((c) => serializeXml(c, mode)).join("");
			return `<${node.qname}${attrs}>${inner}</${node.qname}>`;
		}
	}
}

function escapeText(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttr(value: string): string {
	return escapeText(value).replaceAll('"', "&quot;");
}
