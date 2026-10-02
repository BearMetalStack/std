# @bearmetal/anodized

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fanodized&valueColor=info)](https://jsr.io/@bearmetal/anodized)

A small immediate-mode canvas on WebGPU, for charts, diagrams and node graphs. Each frame you hand
it coordinates, sizes, connections and content; it fits the curves, routes the connectors, lays out
the text and paints one frame buffer. Zero dependencies.

```ts
import { createAnodized, loadFont } from "@bearmetal/anodized";

const a = await createAnodized(canvas, { font: await loadFont("/Inter.ttf") });
a.viewport(); // wheel zoom + drag pan

const nodes = [
	{ id: "a", label: "Start", x: 0, y: 0, w: 120, h: 48 },
	{ id: "b", label: "Done", x: 240, y: 120, w: 120, h: 48 },
];

a.loop((f) => {
	for (const n of nodes) {
		const h = f.node({ ...n, handles: true });
		if (h.changed) Object.assign(n, h.pos, h.size);
	}
	f.connect("a", "b", { label: "next" });
});
```

## Immediate mode

There is no scene graph. The draw callback describes the whole picture from your own data every time
it runs, and nothing you pass in is kept. The only state carried between frames is which object is
hovered and which one is being dragged.

Interaction is opt-in per object, ImGui style. Give a shape an `id` to get hover tracking and
clicks, and add `handles` to make it movable and resizable. Each call returns an object with
`hovered`, `dragging`, `resizing`, `pos`, `size` and `changed`, and you decide whether to write the
new position back.

`loop()` only redraws when something changed: input, the camera, the canvas size, or a call to
`invalidate()`.

## Clicks

A press and release of any mouse button that doesn't turn into a drag, pan or resize (the pointer
stays within 4px) dispatches a bubbling `anode:click` event on the canvas:

```ts
a.onClick(({ hit, target, button }) => {
	if (hit) console.log(`clicked ${target!.id}`, target!.data);
});

// or listen yourself; JSR doesn't allow augmenting the DOM event map, so cast
canvas.addEventListener("anode:click", (e) => {
	const { hit, target, button, x, y } = (e as AnodeClickEvent).detail;
});
```

`target` is the topmost object drawn with an `id` under the pointer in the most recent frame, tested
against its real outline (ellipses and diamonds included). It carries `id`, `kind`
(`node`/`rect`/`circle`/`ellipse`), `shape`, the drawn bounds, the node's `label`, and whatever you
passed as `data`. `x`/`y` are the world point; `screenX`/`screenY` are canvas pixels.
`a.hitTest(screenX, screenY)` gives the same answer on demand, headless too.

### Clicking lines

When the topmost thing under a click is a clickable line, `anode:lineclick` fires **instead of**
`anode:click`. That way `hit: false` still means empty space. Connections are always clickable;
their id is `"<from>-><to>"` unless you pass one. A connection's label counts as part of it. `line`,
`polyline`, `series` and stroked `path`s need an `id`.

```ts
a.onLineClick(({ target, point, segment, along, fraction }) => {
	if (target!.kind === "connection") splitEdge(target!.from!, target!.to!, point!);
	if (target!.id === "plot") addEvent({ after: segment, at: fraction, ...point });
});
```

The detail fields:

- `point`: the closest spot on the line, in world units.
- `segment`: for `line`, `polyline` and `series`, the interval between point `segment` and
  `segment + 1`; for paths and connections, the path segment.
- `along`: distance from the line's start, in world units.
- `fraction`: `along` divided by the line's total length.

A hit is anything within half the stroke width plus 4px, measured on screen, so thin lines stay
clickable at any zoom. Lines and shapes share one paint order: a node drawn over the end of an edge
wins there. `a.hitTestLine(x, y)` gives the same answer on demand.

### Overlaying HTML

Every target carries `screen`, its box in CSS pixels relative to the canvas at the current pan and
zoom. Line targets also carry `labelScreen` when the connection has a label. Put the canvas in a
`position: relative` wrapper and an absolutely positioned element lands exactly on the object:

```ts
a.onClick(({ target }) => {
	if (target?.kind !== "node") return;
	const { x, y, w, h } = target.screen;
	const input = Object.assign(document.createElement("input"), { value: target.label ?? "" });
	Object.assign(input.style, {
		position: "absolute",
		left: `${x}px`,
		top: `${y}px`,
		width: `${w}px`,
		height: `${h}px`,
		fontSize: `${14 * a.camera.scale}px`, // world units to pixels
	});
	canvas.parentElement!.append(input);
});
```

`screen` is a snapshot, taken at the moment of the click. To keep an overlay pinned while the user
pans or zooms, keep the world box (`target.x`, `y`, `w`, `h`) and reposition it with
`a.camera.rectToScreen(box)` from your draw callback, which `loop()` reruns whenever the camera
moves.

## What you can draw

