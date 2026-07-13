// Minimal DOM stand-in for testing For/each/reconcile under `deno test`, which has no
// real `document`. Must be imported before any module that reaches
// `@bearmetal/jsx/jsx-runtime` — that module's top-level `typeof document !== "undefined"`
// check (which picks the client vs. server jsx impl) runs once, at import time.
export class MiniElement {
	tag: string;
	children: MiniElement[] = [];
	parent: MiniElement | null = null;

	constructor(tag: string) {
		this.tag = tag;
	}

	get firstElementChild(): MiniElement | null {
		return this.children[0] ?? null;
	}

	get nextElementSibling(): MiniElement | null {
		if (!this.parent) return null;
		return this.parent.children[this.parent.children.indexOf(this) + 1] ?? null;
	}

	private detach() {
		if (!this.parent) return;
		const i = this.parent.children.indexOf(this);
		if (i !== -1) this.parent.children.splice(i, 1);
		this.parent = null;
	}

	prepend(node: MiniElement) {
		node.detach();
		this.children.unshift(node);
		node.parent = this;
	}

	after(node: MiniElement) {
		if (!this.parent) return;
		node.detach();
		this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node);
		node.parent = this.parent;
	}

	remove() {
		this.detach();
	}

	replaceWith(node: MiniElement) {
		if (!this.parent) return;
		const i = this.parent.children.indexOf(this);
		node.detach();
		this.parent.children[i] = node;
		node.parent = this.parent;
		this.parent = null;
	}
}

(globalThis as unknown as { document: unknown }).document = {
	createElement(tag: string) {
		return new MiniElement(tag);
	},
};
