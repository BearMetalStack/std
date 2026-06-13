import type { Fn } from "./function/mod.ts";

export type TemplateArgs = [template: TemplateStringsArray, ...substitutions: unknown[]];
export type TagFn = Fn<TemplateArgs, string>;
