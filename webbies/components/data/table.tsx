import { BMElement, define } from "@bearmetal/app";
import { css, html } from "@bearmetal/miscellanea";
import { injectStyle } from "@bearmetal/drip";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";

injectStyle(
	"bm-table",
	css`
		table {
			border-radius: var(--radius-lg);
			background-color: var(--color-bg-subtle);
			overflow: clip;
			border: 0;
			border-collapse: collapse;

			td,
			th {
				color: var(--color-text);
				padding: var(--space-2);
				border: 0;
				text-align: left;

				&.center {
					text-align: center;
				}
				&.right {
					text-align: right;
				}
			}

			tr:not(:last-child),
			thead,
			tbody:not(:last-child) {
				border-bottom: var(--color-bearmetal-200) 1px solid;
			}

			thead,
			tfoot {
				background-color: #00000030;
				td,
				th {
					color: var(--color-text-subtle);
				}
			}

			th > .sorting {
				opacity: 0;
				transition:
					var(--transition-transform),
					var(--transition-opacity);
				transform: rotate(0);
			}

			th {
				cursor: pointer;
				&[data-sorting] > .sorting {
					opacity: 1;
				}
				&[data-order="desc"] > .sorting {
					transform: rotate(-180deg);
				}
			}

			.pager {
				display: flex;
				justify-content: end;
				align-items: center;
				gap: 1rem;
			}
		}
	`,
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OBSERVED = ["data-json", "src", "columns", "sort", "page-size"] as const;
type Attribute = typeof OBSERVED[number];

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a columns attribute string into [key, title] pairs. */
function parseColumns(raw: string): [key: string, title: string][] {
	return raw.split(/, ?/).map((c) => {
		const [key = c, title = key] = c.split(":");
		return [key, title];
	});
}

/** Collect column keys from a dataset, preserving insertion order. */
function inferColumns(data: Row[]): [key: string, title: string][] {
	const keys = [...new Set(data.flatMap(Object.keys))];
	return keys.map((k) => [k, k]);
}

/** Find the cell that should receive a given column's value. */
function findCell(
	row: HTMLTableRowElement,
	key: string,
): HTMLTableCellElement | null {
	return (
		row.querySelector<HTMLTableCellElement>(`[data-field="${key}"]`) ??
			[...row.querySelectorAll<HTMLTableCellElement>("td:not([data-field])")]
				.find((el) => !el.textContent) ??
			null
	);
}

/** Build a tbody from data rows and an optional user template. */
function buildBody(
	data: Row[],
	columns: [key: string, title: string][],
	template: HTMLTemplateElement | null,
): HTMLTableSectionElement {
	const tbody = document.createElement("tbody");
	for (const record of data) {
		const row = tbody.appendChild(buildRow(columns, template));
		fillRow(row, record, columns);
	}
	return tbody;
}

/** Clone the user template or generate a plain <tr> with data-field cells. */
function buildRow(
	columns: [key: string, title: string][],
	template: HTMLTemplateElement | null,
): HTMLTableRowElement {
	if (template) {
		const frag = document.importNode(template.content, true);
		return frag.querySelector("tr")!;
	}
	const tr = document.createElement("tr");
	for (const [key] of columns) {
		const td = tr.appendChild(document.createElement("td"));
		td.dataset.field = key;
	}
	return tr;
}

/** Write record values into a row's cells. */
function fillRow(
	row: HTMLTableRowElement,
	record: Row,
	columns: [key: string, title: string][],
): void {
	for (const [key] of columns) {
		const cell = findCell(row, key);
		if (cell) cell.textContent = String(record[key] ?? "");
	}
}

// ---------------------------------------------------------------------------
// Persistent section builders
// ---------------------------------------------------------------------------

/** Build a thead - persists across renders, mutated in place on sort change. */
function buildHead(
	columns: [key: string, title: string][],
	onSort: (key: string) => void,
): HTMLTableSectionElement {
	const thead = document.createElement("thead");
	const tr = thead.appendChild(document.createElement("tr"));

	for (const [key, title] of columns) {
		const th = tr.appendChild(document.createElement("th"));
		th.dataset.column = key;
		th.innerHTML = html`
			<span>${title}</span><bm-icon icon="caret-down" class="sorting" />
		`;
		th.addEventListener("click", () => onSort(key));
	}

	return thead;
}

/** Update sort indicators on an existing thead without rebuilding it. */
function updateHeadSort(
	thead: HTMLTableSectionElement,
	sortKey: string,
	sortDir: 1 | -1,
): void {
	for (const th of thead.querySelectorAll<HTMLTableCellElement>("th")) {
		const isActive = th.dataset.column === sortKey;
		th.toggleAttribute("data-sorting", isActive);
		if (isActive) {
			th.dataset.order = sortDir === 1 ? "asc" : "desc";
		} else {
			delete th.dataset.order;
		}
	}
}

/** Build a tfoot - persists across renders, mutated in place on page change. */
function buildFoot(
	colSpan: number,
	onPage: (delta: number) => void,
): HTMLTableSectionElement {
	const tfoot = document.createElement("tfoot");
	const tr = tfoot.appendChild(document.createElement("tr"));
	const td = tr.appendChild(document.createElement("td"));
	td.colSpan = colSpan;

	const info = document.createElement("small");
	info.dataset.role = "info";

	const prev = document.createElement("button");
	prev.classList.add("icon", "sm", "secondary");
	prev.dataset.role = "prev";
	prev.innerHTML = html`
		<bm-icon icon="caret-left" />
	`;
	prev.addEventListener("click", () => onPage(-1));

	const next = document.createElement("button");
	next.classList.add("icon", "sm", "secondary");
	next.dataset.role = "next";
	next.innerHTML = html`
		<bm-icon icon="caret-right" />
	`;
	next.addEventListener("click", () => onPage(1));

	const controls = document.createElement("div");
	controls.classList.add("pager");
	controls.append(info, prev, next);
	td.appendChild(controls);

	return tfoot;
}

/** Update page info and button states on an existing tfoot in place. */
function updateFoot(
	tfoot: HTMLTableSectionElement,
	page: number,
	pageSize: number,
	total: number,
	pageCount: number,
): void {
	const info = tfoot.querySelector<HTMLElement>("[data-role='info']");
	const prev = tfoot.querySelector<HTMLButtonElement>("[data-role='prev']");
	const next = tfoot.querySelector<HTMLButtonElement>("[data-role='next']");

	if (info) {
		const from = page * pageSize + 1;
		const to = Math.min(page * pageSize + pageSize, total);
		info.innerHTML = `<em>${from}–${to} of ${total}</em>`;
	}
	if (prev) prev.disabled = page === 0;
	if (next) next.disabled = page >= pageCount - 1;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@define("bm-table", import.meta)
export class Table extends BMElement {
	static observedAttributes = OBSERVED;

	// --- State ----------------------------------------------------------------
	private _data: Row[] = [];
	private _sorted: Row[] = [];
	private _sortKey = "";
	private _sortDir: 1 | -1 = 1;
	private _page = 0;
	private _pageSize = 0;

	// --- Persistent DOM -------------------------------------------------------
	private _table: HTMLTableElement | null = null;
	private _thead: HTMLTableSectionElement | null = null;
	private _tfoot: HTMLTableSectionElement | null = null;
	private _columns: [key: string, title: string][] = [];

	get template(): JSX.Element {
		return (
			<slot>
				<div class="placeholder">
					<bm-loader>Generating Table</bm-loader>
				</div>
			</slot>
		);
	}

	init() {
		this.useShadow();
		this._pageSize = this.hasAttribute("page-size") ? Number(this.getAttribute("page-size")) : 0;
		const raw = this.getAttribute("data-json");
		if (raw) this._setData(JSON.parse(raw));
	}

	attributeChangedCallback(name: Attribute, _old: string, value: string): void {
		switch (name) {
			case "data-json":
				this._setData(JSON.parse(value));
				break;
			case "sort":
				this._applySort(value);
				break;
			case "page-size":
				this._pageSize = Number(value) || 0;
				this._page = 0;
				this._buildTable();
				break;
		}
	}

	/** Public API - set data programmatically. */
	setData<T extends Row>(data: T[]): void {
		this._setData(data);
	}

	// --- Private: data --------------------------------------------------------

	private _setData(data: Row[]): void {
		this._data = data;
		this._sorted = data.slice();
		this._page = 0;
		this._buildTable();
	}

	private _applySort(key: string): void {
		if (this._sortKey === key) {
			if (this._sortDir === 1) {
				this._sortDir = -1;
			} else {
				this._sortDir = 1;
				this._sortKey = "";
			}
		} else {
			this._sortKey = key;
			this._sortDir = 1;
		}

		this._sorted = !this._sortKey ? this._data.slice() : this._data.toSorted((a, b) => {
			const av = a[this._sortKey] ?? "";
			const bv = b[this._sortKey] ?? "";
			if (av > bv) return this._sortDir;
			if (av < bv) return -this._sortDir;
			return 0;
		});

		if (this._thead) updateHeadSort(this._thead, this._sortKey, this._sortDir);
		this._renderBody();
	}

	private _applyPage(delta: number): void {
		this._page = Math.max(0, Math.min(this._page + delta, this._pageCount - 1));
		if (this._tfoot) {
			updateFoot(
				this._tfoot,
				this._page,
				this._pageSize,
				this._data.length,
				this._pageCount,
			);
		}
		this._renderBody();
	}

	// --- Private: DOM ---------------------------------------------------------

	private get _userTemplate(): HTMLTemplateElement | null {
		return this.querySelector("template");
	}

	private get _columnAttr(): [key: string, title: string][] | null {
		const raw = this.getAttribute("columns");
		return raw ? parseColumns(raw) : null;
	}

	private get _pageCount(): number {
		return this._pageSize > 0 ? Math.ceil(this._data.length / this._pageSize) : 1;
	}

	private get _currentPage(): Row[] {
		if (this._pageSize <= 0) return this._sorted;
		return this._sorted.slice(
			this._page * this._pageSize,
			this._page * this._pageSize + this._pageSize,
		);
	}

	/** Full rebuild - only called when data or page-size changes. */
	private _buildTable(): void {
		if (!this._data.length) return;

		this._columns = this._columnAttr ?? inferColumns(this._data);

		const table = document.createElement("table");
		if (this.style.gridColumn) table.style.width = "100%";

		this._thead = buildHead(this._columns, (key) => this._applySort(key));
		updateHeadSort(this._thead, this._sortKey, this._sortDir);
		table.appendChild(this._thead);

		table.appendChild(
			buildBody(this._currentPage, this._columns, this._userTemplate),
		);

		if (this._pageSize > 0) {
			this._tfoot = buildFoot(
				this._columns.length,
				(delta) => this._applyPage(delta),
			);
			updateFoot(
				this._tfoot,
				this._page,
				this._pageSize,
				this._data.length,
				this._pageCount,
			);
			table.appendChild(this._tfoot);
		} else {
			this._tfoot = null;
		}

		this._table?.remove();
		this._table = table;
		this.appendChild(table);
	}

	/** Partial update - only swaps tbody, thead and tfoot mutated in place. */
	private _renderBody(): void {
		if (!this._table) return;
		const tbody = this._table.querySelector("tbody");
		const next = buildBody(
			this._currentPage,
			this._columns,
			this._userTemplate,
		);
		tbody ? this._table.replaceChild(next, tbody) : this._table.appendChild(next);
	}
}
