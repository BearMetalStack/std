export type Token =
	| { type: "open"; tag: "heading"; level: number }
	| { type: "close"; tag: "heading" }
	| { type: "open"; tag: "paragraph" }
	| { type: "close"; tag: "paragraph" }
	| { type: "open"; tag: "orderedlist" }
	| { type: "close"; tag: "orderedlist" }
	| { type: "open"; tag: "unorderedlist"; style?: "none" }
	| { type: "close"; tag: "unorderedlist" }
	| { type: "open"; tag: "blockquote" }
	| { type: "close"; tag: "blockquote" }
	| { type: "open"; tag: "table"; columns: number }
	| { type: "close"; tag: "table" }
	| { tag: "tablerow"; columns: string[] }
	| { tag: "tableformat"; columns: ("l" | "c" | "r")[] }
	| { tag: "listitem"; style?: "none" }
	| { tag: "lineitem" }
	| { tag: "linebreak" }
	| { tag: "checkitem"; checked: boolean }
	| { tag: "bold" }
	| { tag: "italic" }
	| { tag: "bolditalic" }
	| { tag: "strikethrough" }
	| { tag: "highlight" }
	| { tag: "codeblock" }
	| { tag: "code" }
	| { tag: "hr" }
	| { tag: "footnote"; id: string }
	| { type: "open"; tag: "footnotedef"; id: string }
	| { type: "close"; tag: "footnotedef" }
	| { tag: "image"; src: string; alt?: string; title?: string }
	| { tag: "link"; href: string; text: string; title?: string }
	| { type: "text"; value: string };

interface ListStackEntry {
	indent: string;
	type: "ol" | "ul";
}

export class MarkdownLexer {
	private buffer = [] as string[];
	private tokens = [] as Token[];

	private cursor = 0;
	constructor(private input: string) {
	}

	peek(length: number, offset = 0) {
		if (this.cursor + length > this.input.length) {
			return "eof";
		}
		return this.input.slice(
			this.cursor + offset,
			this.cursor + offset + length,
		);
	}

	private done = false;
	private lineEndContext: "p" | "h" | "q" | "ol" | "ul" | "t" | "f" = "p";
	private isInCodeBlock = false;
	private isInCode = false;
	private lineStart = 0;

