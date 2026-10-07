/**
 * @module
 * The stages around parsing: `preparse` rewrites source text before the
 * lexer, `postparse` rewrites the tree after the tree builder.
 */

import type {
	AnyPostparseRule,
	AnyRule,
	Char,
	Node,
	PostparseContext,
	PreparseContext,
	PreparseRule,
	StagedRule,
} from "./types.ts";

/** A rule array sorted into its stages, each in registration order. */
export interface SplitRules {
	preparse: PreparseRule[];
	parse: AnyRule[];
	postparse: AnyPostparseRule[];
}

/** Sorts a mixed rule array by `stage`. Rules without one are parse rules. */
export function splitStages(rules: readonly StagedRule[]): SplitRules {
	const out: SplitRules = { preparse: [], parse: [], postparse: [] };
	for (const rule of rules) {
		if (rule.stage === "preparse") out.preparse.push(rule);
		else if (rule.stage === "postparse") out.postparse.push(rule);
		else out.parse.push(rule);
	}
	return out;
}

/**
 * Runs the preparse rules in `rules` over `input` and returns the expanded
 * source. Non-preparse rules are ignored, so a whole rule array can be passed.
 */
export function preparse(input: string, rules: readonly StagedRule[]): string {
	const byTrigger = new Map<Char, PreparseRule[]>();
	for (const rule of rules) {
		if (rule.stage !== "preparse") continue;
		const list = byTrigger.get(rule.trigger) ?? [];
		list.push(rule);
		byTrigger.set(rule.trigger, list);
	}
	if (byTrigger.size === 0) return input;
	for (const list of byTrigger.values()) {
		list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
	}

	let cursor = 0;
	let lineStart = 0;
	const ctx: PreparseContext = {
		input,
		peek: (length, offset = 0) => {
			const start = cursor + offset;
			return start + length > input.length ? "eof" : input.slice(start, start + length);
		},
		toNextSubstring: (sub, offset = 0) => {
			const start = cursor + offset;
			const i = input.indexOf(sub, start);
			return i < 0 ? "" : input.slice(start, i + sub.length);
		},
		get lineStart() {
			return lineStart;
		},
		get cursor() {
			return cursor;
		},
		set cursor(value: number) {
			cursor = value;
		},
		get currentLine() {
			const end = input.indexOf("\n", cursor);
			return input.slice(lineStart, end < 0 ? input.length : end);
		},
	};

	const out: string[] = [];
	let copiedTo = 0;
	for (; cursor < input.length; cursor++) {
		const ch = input[cursor];
		if (ch === "\n") {
			lineStart = cursor + 1;
			continue;
		}
		const rule = byTrigger.get(ch)?.find((candidate) => candidate.validate(ctx));
		if (!rule) continue;

		const start = cursor;
		out.push(input.slice(copiedTo, start), rule.expand(ctx));
		cursor = Math.max(cursor, start);
		copiedTo = cursor + 1;
		const lastNewline = input.lastIndexOf("\n", cursor);
		if (lastNewline >= start) lineStart = lastNewline + 1;
	}
	out.push(input.slice(copiedTo));
	return out.join("");
}

/**
 * Runs the postparse rules in `rules` over `root`, in order, and returns it.
 * Non-postparse rules are ignored, so a whole rule array can be passed.
 */
export function postparse(root: Node, rules: readonly StagedRule[]): Node {
	for (const rule of rules) {
		if (rule.stage !== "postparse") continue;
		const tags = rule.visit === undefined
			? undefined
			: new Set(Array.isArray(rule.visit) ? rule.visit : [rule.visit]);
		walk(root, root, rule, tags);
	}
	return root;
}

function walk(
	node: Node,
	root: Node,
	rule: AnyPostparseRule,
	tags: Set<string> | undefined,
): void {
	const next: Node[] = [];
	let changed = false;
	for (const child of node.children) {
		walk(child, root, rule, tags);
		if (tags && !tags.has(child.tag)) {
			next.push(child);
			continue;
		}
		const ctx: PostparseContext = { root, parent: node };
		const result = rule.transform(child, ctx);
		if (result === undefined) {
			next.push(child);
			continue;
		}
		changed = true;
		if (result === null) continue;
		for (const replacement of Array.isArray(result) ? result : [result]) {
			replacement.parent = node;
			next.push(replacement);
		}
	}
	if (changed) node.children = next;
}
