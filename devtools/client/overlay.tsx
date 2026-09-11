import { BMElement, define, each } from "@bearmetal/app";
import { safeFormat, toBindable } from "./format.ts";
import { type TreeNode, walkTree } from "./walk.ts";

const PANEL_CSS = `
	:host { all: initial; }
	.panel {
		position: fixed;
		inset-block-end: 0;
		inset-inline-end: 0;
		width: 320px;
		max-height: 60vh;
		display: flex;
		flex-direction: column;
		font: 12px/1.4 monospace;
		background: #1e1e1e;
		color: #ddd;
		border: 1px solid #444;
		z-index: 2147483647;
	}
	.panel button { font: inherit; }
	.panel ul { list-style: none; margin: 0; padding: 4px; overflow: auto; }
	.tree { flex: 1; border-block-end: 1px solid #444; }
	.tree li { cursor: pointer; padding: 2px 4px; }
	.tree li:hover { background: #333; }
	.bindings { flex: 1; }
	.bindings li { display: flex; justify-content: space-between; gap: 8px; padding: 2px 4px; }
	.bindings input { width: 120px; }
`;

/**
 * A dev-only in-page inspector: lists every live `BMElement` under
 * `document.documentElement` and, for whichever one is selected, its
 * `signalBindings()` — editable inline for anything not `readonly`.
 *
 * Never server-rendered (`static client = true`) — there is nothing to
 * hydrate, since this component only ever exists because
 * `@bearmetal/devtools`'s own bundle loaded, which only happens in dev.
 */
@define("bm-devtools-overlay")
class DevtoolsOverlay extends BMElement {
	static override client = true;

	#tree = this.signal<Map<string, TreeNode>>(new Map());
	#selectedElement = this.signal<BMElement | undefined>(undefined);

	/**
	 * Recomputes only when a genuinely *different* element is selected — not
	 * on every re-walk. Re-deriving bindings from a freshly-walked tree on
	 * every mutation would tear down and rebuild these rows constantly,
	 * resetting whatever the user is mid-typing into an editable `<input>`
	 * for a completely unrelated reason.
	 */
	#bindings = this.computed(() => this.#selectedElement.get()?.signalBindings() ?? []);

	#rewalk = (): void => {
		this.#tree.set(walkTree(document.documentElement, { skip: this }));
		const selected = this.#selectedElement.get();
		if (selected && !selected.isConnected) this.#selectedElement.set(undefined);
	};

	protected override init(): () => void {
		this.useShadow();
		this.#rewalk();

		let timer: ReturnType<typeof setTimeout> | undefined;
		const observer = new MutationObserver(() => {
			clearTimeout(timer);
			timer = setTimeout(this.#rewalk, 150);
		});
		observer.observe(document.documentElement, { childList: true, subtree: true });

		return () => {
			observer.disconnect();
			clearTimeout(timer);
		};
	}

	protected override get template() {
		return (
			<>
				<style>{PANEL_CSS}</style>
				<div class="panel">
					<button type="button" onClick={this.#rewalk}>Refresh</button>
					<ul class="tree">
						{each(
							this.computed(() => [...this.#tree.get().entries()]),
							([, node]) => (
								<li onClick={() => this.#selectedElement.set(node.element)}>
									{node.element.tag}
								</li>
							),
							([address]) => address,
						)}
					</ul>
					<ul class="bindings">
						{each(
							this.#bindings,
							(b) => (
								<li>
									<span>{b.name}</span>
									{b.readonly
										? <span>{this.computed(() => safeFormat(b))}</span>
										: <input $bind={toBindable(b)} />}
								</li>
							),
							(b) => b.name,
						)}
					</ul>
				</div>
			</>
		);
	}
}

// `<script type="module">` is deferred by spec — this runs after the document
// has been parsed, so `document.body` is guaranteed to exist.
if (typeof document !== "undefined" && !document.querySelector(DevtoolsOverlay.tag)) {
	document.body.appendChild(document.createElement(DevtoolsOverlay.tag));
}
