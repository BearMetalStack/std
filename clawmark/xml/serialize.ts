import type { XmlNode } from "./types.ts";
import { DOCUMENT_NAME } from "./types.ts";
import { BOOLEAN_ATTRS, VOID } from "./html_tables.ts";

/**
 * Re-serializes an `XmlNode` tree back to markup. Needed by the crawler's
 * `raw` unmatched-policy, and worth its weight again in readable test-failure
 * messages.
 */
export function serializeXml(node: XmlNode, mode: "xml" | "html" = "xml"): string {
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
				.map(([k, v]) =>
					// `<input disabled>`, not `<input disabled="">`. Only in html
					// mode, and only for attributes where the two really are the
					// same thing - XML has no bare-attribute form at all.
					mode === "html" && v === "" && BOOLEAN_ATTRS.has(k) ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`
				)
				.join("");
			const isVoid = mode === "html" && VOID.has(node.name);
			if (isVoid) return `<${node.qname}${attrs}>`;
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
