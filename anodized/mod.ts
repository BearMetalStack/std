/**
 * @module
 * BearMetal Anodized — a small immediate-mode canvas on WebGPU for charts, diagrams and node
 * graphs. Give it coordinates, sizes, connections and content each frame; it fits curves, routes
 * connectors, lays out text, handles opt-in drag/resize handles and zooms without limit. Render
 * to a canvas, or headless (Deno has WebGPU unflagged) with `snapshot()` for PNGs.
 *
 * ```ts
 * import { createHeadless } from "@bearmetal/anodized";
 *
 * const a = await createHeadless({ width: 400, height: 300 });
 * const img = await a.snapshot((f) => {
 * 	f.node({ id: "a", x: 0, y: 0, w: 120, h: 48 });
 * 	f.node({ id: "b", x: 220, y: 120, w: 120, h: 48 });
 * 	f.connect("a", "b");
 * });
 * await Deno.writeFile("graph.png", await img.png());
 * a.destroy();
 * ```
 */

export * from "./types.ts";
export { Anodized, createAnodized, createHeadless } from "./core/anodized.ts";
export { Camera } from "./core/camera.ts";
export { Frame } from "./core/frame.ts";
export { parseColor } from "./core/color.ts";
export { linearScale, niceStep, niceTicks } from "./core/scale.ts";
export { Path } from "./geometry/path.ts";
export { Font, loadFont, parseFont } from "./text/ttf.ts";
export { layoutText, measureText, textPath } from "./text/layout.ts";
export { encodePng } from "./snapshot/png.ts";
export { decodePng } from "./image/png.ts";
export { loadImage } from "./image/load.ts";
export { fitImage, imageSize } from "./image/source.ts";
export { createWebGPUBackend, hasWebGPU, WebGPUBackend } from "./gpu/webgpu.ts";
