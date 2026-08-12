/**
 * @module
 * The plain-text write profile - a clawmark tree flattened to prose, with
 * nothing else: no markup syntax, no XML wrapper, just the words an author
 * would read aloud.
 *
 * ```ts
 * const out = markdownWith("# Hi\n\nSome **bold** text.", textWriter());
 * out.parts[out.primary]; // "Hi\n\nSome bold text.\n\n"
 * ```
 *
 * Every other write profile in this package produces markup a real format
 * needs (WordprocessingML, ODF, HTML), so its emitters are mostly occupied
 * with *how* to spell a construct. This one has nothing to spell - a bold
 * run and a plain run are the same characters - so its only job is the one
 * every profile does implicitly by nesting elements: keeping adjacent blocks
 * from running into each other. `core:text` already flattens to a bare string
 * (`write.ts`'s unclaimed fallback), so left alone, "one paragraph." followed
 * by "Another." would concatenate to "one paragraph.Another." with the word
 * boundary lost. Every construct that isn't plain inline flow - headings,
 * list items, blockquote lines, table rows, footnote bodies, code blocks -
 * gets an emitter whose only job is to recurse as normal and then emit a
 * separator, so word boundaries survive even though nothing else about the
 * text changes.
 *
 * Inline constructs need no emitter at all: bold/italic/underline/strike/
 * highlight/emphasis nodes contribute a style frame and no element in every
 * other profile too, and the unclaimed default ("unwrap") already threads
 * their children through unchanged. The exceptions are the handful of nodes
 * that carry their text in `data` rather than in children - `md:link`,
 * `md:code` - which would otherwise vanish outright, and `md:linebreak`,
 * which carries no text but still needs *something* to keep the words either
 * side of it apart.
 */

import type { AnyEmitter, EmitContext, Node, WriteProfile, WriteResult } from "../../types.ts";
import { append } from "../../xml/build.ts";
import { out } from "../../dsl.ts";
import { wrapsSoleBlock } from "../../rules/paragraph.ts";

export interface TextWriteOptions {
	/**
	 * Inserted after every block-level construct (paragraph, heading, list
	 * item, blockquote line, table row, footnote body, code block). Default
	 * `"\n\n"`.
	 */
	blockSeparator?: string;
	/** Extra emitters, consulted before the built-ins. */
	emitters?: AnyEmitter[];
}

const LIST_TAGS = new Set(["md:orderedlist", "md:unorderedlist"]);

export function textWriter(options: TextWriteOptions = {}): WriteProfile {
	const sep = options.blockSeparator ?? "\n\n";

	const block: AnyEmitter["emit"] = (_node, ctx) => ({
		kind: "custom",
		run(parent) {
			ctx.children(parent);
			append(parent, ctx.txt(sep));
		},
	});

	/**
	 * A list item's own inline content and a nested list under it are both its
	 * children, in document order - but the nested list needs the item's
	 * separator *between* them, not after both, or the item's last word runs
	 * into the nested list's first (`serializeItem` in rules/list.ts has the
	 * same split, for the same reason).
	 */
	const listItem: AnyEmitter["emit"] = (node, ctx) => ({
		kind: "custom",
		run(parent) {
			const nested = node.children.filter((child) => LIST_TAGS.has(child.tag));
			const own = node.children.filter((child) => !LIST_TAGS.has(child.tag));
			for (const child of own) ctx.child(parent, child);
			append(parent, ctx.txt(sep));
			for (const child of nested) ctx.child(parent, child);
		},
	});

	/** A leaf whose text lives in `node.data[key]`, not in children. */
	const leaf = (key: string, trailing = "") => ((node: Node, ctx: EmitContext) => {
		const value = String((node.data as Record<string, unknown>)[key] ?? "");
		return { kind: "nodes" as const, nodes: [ctx.txt(value + trailing)] };
	});

	const emitters: AnyEmitter[] = [
		...(options.emitters ?? []),

		// The lexer wraps every block in a paragraph, so a heading arrives as
		// `core:paragraph > md:heading`; without this every block gets a
		// redundant extra separator from the wrapper on top of its own.
		out("core:paragraph").where(wrapsSoleBlock).unwrap(),
		out("core:paragraph").to(block),

		out("md:heading").to(block),
		out("md:lineitem").to(block),
		out(["md:listitem", "md:checkitem"]).to(listItem),
		out("md:footnotedef").to(block),
		out("md:codeblock").to(leaf("value", sep)),

		out("md:tablerow").to((node, ctx) => {
			const columns = (node.data as { columns?: string[] }).columns ?? [];
			return { kind: "nodes", nodes: [ctx.txt(columns.join(" ") + sep)] };
		}),

		// Leaves whose text lives in `data`: unclaimed's default "unwrap" would
		// otherwise drop them, since they have no children to unwrap into.
		out("md:link").to(leaf("text")),
		out("md:code").to(leaf("value")),

		// Carries no text of its own, but still has to keep its neighbors apart.
		out("md:linebreak").to((_node, ctx) => ({ kind: "nodes", nodes: [ctx.txt(" ")] })),
	];

	return {
		name: "text",
		emitters,
		assemble(body, ctx): WriteResult {
			const text = body.map((node) => node.kind === "text" ? node.value : "").join("");
			return {
				parts: { "out.txt": text },
				primary: "out.txt",
				extension: "txt",
				mediaType: "text/plain",
				warnings: [...ctx.warnings],
			};
		},
	};
}