	private listStack: ListStackEntry[] = [];
	tokenize() {
		this.emit({
			type: "open",
			tag: "paragraph",
		});
		while (this.cursor < this.input.length) {
			if (this.isInCodeBlock) {
				if (this.peek(3) === "```") {
					this.flush();
					this.emit({
						tag: "codeblock",
					});
					this.cursor += 3;
					this.isInCodeBlock = false;
					continue;
				}
				this.push();
			} else if (this.isInCode) {
				if (this.peek(1) === "`") {
					this.flush();
					this.emit({
						tag: "code",
					});
					this.cursor++;
					this.isInCode = false;
					continue;
				}
				this.push();
			} else {
				switch (this.peek(1)) {
					case "#":
						{
							if (this.lineStart !== this.cursor) break;
							this.flush();
							const level = this.peek(6).match(/^#{1,6}/)?.[0].length ?? 1;
							this.cursor += level - 1;
							this.lineEndContext = "h";
							this.emit({
								type: "open",
								tag: "heading",
								level,
							});
						}
						break;
					case "\n":
						{
							this.lineStart = this.cursor + 1;
							this.flush();
							if (this.lineEndContext === "h") {
								this.emit({
									type: "close",
									tag: "heading",
								});
								this.lineEndContext = "p";
							}
							if (this.peek(2) === "\n\n" || this.peek(2) === "eof") {
								if (this.lineEndContext !== "p") {
									const tag = this.lineEndContext === "q"
										? "blockquote"
										: this.lineEndContext === "ol"
										? "orderedlist"
										: this.lineEndContext === "ul"
										? "unorderedlist"
										: this.lineEndContext === "f"
										? "footnotedef"
										: "table";
									tag && this.emit({
										type: "close",
										tag,
									});
									this.lineEndContext = "p";
								}
								this.emit({
									type: "close",
									tag: "paragraph",
								});
								this.cursor++;
								this.lineStart++;
								this.peek(2) !== "eof" &&
									this.emit({
										type: "open",
										tag: "paragraph",
									});
							}
							if (/\n[^\n]/.test(this.peek(2))) {
								this.buffer.push(" ");
							}
						}
						break;
					case "*":
					case "_":
						{
							if (this.peek(3) === "___") {
								const lineEnd = this.input.indexOf("\n", this.cursor);

								this.emit({
									tag: "hr",
								});
								this.cursor += lineEnd - this.cursor - 1;
								break;
							}
							const type = Math.max(
								this.peek(3).match(/^[_*]\*{0,2}/)?.[0].length ?? 1,
								this.peek(3).match(/^\*(?:\*[\*_]?)?/)?.[0].length ?? 1,
							);

							this.flush();
							switch (type) {
								case 1:
									this.emit({ tag: "italic" });
									break;
								case 2:
									this.emit({ tag: "bold" });
									break;
								case 3:
									this.emit({ tag: "bolditalic" });
									break;
							}
							this.cursor += type - 1;
						}
						break;
					case "`":
						{
							if (this.peek(2) === "` ") break;
							this.flush();
							const tag = this.peek(3) === "```" && this.cursor === this.lineStart
								? "codeblock"
								: "code";
							this.emit({
								tag,
							});
							if (tag === "codeblock") {
								this.cursor += 2;
								this.isInCodeBlock = true;
							} else {
								this.isInCode = true;
							}
						}
						break;
					case "~":
						{
							if (this.peek(2) === "~~") {
								this.flush();
								this.emit({
									tag: "strikethrough",
								});
								this.cursor++;
							} else this.push();
						}
						break;
					case "=":
						{
							if (this.peek(2) === "==") {
								this.flush();
								this.emit({
									tag: "highlight",
								});
								this.cursor++;
							} else this.push();
						}
						break;
					case "\\":
						this.cursor++;
						if (this.peek(1) === "\n") {
							this.flush();
							this.emit({
								tag: "linebreak",
							});
						} else this.push();
						break;
					case ".":
						{
							const len = this.cursor - this.lineStart;
							const lineContent = this.peek(len, -len);
							const rx = /^([\s]*)\d+$/;
							const match = lineContent.match(rx);

							if (match) {
								const currentIndent = match[1];
								const level = this.listStack.length;

								if (
									level === 0 ||
									currentIndent.length > this.listStack[level - 1].indent.length
								) {
									this.listStack.push({ indent: currentIndent, type: "ol" });
									this.lineEndContext = "ol";
									this.emit({ type: "open", tag: "orderedlist" });
									this.emit({ tag: "listitem" });
								} else if (
									currentIndent.length ===
										this.listStack[level - 1].indent.length
								) {
									if (this.listStack[level - 1].type !== "ol") {
										this.listStack.pop();
										this.emit({ type: "close", tag: "unorderedlist" });
										this.listStack.push({ indent: currentIndent, type: "ol" });
										this.emit({ type: "open", tag: "orderedlist" });
									}
									this.emit({ tag: "listitem" });
								} else {
									while (
										this.listStack.length > 0 &&
										this.listStack[this.listStack.length - 1].indent.length >
											currentIndent.length
									) {
										const entry = this.listStack.pop()!;
										this.emit({
											type: "close",
											tag: entry.type === "ol" ? "orderedlist" : "unorderedlist",
										});
									}
									if (
										this.listStack.length === 0 ||
										this.listStack[this.listStack.length - 1].indent.length !==
											currentIndent.length
									) {
										this.listStack.push({ indent: currentIndent, type: "ol" });
										this.emit({ type: "open", tag: "orderedlist" });
									}
									this.lineEndContext = "ol";
									this.emit({ tag: "listitem" });
								}

								this.buffer = [];
								this.cursor++;
							} else {
								this.push();
							}
						}
						break;
					case "-":
						{
							if (this.cursor !== this.lineStart) {
								const len = this.cursor - this.lineStart;
								const indent = this.peek(len - 1, -len);
								const rx = /^[\s]*$/mg;
								const match = indent.match(rx)?.[0];
								if (match) {
									const level = this.listStack.length;
									const currentIndent = match;

									if (
										level === 0 ||
										currentIndent.length >
											this.listStack[level - 1].indent.length
									) {
										this.listStack.push({ indent: currentIndent, type: "ul" });
										this.lineEndContext = "ul";
										this.emit({
											tag: "listitem",
											style: "none",
										});
										this.emit({
											tag: "unorderedlist",
											type: "open",
										});
										this.emit({
											tag: "listitem",
										});
									} else if (
										currentIndent.length ===
											this.listStack[level - 1]?.indent.length
									) {
										this.emit({
											tag: "listitem",
										});
									} else {
										while (
											this.listStack.length > 0 &&
											this.listStack[this.listStack.length - 1].indent.length >
												currentIndent.length
										) {
											const prev = this.listStack.pop();
											this.emit({
												tag: prev?.type === "ul" ? "unorderedlist" : "orderedlist",
												type: "close",
											});
										}
										if (
											this.listStack.length === 0 ||
											this.listStack[this.listStack.length - 1].indent
													.length !==
												currentIndent.length
										) {
											this.listStack.push({
												indent: currentIndent,
												type: "ul",
											});
										}
										this.lineEndContext = "ul";
										this.emit({ tag: "listitem" });
									}
								} else {
									this.push();
								}

								break;
							}
							this.flush();
							if (this.peek(3) === "---") {
								const lineEnd = this.input.indexOf("\n", this.cursor);

								this.emit({
									tag: "hr",
								});
								this.cursor += lineEnd - this.cursor - 1;
								break;
							}

							const isCheck = /^- \[[ x]\]/.test(this.peek(5));
							if (this.lineEndContext !== "ul") {
								this.lineEndContext = "ul";
								this.emit({
									type: "open",
									tag: "unorderedlist",
									style: isCheck ? "none" : undefined,
								});
							}

							if (isCheck) {
								this.emit({
									tag: "checkitem",
									checked: this.peek(5).includes("x"),
								});
								this.cursor += 4;
							} else {
								if (this.listStack.length) {
									this.listStack = [];
									this.emit({
										tag: "unorderedlist",
										type: "close",
									});
								}
								this.emit({
									tag: "listitem",
								});
								this.cursor++;
							}
						}
						break;
					case ">":
						{
							if (
								this.lineStart === this.cursor &&
								/^>[ \n]?/.test(this.peek(2))
							) {
								this.flush();
								if (this.lineEndContext !== "q") {
									this.lineEndContext = "q";
									this.emit({
										type: "open",
										tag: "blockquote",
									});
								}
								const tag = this.peek(1, 1) === "\n" ? "linebreak" : "lineitem";
								this.emit({ tag });
								this.cursor += tag === "lineitem" ? 1 : 0;
							} else this.push();
						}
						break;
					case "|":
						if (this.lineStart === this.cursor) {
							this.flush();
							const cLine = this.currentLine();
							const line = cLine.replace(/^\|/m, "").replace(
								/\|$/m,
								"",
							).split("|").map((a) => a.trim());
							if (this.lineEndContext !== "t") {
								const columns = line.length;
								this.lineEndContext = "t";
								this.emit({
									type: "open",
									tag: "table",
									columns,
								});
							}
							if (/^[-:]/.test(line[0])) {
								this.emit({
									tag: "tableformat",
									columns: line.map((l) => {
										if (/^:-*:$/g.test(l)) return "c";
										if (/^--*:$/g.test(l)) return "r";
										return "l";
									}),
								});
							} else {
								this.emit({ tag: "tablerow", columns: line });
							}
							this.cursor += cLine.length - 1;
						}
						break;
					case "!":
						if (this.peek(2) === "![") {
							const imgStr = this.toSubstring(")");
							if (!imgStr) {
								this.push();
								break;
							}
							this.flush();
							const rx = /!\[(?<alt>[\s\S]*)\]\((?<src>[\S]*)(?: "(?<title>[\s\S]*)")?\)/;
							const { alt, src, title } = imgStr.match(rx)?.groups ??
								{ alt: undefined, src: "", title: undefined };
							this.emit({
								tag: "image",
								alt,
								src,
								title,
							});
							this.cursor += imgStr.length - 1;
						} else this.push();
						break;
					case "[":
						{
							if (this.peek(2) === "[^") {
								const refStr = this.toSubstring("]");
								if (refStr) {
									const rx = /\[\^(?<id>[a-z0-9]*)\]/i;
									if (this.peek(refStr.length + 2) === refStr + ": ") {
										this.flush();
										const { id } = refStr.match(rx)?.groups ?? { id: "" };
										this.emit({
											tag: "footnotedef",
											id,
											type: "open",
										});
										this.lineEndContext = "f";
										this.cursor += refStr.length;
										break;
									}
									this.flush();
									const { id } = refStr.match(rx)?.groups ?? { id: "" };
									this.emit({
										tag: "footnote",
										id,
									});
									this.cursor += refStr.length - 1;
								}
								break;
							}
							const linkstart = this.toSubstring("(");
							if (linkstart && /^\[[a-z]*\]\($/i.test(linkstart)) {
								const linkStr = this.toSubstring(")");
								if (!linkStr) {
									this.push();
									break;
								}
								this.flush();
								const rx = /\[(?<text>[\s\S]*)\]\((?<href>[\S]*)(?: "(?<title>[\s\S]*)")?\)/;
								const { text, href, title } = linkStr.match(rx)?.groups ??
									{ text: "", href: "#", title: undefined };

								this.emit({
									tag: "link",
									text,
									href,
									title,
								});
								this.cursor += linkStr.length - 1;
								break;
							}
							this.push();
						}
						break;

					default:
						this.push();
				}
			}
			this.cursor++;
		}
		this.done = true;
		this.enqueue(null);
	}

	private tokenQueue: (Token | null)[] = [];
	private notify: (() => void) | null = null;

	private enqueue(token: Token | null) {
		this.tokenQueue.push(token);
		this.notify?.();
	}

	private waitForToken(): Promise<void> {
		return new Promise((res) => {
			this.notify = res;
		});
	}

	async *tokenIter(): AsyncGenerator<Token> {
		if (this.done) {
			yield* this.tokens;
			return;
		}

		setTimeout(() => this.tokenize(), 0);

		while (true) {
			while (this.tokenQueue.length > 0) {
				const token = this.tokenQueue.shift()!;
				if (token === null) return;
				yield token;
			}
			await this.waitForToken();
		}
	}

	emit(t: Token) {
		this.tokens.push(t);
		this.enqueue(t);
	}

	push(count: number = 1) {
		this.buffer.push(this.peek(count));
	}

	flush() {
		if (this.buffer.length) {
			this.emit({
				type: "text",
				value: this.buffer.join(""),
			});
		}
		this.buffer = [];
	}

	currentLine() {
		const lineEnd = this.input.indexOf("\n", this.cursor);
		return this.input.substring(this.lineStart, lineEnd);
	}

	toSubstring(s: string, start = this.cursor) {
		const i = this.input.indexOf(s, start);
		if (i < 0) return null;
		return this.input.substring(start, i + s.length);
	}
}
