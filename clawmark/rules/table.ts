import type { AnyRule, Node, Rule, SerializeContext, Token } from "../types.ts";
import type { XmlElement } from "../xml/types.ts";
import { appendLeaf, closeNode, escapeHtml, openNode } from "./helpers.ts";

type TableData = { columns: number; phase: "open" | "close" };
type RowData = { columns: string[] };
type FormatData = { columns: ("l" | "c" | "r")[] };

/**
 * Table rendering needs to know "is this the first row" (head) and the
 * column-alignment row that may follow it, mirroring v1's module-level
 * `tableContext` mutable during `markdownToHtml`'s traversal
 * (webbies/lib/md/html.ts). That has to be per-parse state, not shared
 * across parses, so - like the list rules - this is a factory rather than
 * a plain object, instantiated fresh each time `defaultRules()` runs.
 */

const DELIMITER: Record<"l" | "c" | "r", string> = { l: ":-", c: ":-:", r: "-:" };

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

	const line = (cells: string[]) => {
		const padded = [...cells];
		while (padded.length < columns) padded.push("");
		// tableRule.tokenize splits on a bare `|` with no escape awareness, so a
		// pipe inside a cell cannot survive a re-lex. Emit the escape anyway -
		// it is correct markdown and degrades gracefully elsewhere - and warn.
		return `|${padded.map((c) => ctx.escape(c.replace(/\n/g, " "), "cell")).join("|")}|`;
	};

	if (rows.some((r) => (r.data as RowData).columns.some((c) => c.includes("|")))) {
		ctx.warn("`|` inside a table cell will not survive a re-parse", node);
	}

	const [head, ...body] = rows;
	return [
		line((head.data as RowData).columns),
		`|${align.map((a) => DELIMITER[a]).join("|")}|`,
		...body.map((r) => line((r.data as RowData).columns)),
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
				tokens.push({ tag: "md:tablerow", data: { columns: cells } });
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

			const nodes: Node[] = rows.map((row) => ({
				tag: "md:tablerow",
				data: { columns: cellsOf(row).map((cell) => ctx.text(cell)) },
				children: [],
			}));

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
		tree: (token, ctx) => appendLeaf(ctx, "md:tablerow", (token as Token<RowData>).data),

		serializeKind: "block",
		// Emitted by the table, which owns row ordering and the delimiter row.
		serialize: () => "",

		renderOpen(node) {
			const state = renderState ?? { head: false };
			const cellTag = state.head ? "th" : "td";
			// The header row renders before the alignment row (if any) has
			// been seen, so its alignment isn't known yet - v1
			// (webbies/lib/md/html.ts) sidesteps that by always centering the
			// head row instead of leaving it unstyled.
			const cells = node.data.columns.map((cell, i) => {
				const align = state.head ? "c" : (state.columnAlign?.[i] ?? "l");
				const style = align === "c"
					? "text-align:center"
					: align === "r"
					? "text-align:right"
					: "text-align:left";
				return `<${cellTag} style="${style}">${escapeHtml(cell)}</${cellTag}>`;
			}).join("");
			const row = `<tr>${cells}</tr>`;
			return state.head ? `<thead>${row}</thead>` : row;
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

	return [tableRule, tableRowRule, tableFormatRule];
}
