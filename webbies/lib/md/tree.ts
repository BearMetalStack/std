import type { Token } from "./lexer.ts";

export type Node =
	| { type: "root"; children: Node[] }
	| { type: "paragraph"; children: Node[] }
	| { type: "heading"; level: number; children: Node[] }
	| { type: "blockquote"; children: Node[] }
	| { type: "orderedlist"; children: Node[] }
	| { type: "unorderedlist"; style?: "none"; children: Node[] }
	| { type: "table"; columns: number; rows: Node[] }
	| { type: "footnotedef"; id: string; children: Node[] }
	| { type: "tablerow"; columns: string[] }
	| { type: "tableformat"; columns: ("l" | "c" | "r")[] }
	| { type: "listitem"; style?: "none"; children: Node[] }
	| { type: "checkitem"; checked: boolean; children: Node[] }
	| { type: "lineitem"; children: Node[] }
	| { type: "bold"; children: Node[] }
	| { type: "italic"; children: Node[] }
	| { type: "bolditalic"; children: Node[] }
	| { type: "strikethrough"; children: Node[] }
	| { type: "highlight"; children: Node[] }
	| { type: "code"; children: Node[] }
	| { type: "codeblock"; lang?: string; children: Node[] }
	| { type: "link"; href: string; text: string; title?: string }
	| { type: "image"; src: string; alt?: string; title?: string }
	| { type: "footnote"; id: string }
	| { type: "hr" }
	| { type: "linebreak" }
	| { type: "text"; value: string };

export class MarkdownTreeBuilder {
	private stack: Node[] = [];
	private root: Node = { type: "root", children: [] };

	constructor() {
		this.stack.push(this.root);
	}

	private get current(): Node {
		return this.stack[this.stack.length - 1];
	}

	private append(node: Node) {
		const parent = this.current;
		if ("children" in parent) {
			parent.children.push(node);
		} else if ("rows" in parent) {
			(parent as { rows: Node[] }).rows.push(node);
		}
	}

	private open(node: Node) {
		this.append(node);
		this.stack.push(node);
	}

	private close() {
		this.stack.pop();
	}

	async build(tokens: AsyncIterable<Token>): Promise<Node> {
		for await (const token of tokens) {
			this.handle(token);
		}
		return this.root;
	}

	private handle(token: Token) {
		// toggle inline nodes
		const toggles = [
			"bold",
			"italic",
			"bolditalic",
			"strikethrough",
			"highlight",
			"code",
		] as const;
		for (const tag of toggles) {
			if ("tag" in token && token.tag === tag) {
				if (this.current.type === tag) {
					this.close();
				} else if (
					this.current.type !== "code" && this.current.type !== "codeblock"
				) {
					this.open({ type: tag, children: [] });
				}
				return;
			}
		}

		if ("type" in token) {
			switch (token.type) {
				case "open":
					switch (token.tag) {
						case "paragraph":
							this.open({ type: "paragraph", children: [] });
							break;
						case "heading":
							this.open({ type: "heading", level: token.level, children: [] });
							break;
						case "blockquote":
							this.open({ type: "blockquote", children: [] });
							break;
						case "orderedlist":
							this.open({ type: "orderedlist", children: [] });
							break;
						case "unorderedlist":
							this.open({
								type: "unorderedlist",
								style: token.style,
								children: [],
							});
							break;
						case "table":
							this.open({ type: "table", columns: token.columns, rows: [] });
							break;
						case "footnotedef":
							this.open({ type: "footnotedef", id: token.id, children: [] });
							break;
					}
					break;
				case "close":
					if (
						this.current.type === "listitem" ||
						this.current.type === "checkitem" ||
						this.current.type === "lineitem"
					) {
						this.close();
					}
					this.close();
					break;
				case "text":
					this.append({ type: "text", value: token.value });
					break;
			}
		} else {
			// tagonly tokens
			switch (token.tag) {
				case "hr":
					this.append({ type: "hr" });
					break;
				case "linebreak":
					if (this.current.type === "lineitem") this.close();
					this.append({ type: "linebreak" });
					break;
				case "footnote":
					this.append({ type: "footnote", id: token.id });
					break;
				case "link":
					this.append({
						type: "link",
						href: token.href,
						text: token.text,
						title: token.title,
					});
					break;
				case "image":
					this.append({
						type: "image",
						src: token.src,
						alt: token.alt,
						title: token.title,
					});
					break;
				case "tablerow":
					this.append({ type: "tablerow", columns: token.columns });
					break;
				case "tableformat":
					this.append({ type: "tableformat", columns: token.columns });
					break;
				case "listitem":
					// close previous sibling if still open
					if (
						this.current.type === "listitem" ||
						this.current.type === "checkitem"
					) {
						this.close();
					}
					this.open({ type: "listitem", style: token.style, children: [] });
					break;
				case "checkitem":
					if (
						this.current.type === "listitem" ||
						this.current.type === "checkitem"
					) {
						this.close();
					}
					this.open({
						type: "checkitem",
						checked: token.checked,
						children: [],
					});
					break;
				case "lineitem":
					if (this.current.type === "lineitem") {
						this.close();
					}
					this.open({ type: "lineitem", children: [] });
					break;
				case "codeblock":
					if (this.current.type === "codeblock") {
						this.close();
					} else {
						this.open({ type: "codeblock", children: [] });
					}
					break;
			}
		}
	}

	traverse(
		onEnter: (n: Node) => boolean | void,
		onExit: (n: Node) => void = () => {},
		node: Node = this.root,
	) {
		const descend = onEnter(node);
		if (descend !== false) {
			let children: Node[] = [];
			if ("children" in node) {
				children = node.children;
			} else if ("rows" in node) {
				children = node.rows;
			}
			for (const child of children) {
				this.traverse(onEnter, onExit, child);
			}
		}
		onExit(node);
	}
}
