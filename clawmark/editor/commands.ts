import type { ActiveState, EditorElement, EditorMeta } from "./types.ts";

/** The selection that applies to `root`, which may sit inside a shadow root. */
export function selectionFor(root: HTMLElement): Selection | null {
	const node = root.getRootNode() as Document | ShadowRoot;
	const scoped = (node as ShadowRoot & { getSelection?: () => Selection | null }).getSelection;
	return (typeof scoped === "function" ? scoped.call(node) : null) ??
		root.ownerDocument.getSelection();
}

function rangeIn(root: HTMLElement): Range | null {
	const sel = selectionFor(root);
	if (!sel || sel.rangeCount === 0) return null;
	const range = sel.getRangeAt(0);
	return root.contains(range.commonAncestorContainer) ? range : null;
}

function matching(root: HTMLElement, node: Node, meta: EditorMeta): Element | null {
	let el: Node | null = node;
	while (el && el !== root) {
		if (el instanceof Element && meta.is(el)) return el;
		el = el.parentNode;
	}
	return null;
}

/** The top-level child of `root` containing `node`. */
function topBlock(root: HTMLElement, node: Node): Element | null {
	let el: Node | null = node;
	while (el && el.parentNode !== root) el = el.parentNode;
	return el instanceof Element ? el : null;
}

/** Which block and inline styles the selection sits inside. */
export function activeState(root: HTMLElement, metas: EditorMeta[]): ActiveState {
	const state: ActiveState = { inlines: new Set() };
	const range = rangeIn(root);
	if (!range) return state;
	const block = topBlock(root, range.startContainer);
	for (const meta of metas) {
		if (meta.kind === "block") {
			if (block && meta.is(block) && state.block === undefined) state.block = meta.key;
		} else if (
			matching(root, range.startContainer, meta) &&
			matching(root, range.endContainer, meta)
		) {
			state.inlines.add(meta.key);
		}
	}
	return state;
}

function create(doc: Document, spec: EditorElement): HTMLElement {
	const el = doc.createElement(spec.tag);
	for (const [k, v] of Object.entries(spec.attrs ?? {})) el.setAttribute(k, v);
	return el;
}

/** The inline content of a block as separate lines, whatever shape the block has. */
function linesOf(block: Element): Node[][] {
	const nodes = (el: Element) => [...el.childNodes];
	switch (block.localName) {
		case "ul":
		case "ol":
			return [...block.children].map(nodes);
		case "blockquote": {
			const kids = [...block.children].filter((c) => c.localName === "p");
			return kids.length ? kids.map(nodes) : [nodes(block)];
		}
		case "pre":
			return (block.textContent ?? "").split("\n").map((
				t,
			) => [block.ownerDocument.createTextNode(t)]);
		default:
			return [nodes(block)];
	}
}

function build(doc: Document, spec: EditorElement, lines: Node[][]): Element[] {
	const fill = (el: Element, line: Node[]) => (line.forEach((n) => el.append(n)), el);
	switch (spec.tag) {
		case "ul":
		case "ol": {
			const list = create(doc, spec);
			for (const line of lines) list.append(fill(doc.createElement("li"), line));
			return [list];
		}
		case "blockquote": {
			const quote = create(doc, spec);
			for (const line of lines) quote.append(fill(doc.createElement("p"), line));
			return [quote];
		}
		case "pre": {
			const pre = create(doc, spec);
			const code = doc.createElement("code");
			code.textContent = lines.map((l) => l.map((n) => n.textContent).join("")).join("\n");
			pre.append(code);
			return [pre];
		}
		default:
			return lines.map((line) => fill(create(doc, spec), line));
	}
}

/** Makes every block the selection touches into `meta`'s block style. */
export function setBlock(root: HTMLElement, meta: EditorMeta): boolean {
	const range = rangeIn(root);
	if (!range) return false;
	const doc = root.ownerDocument;
	const first = topBlock(root, range.startContainer);
	const last = topBlock(root, range.endContainer) ?? first;
	if (!first || !last) return false;

	if (meta.element.tag === "hr") {
		last.after(create(doc, meta.element));
		return true;
	}

	const blocks: Element[] = [];
	for (let el: Element | null = first; el; el = el.nextElementSibling) {
		blocks.push(el);
		if (el === last) break;
	}
	const sameList = (b: Element) =>
		(b.localName === "ul" || b.localName === "ol") &&
		(meta.element.tag === "ul" || meta.element.tag === "ol");

	let made: Element[] = [];
	if (blocks.length === 1 && sameList(blocks[0])) {
		const swapped = create(doc, meta.element);
		while (blocks[0].firstChild) swapped.append(blocks[0].firstChild);
		made = [swapped];
	} else {
		// Lists, quotes and code merge into one container; plain blocks stay one each.
		const merged = ["ul", "ol", "blockquote", "pre"].includes(meta.element.tag);
		const lines = blocks.flatMap(linesOf);
		made = merged
			? build(doc, meta.element, lines)
			: blocks.flatMap((b) => build(doc, meta.element, linesOf(b)));
	}

	blocks[0].before(...made);
	blocks.forEach((b) => b.remove());
	const sel = selectionFor(root);
	if (sel && made.length) {
		const next = doc.createRange();
		next.selectNodeContents(made[made.length - 1]);
		next.collapse(false);
		sel.removeAllRanges();
		sel.addRange(next);
	}
	return true;
}

