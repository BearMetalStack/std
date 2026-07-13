import { Html } from "../lib/html.ts";
import { escapeHtml } from "@bearmetal/miscellanea";
import { type HtmlLike, makeServerJsx } from "../lib/jsx.ts";
import type { BMC } from "@bearmetal/jsx";

const j: {
	jsx: {
		<T extends HtmlLike>(
			tag: (props: Record<string, unknown>) => T | Promise<T>,
			props: Record<string, unknown>,
			_key?: unknown,
		): Promise<T>;
		(tag: string | typeof BMC, props: Record<string, unknown>, _key?: unknown): Promise<HtmlLike>;
	};
	jsxs: {
		<T extends HtmlLike>(
			tag: (props: Record<string, unknown>) => T | Promise<T>,
			props: Record<string, unknown>,
			_key?: unknown,
		): Promise<T>;
		(tag: string | typeof BMC, props: Record<string, unknown>, _key?: unknown): Promise<HtmlLike>;
	};
	Fragment: ({ children }: {
		children?: unknown;
	}) => Promise<HtmlLike>;
} = makeServerJsx(Html, escapeHtml);
const jsx = j.jsx;
const jsxs = j.jsxs;
const Fragment = j.Fragment;

export { Fragment, jsx, jsxs };
export type * from "./types.ts";
