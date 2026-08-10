/**
 * Aligned columns.
 *
 * Every CLI in the stack ends up writing this, and every hand-rolled version gets the same thing
 * wrong: it pads with `String.prototype.padEnd`, which counts escape bytes and wide characters as
 * one column each, so a table with any colour or any CJK in it comes out ragged. This measures
 * with {@linkcode displayWidth} throughout.
 * @module
 */

import { colorize, type ColorName, displayWidth, truncateToWidth } from "./style.ts";

/** How a column's contents sit within its width. */
export type ColumnAlign = "left" | "right" | "center";

/** One column's presentation. */
export interface ColumnSpec {
	/** Heading text. Omit for an unlabelled column. */
	header?: string;
	align?: ColumnAlign;
	/** Hard cap; contents wider than this are truncated with an ellipsis. */
	maxWidth?: number;
	/** Never shrink below this, even when the table is squeezed to fit. */
	minWidth?: number;
	/** Colour applied to every cell in the column (not the header). */
	color?: ColorName;
}

/** Options for {@linkcode table}. */
export interface TableOptions {
	/** Per-column presentation, positionally. A bare string is shorthand for `{ header }`. */
	columns?: (ColumnSpec | string)[];
	/** Column headers, when you want nothing else per-column. */
	headers?: string[];
	/**
	 * Total width to fit within. Columns are squeezed proportionally when the natural widths
	 * exceed it. Defaults to the terminal width; pass `Infinity` to never squeeze.
	 */
	width?: number;
	/** Gap between columns. Default 2. */
	gap?: number;
	/** Line drawn under the header row. Default `"─"`; pass `""` for none. */
	rule?: string;
	/** Colour for the header row. Default `"gray"`. */
	headerColor?: ColorName | null;
	/** Left margin, in spaces. Default 0. */
	indent?: number;
}

const DEFAULT_WIDTH = 80;

function terminalWidth(): number {
	try {
		return Deno.consoleSize().columns;
	} catch {
		return DEFAULT_WIDTH;
	}
}

function pad(cell: string, width: number, align: ColumnAlign): string {
	const slack = Math.max(0, width - displayWidth(cell));
	if (slack === 0) return cell;
	if (align === "right") return " ".repeat(slack) + cell;
	if (align === "center") {
		const left = Math.floor(slack / 2);
		return " ".repeat(left) + cell + " ".repeat(slack - left);
	}
	return cell + " ".repeat(slack);
}

function normalizeColumns(opts: TableOptions, count: number): ColumnSpec[] {
	const specs: ColumnSpec[] = [];
	for (let i = 0; i < count; i++) {
		const raw = opts.columns?.[i];
		const spec: ColumnSpec = typeof raw === "string" ? { header: raw } : { ...raw };
		if (spec.header === undefined && opts.headers?.[i] !== undefined) spec.header = opts.headers[i];
		specs.push(spec);
	}
	return specs;
}

/**
 * Natural widths, squeezed proportionally when they do not fit.
 *
 * The widest columns give up the most, and nothing shrinks past its `minWidth` or past the room
 * an ellipsis needs — a table squeezed to nothing is less useful than one that overflows a little.
 */
function resolveWidths(
	rows: string[][],
	specs: ColumnSpec[],
	budget: number,
	gap: number,
): number[] {
	const natural = specs.map((spec, i) => {
		const cells = rows.map((row) => displayWidth(row[i] ?? ""));
		const header = spec.header ? displayWidth(spec.header) : 0;
		const widest = Math.max(header, ...cells, 0);
		return spec.maxWidth ? Math.min(widest, spec.maxWidth) : widest;
	});

	const gaps = gap * Math.max(0, specs.length - 1);
	let total = natural.reduce((sum, width) => sum + width, 0) + gaps;
	if (total <= budget) return natural;

	const floors = specs.map((spec) => Math.max(spec.minWidth ?? 0, 3));
	const widths = [...natural];
	// Take from the widest column each pass, so one runaway column is trimmed before the rest.
	while (total > budget) {
		let widest = -1;
		for (let i = 0; i < widths.length; i++) {
			if (widths[i] <= floors[i]) continue;
			if (widest === -1 || widths[i] > widths[widest]) widest = i;
		}
		if (widest === -1) break;
		widths[widest]--;
		total--;
	}
	return widths;
}

/**
 * Renders `rows` as aligned columns.
 *
 * ```ts
 * console.log(table(
 * 	[["chapter", "Manage chapters"], ["build", "Build the book"]],
 * 	{ headers: ["command", "summary"] },
 * ));
 * ```
 *
 * Cells may contain ANSI styling; widths are measured on what the terminal actually shows.
 */
export function table(rows: string[][], opts: TableOptions = {}): string {
	const count = Math.max(
		opts.columns?.length ?? 0,
		opts.headers?.length ?? 0,
		...rows.map((row) => row.length),
		0,
	);
	if (count === 0) return "";

	const specs = normalizeColumns(opts, count);
	const gap = opts.gap ?? 2;
	const indent = opts.indent ?? 0;
	const budget = Math.max(1, (opts.width ?? terminalWidth()) - indent);
	const widths = resolveWidths(rows, specs, budget, gap);

	const margin = " ".repeat(indent);
	const separator = " ".repeat(gap);
	const lines: string[] = [];

	const emit = (cells: string[], color?: ColorName | null) => {
		const rendered = cells.map((cell, i) => {
			const fitted = truncateToWidth(cell ?? "", widths[i], "…");
			const colored = color === undefined
				? (specs[i].color ? colorize(fitted, specs[i].color) : fitted)
				: color === null
				? fitted
				: colorize(fitted, color);
			return pad(colored, widths[i], specs[i].align ?? "left");
		});
		// Trailing padding on the last column is invisible and only makes lines wrap early.
		lines.push((margin + rendered.join(separator)).replace(/\s+$/, ""));
	};

	const hasHeaders = specs.some((spec) => spec.header !== undefined);
	if (hasHeaders) {
		emit(specs.map((spec) => spec.header ?? ""), opts.headerColor ?? "gray");
		const rule = opts.rule ?? "─";
		if (rule) {
			emit(widths.map((width) => rule.repeat(Math.max(0, width))), opts.headerColor ?? "gray");
		}
	}

	for (const row of rows) emit(row);
	return lines.join("\n");
}

/**
 * A two-column `key: value` block — the shape most CLI output actually wants.
 *
 * ```ts
 * console.log(definitionList([["name", "my-app"], ["database", "postgres"]]));
 * ```
 */
export function definitionList(
	entries: (readonly [string, string])[],
	opts: Omit<TableOptions, "columns" | "headers"> & { keyColor?: ColorName } = {},
): string {
	const { keyColor = "gray", ...rest } = opts;
	return table(entries.map(([key, value]) => [key, value]), {
		...rest,
		columns: [{ color: keyColor }, {}],
	});
}
