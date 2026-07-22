// Faithful mini-DOM for testing BMElement's rendering under `deno test` (no real
// `document`). Enough for the template paths: text nodes, elements, and
// DocumentFragments that EMPTY when inserted (insertion always detaches from the
// prior parent, so moving a fragment's children out leaves it empty — the exact
// semantic BMElement and the reactive-child reconciler must handle).
//
// Call `installTestDom()` inside a test and restore in a `finally` — it sets the
// globals (`document`, `Node`, `DocumentFragment`) and returns a teardown that
// puts the previous values back, so it never clobbers another file's DOM shim
// (e.g. built-ins/_dom_shim.ts).

export abstract class TNode {
	abstract nodeType: number;
	childNodes: TNode[] = [];
	parentNode: TNode | null = null;

	get firstChild(): TNode | null {
		return this.childNodes[0] ?? null;
	}

	#detach(node: TNode) {
		if (node.parentNode) (node.parentNode as TNode).removeChild(node);
	}

	insertBefore(node: TNode, ref: TNode | null): TNode {
		if (node instanceof TFragment) {
			for (const child of [...node.childNodes]) this.insertBefore(child, ref);
			return node;
		}
		this.#detach(node);
		const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
		this.childNodes.splice(i === -1 ? this.childNodes.length : i, 0, node);
		node.parentNode = this;
		return node;
	}

	appendChild(node: TNode): TNode {
		return this.insertBefore(node, null);
	}

	removeChild(node: TNode): TNode {
		const i = this.childNodes.indexOf(node);
		if (i !== -1) this.childNodes.splice(i, 1);
		node.parentNode = null;
		return node;
	}

	replaceChildren(...nodes: (TNode | null)[]): void {
		for (const child of [...this.childNodes]) this.removeChild(child);
		for (const node of nodes) if (node) this.appendChild(node);
	}

	hasChildNodes(): boolean {
		return this.childNodes.length > 0;
	}

	get innerHTML(): string {
		return this.childNodes.map(serialize).join("");
	}
}

export class TText extends TNode {
	nodeType = 3;
	constructor(public data: string) {
		super();
	}
}

export class TElement extends TNode {
	nodeType = 1;
	attrs: Record<string, string> = {};
	constructor(public tag: string) {
		super();
	}
	set className(v: string) {
		this.attrs.class = v;
	}
	set textContent(v: string) {
		this.replaceChildren(new TText(v));
	}
}

export class TFragment extends TNode {
	nodeType = 11;
}

function serialize(node: TNode): string {
	if (node instanceof TText) return node.data;
	if (node instanceof TElement) {
		const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${v}"`).join("");
		return `<${node.tag}${attrs}>${node.innerHTML}</${node.tag}>`;
	}
	return "";
}

export const testDocument = {
	createElement: (tag: string) => new TElement(tag),
	createTextNode: (data: string) => new TText(data),
	createDocumentFragment: () => new TFragment(),
};

/** Installs the mini-DOM globals; returns a teardown restoring the prior values. */
export function installTestDom(): () => void {
	// deno-lint-ignore no-explicit-any
	const g = globalThis as any;
	const prev = { document: g.document, Node: g.Node, DocumentFragment: g.DocumentFragment };
	g.document = testDocument;
	g.Node = TNode;
	g.DocumentFragment = TFragment;
	return () => {
		g.document = prev.document;
		g.Node = prev.Node;
		g.DocumentFragment = prev.DocumentFragment;
	};
}
