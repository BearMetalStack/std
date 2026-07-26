// Custom-element-aware DOM stand-in for testing BMElement's connect/disconnect
// lifecycle under `deno test` (no real `document`). Unlike jsx/lib/_test_dom.ts and
// built-ins/_dom_shim.ts — plain data structures with no upgrade/connect semantics —
// this dispatches connectedCallback/disconnectedCallback on insertion/removal, and
// crucially fires disconnected-then-connected on a same-document move, exactly like a
// real browser: that move behavior is what a reactive child slot (Switch, Show,
// appendReactiveChild) triggers every time it reinserts already-mounted content.
//
// Importing this module installs the globals (`document`, `HTMLElement`,
// `customElements`, `Node`, `DocumentFragment`); it must be imported before any code
// that reaches them, including `@bearmetal/jsx` (whose `BMC` base class captures
// `globalThis.HTMLElement` at module-load time).

export class TestNode extends EventTarget {
	parentNode: TestNode | null = null;
	childNodes: TestNode[] = [];
	nodeType = 1;

	get isConnected(): boolean {
		// deno-lint-ignore no-explicit-any
		if ((this as any)._isRoot) return true;
		return this.parentNode?.isConnected ?? false;
	}

	hasChildNodes(): boolean {
		return this.childNodes.length > 0;
	}

	get firstChild(): TestNode | null {
		return this.childNodes[0] ?? null;
	}

	get nextSibling(): TestNode | null {
		if (!this.parentNode) return null;
		const i = this.parentNode.childNodes.indexOf(this);
		return this.parentNode.childNodes[i + 1] ?? null;
	}

	private detachRaw() {
		if (!this.parentNode) return;
		const i = this.parentNode.childNodes.indexOf(this);
		if (i !== -1) this.parentNode.childNodes.splice(i, 1);
		this.parentNode = null;
	}

	appendChild(node: TestNode): TestNode {
		return this.insertBefore(node, null);
	}

	insertBefore(node: TestNode, ref: TestNode | null): TestNode {
		// deno-lint-ignore no-explicit-any
		if ((node as any)._isFragment) {
			for (const child of [...node.childNodes]) this.insertBefore(child, ref);
			node.childNodes = [];
			return node;
		}
		// A same-document move is a removal followed by an insertion - each phase
		// enqueues its own custom element reaction, exactly like a real browser.
		const wasConnected = node.isConnected;
		node.detachRaw();
		if (wasConnected && !node.isConnected) dispatchDisconnect(node);

		const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
		this.childNodes.splice(i, 0, node);
		node.parentNode = this;
		if (this.isConnected) dispatchConnect(node);
		return node;
	}

	removeChild(node: TestNode): TestNode {
		const wasConnected = node.isConnected;
		node.detachRaw();
		if (wasConnected && !node.isConnected) dispatchDisconnect(node);
		return node;
	}

	querySelectorAll(_sel: string): TestNode[] {
		return [];
	}
}

class TestText extends TestNode {
	override nodeType = 3;
	constructor(public data = "") {
		super();
	}
}

class TestFragment extends TestNode {
	override nodeType = 11;
	_isFragment = true;
}

class TestElement extends TestNode {
	dataset: Record<string, string> = {};
	attributes = new Map<string, string>();
	className = "";
	constructor(public tagName: string) {
		super();
	}
	setAttribute(k: string, v: string) {
		this.attributes.set(k, v);
	}
	removeAttribute(k: string) {
		this.attributes.delete(k);
	}
	get shadowRoot() {
		return undefined;
	}
}

function dispatchConnect(node: TestNode) {
	// deno-lint-ignore no-explicit-any
	const el = node as any;
	if (typeof el.connectedCallback === "function") el.connectedCallback();
	for (const child of node.childNodes) dispatchConnect(child);
}

function dispatchDisconnect(node: TestNode) {
	// deno-lint-ignore no-explicit-any
	const el = node as any;
	if (typeof el.disconnectedCallback === "function") el.disconnectedCallback();
	for (const child of node.childNodes) dispatchDisconnect(child);
}

// deno-lint-ignore no-explicit-any
const registry = new Map<string, any>();

const testDocument = {
	head: new TestElement("head"),
	createElement(tag: string) {
		const ctor = registry.get(tag);
		// deno-lint-ignore no-explicit-any
		return ctor ? new (ctor as any)() : new TestElement(tag);
	},
	createTextNode(data = "") {
		return new TestText(data);
	},
	createDocumentFragment() {
		return new TestFragment();
	},
	adoptedStyleSheets: [] as unknown[],
	querySelector(_sel: string) {
		return null;
	},
};

const testCustomElements = {
	// deno-lint-ignore no-explicit-any
	define(tag: string, ctor: any) {
		registry.set(tag, ctor);
	},
	get(tag: string) {
		return registry.get(tag);
	},
};

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
g.Node = TestNode;
g.DocumentFragment = TestFragment;
g.HTMLElement = TestElement;
g.document = testDocument;
g.customElements = testCustomElements;

/** A fresh, detached mount root - connecting a node under it makes it "live". */
export function createRoot(): TestNode {
	const root = new TestElement("root");
	// deno-lint-ignore no-explicit-any
	(root as any)._isRoot = true;
	return root;
}

/** Waits for pending microtasks (e.g. BMElement's disconnect-debounce) to settle. */
export async function flushMicrotasks(times = 3): Promise<void> {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}
