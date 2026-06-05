const { jsx, jsxs, Fragment } = (
	typeof document !== "undefined"
		? await import("./client/mod.ts")
		: await import("./server/mod.ts")
) as typeof import("./client/mod.ts");

export { Fragment, jsx, jsxs };
export { setCurrentOwner, setEffectImpl } from "./lib/jsx.ts";
export type * from "./types.ts";
