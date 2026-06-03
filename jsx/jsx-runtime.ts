import { Html } from "./lib/html.ts";
import { escapeHtml } from "@bearmetal/miscellanea";
import {
	clientFragment,
	clientJsx,
	makeServerJsx,
	setCurrentOwner,
	setEffectImpl,
} from "./lib/jsx.ts";

const { jsx: serverJsx, jsxs: serverJsxs, Fragment: serverFragment } = makeServerJsx(
	Html,
	escapeHtml,
);

export const jsx = typeof document !== "undefined" ? clientJsx : serverJsx;
export const jsxs = typeof document !== "undefined" ? clientJsx : serverJsxs;
export const Fragment = typeof document !== "undefined" ? clientFragment : serverFragment;
export { setCurrentOwner, setEffectImpl };
export type * from "./types.ts";
