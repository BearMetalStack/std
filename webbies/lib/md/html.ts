import { MarkdownLexer } from "./lexer.ts";
import { MarkdownTreeBuilder, Node } from "./tree.ts";

const blockTypes = new Set([
	"heading",
	"blockquote",
	"orderedlist",
	"unorderedlist",
	"table",
	"footnotedef",
	"codeblock",
	"hr",
]);

export async function markdownToHtml(md: string) {
	const lexer = new MarkdownLexer(md);
	const treeBuilder = new MarkdownTreeBuilder();
	const _root = await treeBuilder.build(lexer.tokenIter());

	let html = "";

	treeBuilder.traverse(
		(n) => {
			if (n.type === "link") {
				html += `<a href="${n.href}"${
					n.title ? ` title="${n.title}"` : ""
				}>${n.text}</a>`;
				return false;
			}
			if (n.type === "image") {
				html += `<img src="${n.src}"${n.alt ? ` alt="${n.alt}"` : ""}${
					n.title ? ` title="${n.title}"` : ""
				}>`;
				return false;
			}
			if (n.type === "text") {
				html += n.value;
				return false;
			}
			// normal open tags
			html += openTag(n);
		},
		(n) => {
			html += closeTag(n);
		},
	);

	return html;
}

let tableContext: {
	head: boolean;
	columnAlign?: ("l" | "c" | "r")[];
} | null = null;
function reTable() {
	tableContext = {
		head: true,
	};
}

function openTag(n: Node): string {
	switch (n.type) {
		case "root":
			break;
		case "paragraph":
			if (n.children.length === 1 && blockTypes.has(n.children[0].type)) {
				return "";
			}
			return "<p>";
		case "heading":
			return `<h${n.level}>`;
		case "blockquote":
			return "<blockquote>";
		case "orderedlist":
			return "<ol>";
		case "unorderedlist":
			return `<ul${n.style === "none" ? ' class="none"' : ""}>`;
		case "table":
			reTable();
			return "<table>";
		case "footnotedef":
			return `<aside id="${n.id}"><a href="#fnref-${n.id}">↩</a> `;
		case "tablerow": {
			let row = "";
			let datumTag = "td";
			const styles = n.columns.map((_, i) => {
				switch (tableContext?.columnAlign?.[i] ?? "l") {
					case "c":
						return "text-align:center";
					case "l":
						return "text-align:left";
					case "r":
						return "text-align:right";
				}
			});
			if (tableContext?.head) {
				row += "<thead>";
				datumTag = "th";
				styles.fill("text-align:center");
			}
			row += `<tr>${
				n.columns.map((e, i) =>
					`<${datumTag} style="${styles[i]}">${e}</${datumTag}>`
				).join("")
			}</tr>`;
			if (tableContext?.head) {
				row += "</thead>";
			}
			return row;
		}
		case "tableformat":
			if (!tableContext) throw "uh..... what?";
			tableContext.columnAlign = n.columns;
			tableContext.head = false;
			break;
		case "listitem":
			return `<li${n.style ? ' class="none"' : ""}>`;
		case "checkitem":
			return `<li><input type="checkbox" disabled${
				n.checked ? " checked" : ""
			}>`;
		case "lineitem":
			return "<p>";
		case "bold":
			return "<strong>";
		case "italic":
			return "<em>";
		case "bolditalic":
			return "<strong><em>";
		case "strikethrough":
			return "<s>";
		case "highlight":
			return `<span class="highlight">`;
		case "code":
			return `<code>`;
		case "codeblock":
			return `<pre class="code">`;
		case "footnote":
			return `<sup><a href="#fn-${n.id}" id="fnref-${n.id}">${n.id}</a></sup>`;
		case "hr":
			return "<hr>";
		case "linebreak":
			return "<br>";
	}
	return "";
}

function closeTag(n: Node) {
	switch (n.type) {
		case "root":
			break;
		case "paragraph":
			if (n.children.length === 1 && blockTypes.has(n.children[0].type)) {
				return "";
			}
			return "</p>";
		case "heading":
			return `</h${n.level}>`;
		case "blockquote":
			return "</blockquote>";
		case "orderedlist":
			return "</ol>";
		case "unorderedlist":
			return `</ul>`;
		case "table":
			return "</table>";
		case "footnotedef":
			return "</aside>";

		case "listitem":
		case "checkitem":
			return `</li>`;
		case "lineitem":
			return "</p>";
		case "bold":
			return "</strong>";
		case "italic":
			return "</em>";
		case "bolditalic":
			return "</em></strong>";
		case "strikethrough":
			return "</s>";
		case "highlight":
		case "code":
			return `</code>`;
		case "codeblock":
			return `</pre>`;
	}
	return "";
}
