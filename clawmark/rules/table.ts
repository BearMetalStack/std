import type { AnyRule, Node, Rule, SerializeContext, Token } from "../types.ts";
import type { XmlElement } from "../xml/types.ts";
import {
	appendLeaf,
	closeNode,
	escapeHtml,
	flattenInline,
	inlineOnly,
	openNode,
	parseInline,
} from "./helpers.ts";

type TableData = { columns: number; phase: "open" | "close" };
/** `columns` is a flattened compatibility fallback for consumers (the
 * docx/odt/text write profiles) that only ever read flat per-cell text and
 * were never taught to walk real children - see `md:tablecell` for the real
 * content. Populated from the cells for a row parsed here; a row built by a
 * reverse profile that never learned to recurse (docx/odt) still carries only
 * this field, with no `md:tablecell` children at all. */
type RowData = { columns: string[] };
type CellData = { index: number };
type FormatData = { columns: ("l" | "c" | "r")[] };

/** `tokenize`'s only channel back to `tree()` is `Token.data`, so a cell's
 * parsed children ride along next to its public `CellData` until `tree()`
 * splits them back out onto the node proper - same trick as `md:link`. */
type CellToken = CellData & { children: Node[] };

/**
 * Table rendering needs to know "is this the first row" (head) and the
 * column-alignment row that may follow it, mirroring v1's module-level
 * `tableContext` mutable during `markdownToHtml`'s traversal
 * (webbies/lib/md/html.ts). That has to be per-parse state, not shared
 * across parses, so - like the list rules - this is a factory rather than
 * a plain object, instantiated fresh each time `defaultRules()` runs.
 */

const DELIMITER: Record<"l" | "c" | "r", string> = { l: ":-", c: ":-:", r: "-:" };

const ALIGN_STYLE: Record<"l" | "c" | "r", string> = {
	l: "text-align:left",
	c: "text-align:center",
	r: "text-align:right",
};

/**
 * The table owns its whole layout because the delimiter row is not a sibling
 * that can be emitted in place: it must sit between the head row and the body,
 * and it must exist even when the tree carries no md:tableformat node, since
 * without it markdown does not see a table at all.
 */
function serializeTable(node: Node, ctx: SerializeContext): string {
	const rows = node.children.filter((c) => c.tag === "md:tablerow");
	const format = node.children.find((c) => c.tag === "md:tableformat");
	if (rows.length === 0) return "";

	const columns = Math.max(...rows.map((r) => (r.data as RowData).columns.length));
	const align = ((format?.data as FormatData | undefined)?.columns ?? [])
		.slice(0, columns);
	while (align.length < columns) align.push("l");

	const cellsOf = (row: Node) => row.children.filter((c) => c.tag === "md:tablecell");

	/**
	 * A real `md:tablecell` child (every row this package's own parser
	 * builds) is re-serialized through the normal recursion, so a link or
	 * image inside it comes back out as real markdown syntax instead of the
	 * escaped literal text `escapeHtml(cell)` used to produce. A leaf row
	 * with no such children (docx/odt) falls back to its flat `data.columns`
	 * string, which - unlike a real child - was never escaped by anything
	 * yet and so still needs the full inline pass.
	 */
	const cellText = (row: Node, index: number): string => {
		const cells = cellsOf(row);
		if (cells.length > 0) {
			const text = cells[index] ? ctx.children(cells[index]) : "";
			return text.replace(/\n/g, " ").replaceAll("|", "\\|");
		}
		const raw = (row.data as RowData).columns[index] ?? "";
		return ctx.escape(raw.replace(/\n/g, " "), "cell");
	};

	const line = (row: Node) => {
		const cells = Array.from({ length: columns }, (_, i) => cellText(row, i));
		if (cells.some((c) => c.includes("|"))) {
			ctx.warn("`|` inside a table cell will not survive a re-parse", node);
		}
		return `|${cells.join("|")}|`;
	};

	const [head, ...body] = rows;
	return [
		line(head),
		`|${align.map((a) => DELIMITER[a]).join("|")}|`,
		...body.map((r) => line(r)),
	].join("\n");
}

