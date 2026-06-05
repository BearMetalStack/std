import { Html } from "../lib/html.ts";
import { escapeHtml } from "@bearmetal/miscellanea";
import { makeServerJsx } from "../lib/jsx.ts";

export const { jsx, jsxs, Fragment } = makeServerJsx(Html, escapeHtml);
export type * from "./types.ts";
