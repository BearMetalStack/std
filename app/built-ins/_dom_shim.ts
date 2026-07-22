// Minimal DOM stand-in for testing For/each/reconcile under `deno test`, which has no
// real `document`. Must be imported before any module that reaches
// `@bearmetal/jsx/jsx-runtime` — that module's top-level `typeof document !== "undefined"`
// check (which picks the client vs. server jsx impl) runs once, at import time.
//
// `each()` no longer parents its items under a wrapper element: it brackets them
// between two empty text-node markers and inserts them as siblings of whatever
// the returned fragment lands in. So the shim models a real node tree — text
// nodes, fragments, and full sibling navigation — not just an element/children
// container.
export class MiniNode {
	parentNode: MiniNode | null = null;
	childNodes: MiniNode[] = [];
	nodeType = 1;

	/** Element-only view, mirroring `Element.children`. */
	get children(): MiniElement[] {
		return this.childNodes.filter((n): n is MiniElement => n instanceof MiniElement);
	}

	get firstChild(): MiniNode | null {
		return this.childNodes[0] ?? null;
	}

	get firstElementChild(): MiniElement | null {
		return this.children[0] ?? null;
	}

	get nextSibling(): MiniNode | null {
		if (!this.parentNode) return null;
		return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null;
	}

	get nextElementSibling(): MiniElement | null {
		let node = this.nextSibling;
		while (node && !(node instanceof MiniElement)) node = node.nextSibling;
		return node;
	}

	private detach() {
		if (!this.parentNode) return;
		const i = this.parentNode.childNodes.indexOf(this);
		if (i !== -1) this.parentNode.childNodes.splice(i, 1);
		this.parentNode = null;
	}

	appendChild(node: MiniNode): MiniNode {
		return this.insertBefore(node, null);
	}

	append(...nodes: MiniNode[]) {
		for (const node of nodes) this.insertBefore(node, null);
	}

	insertBefore(node: MiniNode, ref: MiniNode | null): MiniNode {
		// A fragment inserts all of its children and empties itself.
		if (node instanceof MiniFragment) {
			for (const child of [...node.childNodes]) this.insertBefore(child, ref);
			node.childNodes = [];
			return node;
		}
		node.detach();
		const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
		this.childNodes.splice(i, 0, node);
		node.parentNode = this;
		return node;
	}

	after(node: MiniNode) {
		if (!this.parentNode) return;
		this.parentNode.insertBefore(node, this.nextSibling);
	}

	prepend(node: MiniNode) {
		this.insertBefore(node, this.firstChild);
	}

	remove() {
		this.detach();
	}

	replaceWith(node: MiniNode) {
		if (!this.parentNode) return;
		this.parentNode.insertBefore(node, this);
		this.detach();
	}
}

export class MiniElement extends MiniNode {
	tag: string;
	override nodeType = 1;

	constructor(tag: string) {
		super();
		this.tag = tag;
	}
}

export class MiniText extends MiniNode {
	data: string;
	override nodeType = 3;

	constructor(data = "") {
		super();
		this.data = data;
	}
}

export class MiniFragment extends MiniNode {
	override nodeType = 11;
}

(globalThis as unknown as { document: unknown }).document = {
	createElement(tag: string) {
		return new MiniElement(tag);
	},
	createTextNode(data = "") {
		return new MiniText(data);
	},
	createDocumentFragment() {
		return new MiniFragment();
	},
};