/** Reads a cell's alignment from its inline style or legacy `align` attribute. */
function alignOf(cell: XmlElement): "l" | "c" | "r" {
	const raw = `${cell.attrs.get("style") ?? ""} ${cell.attrs.get("align") ?? ""}`;
	if (/center/i.test(raw)) return "c";
	if (/right/i.test(raw)) return "r";
	return "l";
}

export function createTableRules(): AnyRule[] {
	let renderState: { head: boolean; columnAlign?: ("l" | "c" | "r")[] } | null = null;

	const tableRule: Rule<TableData> = {
		id: "md:table",
		trigger: "|",
		validate: (ctx) => ctx.cursor === ctx.lineStart,

		tokenize(ctx) {
			const cLine = ctx.currentLine;
			const cells = cLine.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
			const tokens: Token[] = [];

			if (ctx.currentBlock !== "md:table") {
				ctx.pushBlock("md:table");
				tokens.push({ tag: "md:table", data: { columns: cells.length, phase: "open" } });
			}

			if (/^[-:]/.test(cells[0])) {
				tokens.push({
					tag: "md:tableformat",
					data: {
						columns: cells.map((c): "l" | "c" | "r" => {
							if (/^:-*:$/.test(c)) return "c";
							if (/^-+:$/.test(c)) return "r";
							return "l";
						}),
					},
				});
			} else {
				// A table cell is single-line by construction (it came from
				// splitting one line on `|`), so only inline constructs are ever
				// legal inside it - a link, an image, emphasis, code, but never a
				// heading or a nested table.
				const cellRules = inlineOnly(ctx.rules);
				tokens.push({ tag: "md:tablerow", data: { phase: "open" } });
				cells.forEach((text, index) => {
					const children = parseInline(text, cellRules);
					tokens.push({ tag: "md:tablecell", data: { index, children } });
				});
				tokens.push({ tag: "md:tablerow", data: { phase: "close" } });
			}

			ctx.cursor += cLine.length - 1;
			return tokens as Token<TableData>[];
		},

		tree(token, ctx) {
			if (token.data.phase === "open") {
				renderState = { head: true };
				openNode(ctx, "md:table", token.data);
			} else {
				closeNode(ctx);
			}
		},

		renderOpen: () => "<table>",
		renderClose: () => "</table>",

		matchTag: "table",
		/**
		 * The whole table is claimed at once rather than rule-per-element,
		 * because the delimiter row has no HTML counterpart: it has to be
		 * synthesized between the head row and the body, and markdown does not
		 * see a table at all without it.
		 *
		 * Alignment comes from the *first body row*, not the header. This
		 * rule's own renderOpen forces `text-align:center` on every `<th>`
		 * regardless of the real alignment, so head cells carry no signal - a
		 * header-only table cannot recover its alignment at all.
		 */
		match(el, ctx) {
			const rows = ctx.findAll("tr", el);
			if (rows.length === 0) return null;

			const cellsOf = (row: XmlElement) =>
				row.children.filter(
					(c): c is XmlElement => c.kind === "element" && (c.name === "td" || c.name === "th"),
				);

			const nodes: Node[] = rows.map((row) => {
				const cellEls = cellsOf(row);
				const rowNode: Node = {
					tag: "md:tablerow",
					data: { columns: cellEls.map((cell) => ctx.text(cell)) },
					children: [],
				};
				cellEls.forEach((cellEl, index) => {
					const cellNode: Node = {
						tag: "md:tablecell",
						data: { index },
						children: [],
						parent: rowNode,
					};
					ctx.crawlChildren(cellNode, cellEl);
					rowNode.children.push(cellNode);
				});
				return rowNode;
			});

			const bodyRow = rows.find((row) => cellsOf(row).some((c) => c.name === "td"));
			const align = (bodyRow ? cellsOf(bodyRow) : []).map((cell) => alignOf(cell));

			if (align.length > 0) {
				nodes.splice(1, 0, {
					tag: "md:tableformat",
					data: { columns: align },
					children: [],
				});
			}

			return {
				kind: "nodes",
				nodes: [{
					tag: "md:table",
					data: { columns: align.length, phase: "open" },
					children: nodes,
				}],
			};
		},

		serializeKind: "block",
		serialize: (node, ctx) => serializeTable(node, ctx),
	};

	const tableRowRule: Rule<RowData> = {
		id: "md:tablerow",
		trigger: "|",
		validate: () => false,
		tokenize: () => ({ tag: "md:tablerow", data: { columns: [] } }),

		tree(token, ctx) {
			const phase = (token.data as unknown as { phase: "open" | "close" }).phase;
			if (phase === "open") {
				openNode(ctx, "md:tablerow", { columns: [] });
			} else {
				const row = ctx.currentNode;
				(row.data as RowData).columns = row.children.map((cell) => flattenInline(cell.children));
				closeNode(ctx);
			}
		},

		serializeKind: "block",
		// Emitted by the table, which owns row ordering and the delimiter row.
		serialize: () => "",

		renderOpen(node) {
			const state = renderState ?? { head: false };
			const open = state.head ? "<thead><tr>" : "<tr>";
			const cells = node.children.filter((c) => c.tag === "md:tablecell");
			if (cells.length > 0) return open;
			// A row built by a reverse profile that never learned to recurse
			// (docx/odt) is still a leaf carrying only `data.columns` - there are
			// no md:tablecell children for the renderer to visit, so render them
			// here directly, same as before this rule gained real children.
			const cellTag = state.head ? "th" : "td";
			const legacy = node.data.columns.map((cell, i) => {
				const align = state.head ? "c" : (state.columnAlign?.[i] ?? "l");
				return `<${cellTag} style="${ALIGN_STYLE[align]}">${escapeHtml(cell)}</${cellTag}>`;
			}).join("");
			return `${open}${legacy}`;
		},
		renderClose(_node) {
			const state = renderState ?? { head: false };
			return state.head ? "</tr></thead>" : "</tr>";
		},
	};

	const tableCellRule: Rule<CellData> = {
		id: "md:tablecell",
		trigger: "|",
		validate: () => false,
		tokenize: () => ({ tag: "md:tablecell", data: { index: 0 } }),

		tree(token, ctx) {
			const { children, ...data } = token.data as unknown as CellToken;
			const node: Node<CellData> = { tag: "md:tablecell", data, children, parent: ctx.currentNode };
			for (const child of children) child.parent = node;
			ctx.currentNode.children.push(node as Node);
		},

		renderOpen(node) {
			const state = renderState ?? { head: false };
			const cellTag = state.head ? "th" : "td";
			const align = state.head ? "c" : (state.columnAlign?.[node.data.index] ?? "l");
			return `<${cellTag} style="${ALIGN_STYLE[align]}">`;
		},
		renderClose() {
			const state = renderState ?? { head: false };
			return state.head ? "</th>" : "</td>";
		},
	};

	const tableFormatRule: Rule<FormatData> = {
		id: "md:tableformat",
		trigger: "|",
		validate: () => false,
		tokenize: () => ({ tag: "md:tableformat", data: { columns: [] } }),
		tree: (token, ctx) => appendLeaf(ctx, "md:tableformat", (token as Token<FormatData>).data),

		serializeKind: "block",
		serialize: () => "",

		renderOpen(node) {
			if (renderState) {
				renderState.columnAlign = node.data.columns;
				renderState.head = false;
			}
			return "";
		},
	};

	return [tableRule, tableRowRule, tableCellRule, tableFormatRule];
}
