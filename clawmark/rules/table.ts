import type { AnyRule, Rule, Token } from "../types.ts";
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
	};

	const tableRowRule: Rule<RowData> = {
		id: "md:tablerow",
		trigger: "|",
		validate: () => false,
		tokenize: () => ({ tag: "md:tablerow", data: { columns: [] } }),
		tree: (token, ctx) => appendLeaf(ctx, "md:tablerow", (token as Token<RowData>).data),

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