| call                                | notes                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `rect`, `circle`, `ellipse`         | fill, stroke, corner radius; accept `id`/`handles`                                            |
| `line`, `polyline`, `polygon`       | joins (miter/round/bevel), caps, dashes, `nonzero`/`evenodd`                                  |
| `path(new Path()…)`                 | lines, quadratic/cubic Béziers, arcs, `arcTo`, round rects                                    |
| `text`                              | vector glyphs from a TrueType font, kerning, word wrap, alignment                             |
| `node`                              | rect / round rect / ellipse / diamond with a centered, wrapped label                          |
| `connect(from, to)`                 | routed connector with arrowheads and an optional label                                        |
| `series(points)`                    | fitted curve, optional area fill and point markers                                            |
| `dotGrid({ size, spacing, color })` | background dots: spacing in world units, size in screen pixels; thins out when zoomed far out |

### Local coordinates

`f.local(x, y, draw)` runs `draw` with the origin moved to `(x, y)`, so a group of shapes can be
laid out relative to its own corner and placed as a unit:

```ts
for (const card of cards) {
	f.local(card.x, card.y, (f) => {
		f.rect({ x: 0, y: 0, w: 200, h: 120, radius: 8, fill: "#fff", stroke: "#cbd5e1" });
		f.text(card.title, { x: 12, y: 12, baseline: "top", size: 16 });
		const h = f.rect({ id: `${card.id}:badge`, ...card.badge, fill: "#f59e0b", handles: true });
		if (h.changed) Object.assign(card.badge, h.pos, h.size); // still relative to the card
	});
}
```

- Spaces nest, and their offsets add up. `f.origin` gives the current origin in world coordinates.
- What you get back is local too: `HandleResult.pos` and `f.pointer`.
- Node ids stay global, so `connect()` can join nodes drawn in different local spaces.
- Sizes, stroke widths and `dotGrid()` are not affected.

Stroke widths are in screen pixels by default, so lines stay crisp as you zoom. Set
`scaleWidth: true` to make them scale with the world instead. `linearScale()` and `niceTicks()`
cover the arithmetic for chart axes.

## Line solvers

- **Connectors** route `orthogonal` (the default), `bezier` or `straight`.
  - Orthogonal routes run A\* over a sparse grid built from every node's edges, with a bend penalty.
    They never cross a node, and keep `margin` clearance where there is room for it.
  - Connections may be declared before the nodes they reference.
  - Several connections on one side of a node are spread along that side.
  - Labels are drawn above every line.
  - Arrowheads: `triangle`, `arrow`, `circle`, `diamond`.
- **Series** curves: `monotone` (Fritsch–Carlson, never overshoots; the default), `catmullRom`,
  `linear`, and three step variants.
- **Strokes** are tessellated on the CPU and drawn through a stencil union, so a translucent line
  that crosses itself never blends twice.

Everything under `@bearmetal/anodized/solvers` is a pure function, so it is usable without a GPU.

## Zoom has no built-in limit

The camera stores zoom as `log2(scale)`, so it never overflows. All tessellation happens on the CPU
in float64, relative to the camera, and is clipped to the viewport before narrowing to float32 for
the GPU. Curves are flattened to a quarter-pixel tolerance at whatever zoom you are at, and a curve
whose hull is off-screen collapses to a few points.

That leaves one real limit: the float64 precision of your own coordinates. An offset of 2⁻⁶⁰ means
something near zero but nothing near 10⁵.

## Snapshots

```ts
import { createHeadless } from "@bearmetal/anodized";

const a = await createHeadless({ width: 1, height: 1, font });
const img = await a.snapshot(draw, { scale: 2, background: "#fff" });
await Deno.writeFile("chart.png", await img.png());
a.destroy();
```

`snapshot()` renders everything the callback draws, fitted to its bounds, regardless of the camera.
Large images are rendered in tiles and stitched together. If the GPU refuses an allocation, the
tiles shrink. You get raw straight-alpha RGBA in `pixels`, plus `png()`, a zero-dependency encoder
built on `CompressionStream`.

Deno exposes WebGPU without any flag, so this runs from a plain `deno run` on a server. The same
call works in a browser.

## Text

Fonts are TrueType files you load yourself: `await loadFont(urlOrBytes)`. Nothing is bundled. Glyphs
go through the same vector pipeline as shapes, so text looks the same in Deno and the browser and
stays sharp at any zoom.

- Supported: `glyf` outlines (simple and composite), `cmap` formats 4 and 12, and the `kern` table.
- Not yet supported: CFF-outline `.otf` files (rejected with a clear error), GPOS kerning,
  bidirectional text and complex shaping.

## Rendering

- One render pass per frame: 4× MSAA color plus a stencil buffer, painted in call order.
- Arbitrary fills use stencil-then-cover; convex shapes skip the stencil.
- WebGPU is the only backend today. The `Backend` interface is where a WebGL2 fallback would go.

## Example

`examples/flowchart` holds one scene rendered two ways:

- `deno task snapshot` writes `flowchart.png` headless;
- `deno task serve` serves an interactive version on `http://127.0.0.1:8123`, with draggable nodes,
  wheel zoom and drag pan.
