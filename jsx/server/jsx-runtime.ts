// @bearmetal/jsx/server.ts
import { Html } from "../lib/html.ts";
import { escapeHtml } from "@bearmetal/miscellanea";
import { makeServerJsx } from "../lib/jsx.ts";

export const { jsx, jsxs, Fragment } = makeServerJsx(Html, escapeHtml);
export type * from "./types.ts";

// import { escapeHtml } from "@bearmetal/miscellanea";
// import { type BMC, isBMC } from "../lib/bmc.ts";
// import { Html } from "../lib/html.ts";

// const voidElements = new Set([
// 	"area",
// 	"base",
// 	"br",
// 	"col",
// 	"embed",
// 	"hr",
// 	"img",
// 	"input",
// 	"link",
// 	"meta",
// 	"param",
// 	"source",
// 	"track",
// 	"wbr",
// ]);

// function buildAttrs(props: Record<string, unknown>): string {
// 	return Object.entries(props)
// 		.filter(([k]) => k !== "children")
// 		.flatMap(([k, v]) => {
// 			if (v == null || v === false || typeof v === "function") return [];
// 			if (v === true) return [` ${k}`];
// 			return [` ${k}="${escapeHtml(String(v))}"`];
// 		})
// 		.join("");
// }

// function flatChildren(children: unknown): unknown[] {
// 	if (children == null) return [];
// 	if (Array.isArray(children)) {
// 		return (children as unknown[]).flat(Infinity as 0);
// 	}
// 	return [children];
// }

// export async function jsx(
// 	tag: string | ((props: Record<string, unknown>) => Html | Promise<Html>) | typeof BMC,
// 	props: Record<string, unknown>,
// 	_key?: unknown,
// ): Promise<Html> {
// 	const { children, raw, ...rest } = props;
// 	const flat = flatChildren(children);

// 	if (isBMC(tag)) {
// 		if (tag.client) {
// 			return new Html(`<${tag.tag}${buildAttrs(rest)}></${tag.tag}>`);
// 		}

// 		const loaded = tag.serverLoad ? await tag.serverLoad(rest) : {};
// 		const loadedProps = { ...rest, ...loaded };
// 		const serialized = Object.keys(loaded).length
// 			? { ...loadedProps, "data-server-props": btoa(JSON.stringify(loaded)) }
// 			: loadedProps;

// 		const childStr = (await Promise.all(flat.map(raw ? resolveChildRaw : resolveChild))).join("");
// 		const inner = tag.serverRender(loadedProps, childStr);
// 		return new Html(`<${tag.tag}${buildAttrs(serialized)}>${inner}</${tag.tag}>`);
// 	}
// 	if (typeof tag === "function") {
// 		return await tag(props);
// 	}

// 	const attrs = buildAttrs(rest);
// 	if (voidElements.has(tag)) return new Html(`<${tag}${attrs}>`);
// 	const childStr = (await Promise.all(flat.map(resolveChild))).join("");
// 	return new Html(`<${tag}${attrs}>${childStr}</${tag}>`);
// }

// async function resolveChild(c: unknown): Promise<string> {
// 	if (c instanceof Promise) c = await c;
// 	if (c instanceof Html) return c.raw;
// 	if (c == null || c === false) return "";
// 	if (typeof c === "string") return escapeHtml(c);
// 	return escapeHtml(String(c));
// }
// async function resolveChildRaw(c: unknown): Promise<string> {
// 	if (c instanceof Promise) c = await c;
// 	if (c instanceof Html) return c.raw;
// 	if (c == null || c === false) return "";
// 	return String(c);
// }
// export const jsxs = jsx;

// export async function Fragment({ children }: { children?: unknown }): Promise<Html> {
// 	return new Html(
// 		(await Promise.all(flatChildren(children).map(resolveChild))).join(""),
// 	);
// }

// export type * from "./types.ts";
