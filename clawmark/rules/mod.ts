import type { AnyRule } from "../types.ts";
import { paragraphRule } from "./paragraph.ts";
import { headingRule } from "./heading.ts";
import { emphasisRules } from "./emphasis.ts";
import { strikethroughRule } from "./strikethrough.ts";
import { highlightRule } from "./highlight.ts";
import { codeBlockRule, inlineCodeRule } from "./code.ts";
import { hrRule } from "./hr.ts";
import { linebreakRule } from "./linebreak.ts";
import { linkRule } from "./link.ts";
import { imageRule } from "./image.ts";
import { footnoteDefRule, footnoteRule } from "./footnote.ts";
import { blockquoteRule, lineItemRule } from "./blockquote.ts";
import { createListRules } from "./list.ts";
import { createTableRules } from "./table.ts";
import { rawRule } from "./raw.ts";

/**
 * Fresh rule set for one parse/render pass. Stateful rules (lists, tables)
 * are built via factories precisely so calling this twice never lets one
 * document's parse state bleed into another's - see list.ts/table.ts.
 */
export function defaultRules(): AnyRule[] {
	return [
		paragraphRule,
		codeBlockRule,
		inlineCodeRule,
		hrRule,
		...createListRules(),
		headingRule,
		...emphasisRules,
		strikethroughRule,
		highlightRule,
		linebreakRule,
		blockquoteRule,
		lineItemRule,
		...createTableRules(),
		imageRule,
		footnoteDefRule,
		footnoteRule,
		linkRule,
		rawRule,
	];
}
