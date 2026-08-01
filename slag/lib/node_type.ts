/**
 * `Node.nodeType` values, in a module of their own so that `node.ts` and
 * `serialize.ts` can both reach them without a runtime import cycle.
 * Only the node types Slag can produce are listed.
 */
export const NodeType = {
	ELEMENT_NODE: 1,
	TEXT_NODE: 3,
	COMMENT_NODE: 8,
	DOCUMENT_NODE: 9,
	DOCUMENT_FRAGMENT_NODE: 11,
} as const;

/** The numeric union of every `nodeType` Slag produces. */
export type NodeTypeValue = typeof NodeType[keyof typeof NodeType];
