type namespace = string;
type identifier = string;
type tokenIdentifier = `${namespace}:${identifier}`;
type Char = string;

interface Rule<T = Record<string, string>> {
	id: tokenIdentifier;
	requires?: tokenIdentifier[]; // Rule interop, will not be implemented yet
	overrides?: tokenIdentifier[];
	trigger: Char;
	validate: (ctx: LexerContext) => boolean;
	tokenize: (ctx: LexerContext) => Token<T> | Token<T>[];
	tree: (token: Token<T>, ctx: TreeContext) => void;
	renderOpen: (node: Node<T>, ctx: RenderContext) => string;
	renderClose?: (node: Node<T>, ctx: RenderContext) => string;
}

interface Token<T = Record<string, string>> {
	tag: tokenIdentifier;
	data: T;
}
interface LexerContext {
	peek: (length: number, offset?: number) => string;
	toNextSubstring: (sub: string, offset?: number) => string;
	lineStart: number;
	cursor: number;
	currentLine: string;
	previousToken: Token;
}
interface TreeContext {
	stack: Node[];
	currentNode: Node;
}
interface RenderContext {
	renderMethod: "html" | "dom";
}
interface Node<T = Record<string, string>> {
	tag: tokenIdentifier;
	data: T;
	children: Node[];
	parent?: Node;
}
