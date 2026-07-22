// Minimal but faithful DOM stand-in for testing the client jsx runtime under
// `deno test` (which has no `document`). Enough to exercise appendReactiveChild:
// text nodes, elements, and — critically — DocumentFragments that EMPTY when
// inserted, since that is the exact semantic the reactive-child reconciler must
// cope with. Insertion always detaches from the previous parent, so moving a
// fragment's children out leaves the fragment empty, mirroring the real DOM.
//
// Importing this module installs the globals (`document`, `Node`,
// `DocumentFragment`); it must be imported before any code that reaches them.

export abstract class TNode {
	abstract nodeType: number;
	childNodes: TNode[] = [];
	parentNode: TNode | null = null;

	get firstChild(): TNode | null {
		return this.childNodes[0] ?? null;
	}

	get nextSibling(): TNode | null {
		const siblings = this.parentNode?.childNodes;
		if (!siblings) return null;
		return siblings[siblings.indexOf(this) + 1] ?? null;
	}

	#detach(node: TNode) {
		if (node.parentNode === this) {
			const i = this.childNodes.indexOf(node);
			if (i !== -1) this.childNodes.splice(i, 1);
			node.parentNode = null;
		} else if (node.parentNode) {
			(node.parentNode as TNode).removeChild(node);
		}
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
}

export class TText extends TNode {
	nodeType = 3;
	data: string;
	constructor(data: string) {
		super();
		this.data = data;
	}
}

export class TElement extends TNode {
	nodeType = 1;
	tag: string;
	attrs: Record<string, string> = {};
	constructor(tag: string) {
		super();
		this.tag = tag;
	}

	setAttribute(k: string, v: string) {
		this.attrs[k] = v;
	}
	removeAttribute(k: string) {
		delete this.attrs[k];
	}
	set className(v: string) {
		this.attrs.class = v;
	}
	set textContent(v: string) {
		this.childNodes = [];
		this.appendChild(new TText(v));
	}

	get innerHTML(): string {
		return this.childNodes.map(serialize).join("");
	}
}

export class TFragment extends TNode {
	nodeType = 11;
}

function serialize(node: TNode): string {
	if (node instanceof TText) return node.data;
	if (node instanceof TElement) {
		const attrs = Object.entries(node.attrs)
			.map(([k, v]) => ` ${k}="${v}"`)
			.join("");
		return `<${node.tag}${attrs}>${node.innerHTML}</${node.tag}>`;
	}
	return "";
}

export const testDocument = {
	createElement: (tag: string) => new TElement(tag),
	createTextNode: (data: string) => new TText(data),
	createDocumentFragment: () => new TFragment(),
};

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
g.document = testDocument;
g.Node = TNode;
g.DocumentFragment = TFragment;
