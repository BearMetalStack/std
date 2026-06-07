const j: typeof import("./client/mod.ts") = (
	typeof document !== "undefined"
		? await import("./client/mod.ts")
		: await import("./server/mod.ts")
) as typeof import("./client/mod.ts");
const Fragment = j.Fragment;
const jsx = j.jsx;
const jsxs = j.jsxs;
export { Fragment, jsx, jsxs };
export { setCurrentOwner, setEffectImpl } from "./lib/jsx.ts";
export type * from "./types.ts";
