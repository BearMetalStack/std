import { NodeType } from "./node_type.ts";
import { SlagNode } from "./node.ts";

/**
 * A parentless container of nodes.
 *
 * The one behaviour everything downstream depends on: inserting a fragment
 * moves its children and leaves the fragment **empty**. `each()` and the JSX
 * reactive-child reconciler both hand the same fragment around repeatedly and
 * rely on it emptying. That logic lives in {@linkcode SlagNode.insertBefore}.
 */
export class SlagDocumentFragment extends SlagNode {
	override readonly nodeType = NodeType.DOCUMENT_FRAGMENT_NODE;
	override readonly nodeName = "#document-fragment";

	override cloneNode(deep = false): SlagDocumentFragment {
		const clone = new SlagDocumentFragment();
		clone.ownerDocument = this.ownerDocument;
		if (deep) this.cloneChildrenInto(clone);
		return clone;
	}
}
