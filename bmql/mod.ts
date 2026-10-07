/**
 * @module
 * BMQL: a small query language for JSON-shaped data, structured or not.
 *
 * Every step yields a set; arrays flatten into it, missing keys contribute
 * nothing, and whoever consumes the result decides how many members it wants.
 *
 * ```ts
 * import { values } from "@bearmetal/bmql";
 *
 * values(data, "characters{name:Sel}.properties{key:backstory}.value");
 * values(data, "characters{class:rogue}[0].name");
 * values(data, "characters{level:>3, name:~se}[-1]");
 * ```
 */

export * from "./types.ts";
export { BmqlSyntaxError, parse, parseAt, parsePipeline, parsePipelineAt } from "./parser.ts";
export { format, hasTemplate } from "./format.ts";
export { evaluate, values } from "./evaluate.ts";
export { compute, computeText, computeValues } from "./signals.ts";
export { unwrapSignal } from "./unwrap.ts";