function textNodesIn(root: HTMLElement, range: Range): Text[] {
	// Split the edges first so every text node is wholly inside or wholly outside.
	const end = range.endContainer;
	if (end instanceof Text && range.endOffset > 0 && range.endOffset < end.length) {
		end.splitText(range.endOffset);
	}
	const start = range.startContainer;
	if (start instanceof Text && range.startOffset > 0 && range.startOffset < start.length) {
		const tail = start.splitText(range.startOffset);
		if (end === start) range.setEnd(tail, tail.length);
		range.setStart(tail, 0);
	}
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const out: Text[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const text = n as Text;
		if (!text.length || !range.intersectsNode(text)) continue;
		const parent = text.parentElement;
		if (
			!/\S/.test(text.data) &&
			(parent === root || ["UL", "OL", "BLOCKQUOTE"].includes(parent?.tagName ?? ""))
		) {
			continue;
		}
		out.push(text);
	}
	return out;
}

/** Splits `el` so `text` sits alone inside it, then dissolves `el`. */
function unwrapAround(el: Element, text: Text): void {
	const doc = el.ownerDocument;
	const before = doc.createRange();
	before.setStart(el, 0);
	before.setEnd(text, 0);
	const after = doc.createRange();
	after.setStart(text, text.length);
	after.setEnd(el, el.childNodes.length);

	const head = before.collapsed ? null : before.extractContents();
	const tail = after.collapsed ? null : after.extractContents();
	if (head?.textContent) {
		const clone = el.cloneNode(false);
		clone.appendChild(head);
		el.before(clone);
	}
	if (tail?.textContent) {
		const clone = el.cloneNode(false);
		clone.appendChild(tail);
		el.after(clone);
	}
	while (el.firstChild) el.before(el.firstChild);
	el.remove();
}

function sameShape(a: Element, b: Element): boolean {
	if (a.localName !== b.localName || a.attributes.length !== b.attributes.length) return false;
	return [...a.attributes].every((attr) => b.getAttribute(attr.name) === attr.value);
}

const BLOCKS = new Set([
	"P",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"LI",
	"BLOCKQUOTE",
	"PRE",
	"TD",
	"TH",
	"DIV",
]);

/** Lifts `wrapper` above inline parents it fills entirely, so `<em><b>x</b></em>` becomes `<b><em>x</em></b>`. */
function hoist(root: HTMLElement, wrapper: Element): void {
	for (;;) {
		const parent = wrapper.parentElement;
		if (!parent || parent === root || BLOCKS.has(parent.tagName)) return;
		if (parent.childNodes.length !== 1 || sameShape(parent, wrapper)) return;
		const inner = [...wrapper.childNodes];
		parent.replaceWith(wrapper);
		parent.replaceChildren(...inner);
		wrapper.append(parent);
	}
}

function mergeNeighbours(el: Element): void {
	for (;;) {
		let next = el.nextSibling;
		// A lone space between two wrappers belongs inside the merged one.
		const gap = next instanceof Text && !/\S/.test(next.data) ? next : null;
		if (gap) next = gap.nextSibling;
		if (!(next instanceof Element) || !sameShape(el, next)) return;
		if (gap) el.append(gap);
		while (next.firstChild) el.append(next.firstChild);
		next.remove();
	}
}

/**
 * Applies `meta` to the selected text, or removes it if all of it already has
 * it. Works text node by text node, so a selection across blocks, or half
 * inside an existing wrapper, comes out right.
 */
export function toggleInline(root: HTMLElement, meta: EditorMeta, value?: string): boolean {
	const range = rangeIn(root);
	if (!range || range.collapsed) return false;
	const doc = root.ownerDocument;
	const nodes = textNodesIn(root, range);
	if (!nodes.length) return false;

	const withStyle = nodes.map((n) => matching(root, n, meta));
	const blank = (n: Text) => !/\S/.test(n.data) && nodes.length > 1;
	if (nodes.every((n, i) => withStyle[i] || blank(n))) {
		nodes.forEach((n, i) => {
			if (!withStyle[i]) return;
			const el = matching(root, n, meta) ?? withStyle[i];
			if (el) unwrapAround(el, n);
		});
	} else {
		const spec: EditorElement = {
			...meta.element,
			attrs: {
				...meta.element.attrs,
				...(meta.prompt && value ? { [meta.prompt.attr]: value } : {}),
			},
		};
		nodes.forEach((n, i) => {
			if (withStyle[i] || blank(n)) return;
			const wrapper = create(doc, spec);
			n.replaceWith(wrapper);
			wrapper.append(n);
		});
		const fresh = nodes.filter((n) => !blank(n));
		for (const n of fresh) {
			const wrapper = matching(root, n, meta);
			if (wrapper) hoist(root, wrapper);
		}
		for (const n of fresh) {
			const wrapper = matching(root, n, meta);
			if (wrapper) mergeNeighbours(wrapper);
		}
	}

	const sel = selectionFor(root);
	if (sel) {
		const next = doc.createRange();
		next.setStart(nodes[0], 0);
		next.setEnd(nodes[nodes.length - 1], nodes[nodes.length - 1].length);
		sel.removeAllRanges();
		sel.addRange(next);
	}
	return true;
}

/** Whether a keyboard event matches `Mod+Shift+X` style shortcut text. */
export function matchesShortcut(e: KeyboardEvent, shortcut: string | undefined): boolean {
	if (!shortcut) return false;
	const parts = shortcut.toLowerCase().split("+");
	const key = parts.pop()!;
	return (parts.includes("mod") === (e.metaKey || e.ctrlKey)) &&
		parts.includes("shift") === e.shiftKey &&
		parts.includes("alt") === e.altKey &&
		e.key.toLowerCase() === key;
}
