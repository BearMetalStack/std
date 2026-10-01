import type {
	Bounds,
	CircleOptions,
	Clickable,
	ColorInput,
	ConnectOptions,
	DotGridOptions,
	EllipseOptions,
	HandleResult,
	Interactive,
	LineHitKind,
	NodeOptions,
	Point,
	Port,
	Rect,
	RectOptions,
	SeriesOptions,
	ShapeStyle,
	TextOptions,
} from "../types.ts";
import type { Camera } from "./camera.ts";
import { command, type DrawCommand, resolveStyle } from "./commands.ts";
import { Path } from "../geometry/path.ts";
import type { Font } from "../text/ttf.ts";
import { layoutText, measureText, type TextLayout, textPath } from "../text/layout.ts";
import type { HandleManager, HitMeta } from "../interact/handles.ts";
import { areaPath, curvePath } from "../solvers/curves.ts";
import type { NodeGeometry } from "../solvers/anchors.ts";
import {
	resolvePorts,
	type Route,
	routeMidpoint,
	routePath,
	solveRoute,
	trimRoute,
} from "../solvers/route.ts";
import { center } from "../solvers/anchors.ts";

/** Everything a frame needs from the instance that runs it. */
export interface FrameContext {
	camera: Camera;
	font?: Font;
	handles: HandleManager | null;
	routeCache: Map<string, Route>;
	/** Opaque color used behind connection labels. */
	background: ColorInput;
}

interface Connection {
	from: string;
	to: string;
	opts: ConnectOptions;
	/** Filled in by port spreading before routing. */
	fromPort?: Port;
	toPort?: Port;
	fromAt?: number;
	toAt?: number;
	/** Paint order for hit-testing. */
	z?: number;
}

interface Resolved {
	lines: DrawCommand[];
	labels: DrawCommand[];
}

type Entry = { cmd: DrawCommand } | { conn: Connection };

const NODE_DEFAULTS: ShapeStyle = { fill: "#ffffff", stroke: "#374151", strokeWidth: 1.5 };
const CONNECT_DEFAULTS: ShapeStyle = { stroke: "#4b5563", strokeWidth: 1.5, join: "round" };
const SERIES_DEFAULTS: ShapeStyle = {
	stroke: "#2563eb",
	strokeWidth: 2,
	join: "round",
	cap: "round",
};

const warned = new Set<string>();
function warnOnce(msg: string): void {
	if (warned.has(msg)) return;
	warned.add(msg);
	console.warn(`anodized: ${msg}`);
}

/**
 * The immediate-mode drawing API handed to a draw callback. Every call records into the frame
 * in world coordinates; nothing touches the GPU until the callback returns. Calls are cheap:
 * build the whole scene from your own data every frame.
 */
export class Frame {
	readonly camera: Camera;
	/** The instance's default font, if any. */
	readonly font: Font | undefined;
	/** The pointer in world coordinates, or `null` when it is not over the canvas. */
	readonly pointer: { x: number; y: number } | null;
	#ctx: FrameContext;
	#entries: Entry[] = [];
	#below: Connection[] = [];
	#nodes = new Map<string, NodeGeometry>();
	#firstNode = -1;
	#firstNodeZ: number | undefined;

	constructor(ctx: FrameContext, pointer: { x: number; y: number } | null = null) {
		this.#ctx = ctx;
		this.camera = ctx.camera;
		this.font = ctx.font;
		this.pointer = pointer;
	}

	/** Screen pixels per world unit at the moment. Handy for sizing things in pixels. */
	get scale(): number {
		return this.camera.scale;
	}

	#push(path: Path, style: ShapeStyle, convex = false, defaults?: ShapeStyle): void {
		if (path.empty) return;
		this.#entries.push({ cmd: command(path, resolveStyle(style, defaults), convex) });
	}

	#interact(
		o: Interactive,
		meta: Omit<HitMeta, "data">,
		x: number,
		y: number,
		w: number,
		h: number,
	): HandleResult {
		if (o.id && this.#ctx.handles) {
			return this.#ctx.handles.interact(o.id, { x, y, w, h }, o.handles, { ...meta, data: o.data });
		}
		return {
			hovered: false,
			dragging: false,
			resizing: false,
			pos: { x, y },
			size: { w, h },
			changed: false,
		};
	}

	/** A rectangle, optionally rounded. With `id` it is hit-tested; with `handles` it can be dragged and resized. */
	rect(o: RectOptions): HandleResult {
		const shape = o.radius ? "roundRect" : "rect";
		const r = this.#interact(o, { kind: "rect", shape }, o.x, o.y, o.w, o.h);
		const { x, y } = r.pos, { w, h } = r.size;
		const path = o.radius
			? new Path().roundRect(x, y, w, h, o.radius)
			: new Path().rect(x, y, w, h);
		this.#push(path, o, true);
		return r;
	}

	/** A circle. Handles resize it by its bounding box. */
	circle(o: CircleOptions): HandleResult {
		const r = this.#interact(
			o,
			{ kind: "circle", shape: "ellipse" },
			o.x - o.r,
			o.y - o.r,
			o.r * 2,
			o.r * 2,
		);
		const rad = Math.min(r.size.w, r.size.h) / 2;
		this.#push(new Path().circle(r.pos.x + r.size.w / 2, r.pos.y + r.size.h / 2, rad), o, true);
		return r;
	}

	/** An axis-aligned ellipse. */
	ellipse(o: EllipseOptions): HandleResult {
		const r = this.#interact(
			o,
			{ kind: "ellipse", shape: "ellipse" },
			o.x - o.rx,
			o.y - o.ry,
			o.rx * 2,
			o.ry * 2,
		);
		const { w, h } = r.size;
		this.#push(new Path().ellipse(r.pos.x + w / 2, r.pos.y + h / 2, w / 2, h / 2), o, true);
		return r;
	}

	/** A closed polygon. */
	polygon(points: readonly Point[], style: ShapeStyle): void {
		this.#push(new Path().poly(points, true), style);
	}

	/**
	 * A background grid of dots. Spacing is in world units, so the grid moves with the content;
	 * dot size is in screen pixels, so dots stay crisp at any zoom. When zoomed far out the grid
	 * thins to every second, fourth, … dot rather than turning into a carpet. Call it first to
	 * draw it behind everything else. Snapshots get a grid covering the whole image.
	 */
	dotGrid(o: DotGridOptions = {}): void {
		this.#entries.push({
			cmd: {
				path: new Path(),
				style: resolveStyle({}),
				convex: false,
				bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
				grid: { ...o },
			},
		});
	}

	/** A single line segment. With `id` it is clickable via `anode:lineclick`. */
	line(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		style: ShapeStyle & Clickable = {},
	): void {
		const path = new Path().moveTo(x1, y1).lineTo(x2, y2);
		this.#push(path, { stroke: "#000", ...style, fill: undefined });
		this.#clickable(path, style, "line");
	}

	/** An open polyline. With `id` it is clickable via `anode:lineclick`. */
	polyline(points: readonly Point[], style: ShapeStyle & Clickable = {}): void {
		const path = new Path().poly(points);
		this.#push(path, { stroke: "#000", ...style, fill: undefined });
		this.#clickable(path, style, "polyline");
	}

	/** Any {@linkcode Path}. With `id`, its outline is clickable via `anode:lineclick`. */
	path(path: Path, style: ShapeStyle & Clickable): void {
		this.#push(path, style);
		this.#clickable(path, style, "path");
	}

	#clickable(
		path: Path,
		style: ShapeStyle & Clickable,
		kind: LineHitKind,
		perInterval = 1,
		defaults: ShapeStyle = {},
	): void {
		const handles = this.#ctx.handles;
		if (!style.id || !handles || path.empty) return;
		handles.addLine({
			target: { id: style.id, kind, data: style.data },
			path,
			strokeWidth: style.strokeWidth ?? defaults.strokeWidth ?? 1,
			scaleWidth: style.scaleWidth ?? false,
			perInterval,
		});
	}

	/**
	 * Text, drawn as vector glyphs. Needs a font, from the options or the instance.
	 * Returns the layout so you can size things around it.
	 */
	text(str: string, o: TextOptions): TextLayout | null {
		const font = o.font ?? this.font;
		if (!font) {
			warnOnce("text() needs a font: pass one in the options or to createAnodized()");
			return null;
		}
		const layout = layoutText(font, str, {
			size: o.size,
			maxWidth: o.maxWidth,
			lineHeight: o.lineHeight,
		});
		const path = textPath(font, layout, o.x, o.y, o.align, o.baseline);
		this.#push(path, { fill: o.fill ?? "#000", opacity: o.opacity });
		return layout;
	}

	/** Width of a line of text in world units. */
	measureText(str: string, size = 14, font: Font | undefined = this.font): number {
		return font ? measureText(font, str, size) : 0;
	}

	/**
	 * A diagram node: a shape with a centered, wrapped label that connections can attach to by
	 * `id`. Handles drag and resize it; connections follow during the drag.
	 */
	node(o: NodeOptions): HandleResult {
		const shape = o.shape ?? "roundRect";
		if (this.#firstNodeZ === undefined) this.#firstNodeZ = this.#ctx.handles?.z;
		const r = this.#interact(o, { kind: "node", shape, label: o.label }, o.x, o.y, o.w, o.h);
		const { x, y } = r.pos, { w, h } = r.size;
		const radius = o.radius ?? 6;
		if (this.#firstNode < 0) this.#firstNode = this.#entries.length;
		this.#nodes.set(o.id, { rect: { x, y, w, h }, shape, radius });
		const path = new Path();
		switch (shape) {
			case "rect":
				path.rect(x, y, w, h);
				break;
			case "ellipse":
				path.ellipse(x + w / 2, y + h / 2, w / 2, h / 2);
				break;
			case "diamond":
				path.poly([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]], true);
				break;
			default:
				path.roundRect(x, y, w, h, radius);
		}
		this.#push(path, o, true, NODE_DEFAULTS);
		if (o.label) {
			const pad = o.padding ?? 8;
			const inset = shape === "ellipse" || shape === "diamond" ? 0.7 : 1;
			this.text(o.label, {
				fill: "#111827",
				...o.labelStyle,
				x: x + w / 2,
				y: y + h / 2,
				align: "center",
				baseline: "middle",
				maxWidth: Math.max(1, w * inset - pad * 2),
			});
		}
		return r;
	}

	/**
	 * Connects two nodes by id. Nodes may be declared before or after; routing happens once the
	 * frame is complete, avoiding every node. Missing ids are skipped with a warning.
	 */
	connect(from: string, to: string, opts: ConnectOptions = {}): void {
		const conn: Connection = { from, to, opts };
		if ((opts.layer ?? "below") === "below") this.#below.push(conn);
		else {
			conn.z = this.#ctx.handles?.nextZ();
			this.#entries.push({ conn });
		}
	}

	/** A data series: a fitted curve, with an optional filled area and point markers. */
	series(points: readonly Point[], o: SeriesOptions = {}): void {
		if (!points.length) return;
		const curve = o.curve ?? "monotone";
		if (o.area) {
			const base = o.area.baseline ?? Math.max(...points.map((p) => p[1]));
			this.#push(areaPath(points, base, curve, o.tension), {
				fill: o.area.fill,
				opacity: o.area.opacity,
			});
		}
		const line = curvePath(points, curve, o.tension);
		this.#push(line, { ...o, fill: undefined }, false, SERIES_DEFAULTS);
		const perInterval = curve === "stepMiddle"
			? 3
			: curve === "stepBefore" || curve === "stepAfter"
			? 2
			: 1;
		this.#clickable(line, o, "series", perInterval, SERIES_DEFAULTS);
		if (o.markers) {
			const r = (o.markers.r ?? 3) / this.scale;
			const fill = o.markers.fill ?? o.stroke ?? SERIES_DEFAULTS.stroke;
			const path = new Path();
			for (const [x, y] of points) path.circle(x, y, r);
			this.#push(path, { fill, stroke: o.markers.stroke, strokeWidth: 1.5 });
		}
	}

	#resolveConnection(
		c: Connection,
		obstacles: NodeGeometry["rect"][],
		sig: string,
		z?: number,
	): Resolved {
		const from = this.#nodes.get(c.from), to = this.#nodes.get(c.to);
		if (!from || !to) {
			warnOnce(`connect(${JSON.stringify(c.from)}, ${JSON.stringify(c.to)}): no node with that id`);
			return { lines: [], labels: [] };
		}
		const o = c.opts;
		const kind = o.route ?? "orthogonal";
		const margin = o.margin ?? 16;
		const key = [
			kind,
			c.fromPort ?? o.fromPort,
			c.toPort ?? o.toPort,
			c.fromAt,
			c.toAt,
			margin,
			Object.values(from.rect),
			Object.values(to.rect),
			from.shape,
			to.shape,
			sig,
		].join("|");
		let route = this.#ctx.routeCache.get(key);
		if (!route) {
			route = solveRoute({
				from,
				to,
				kind,
				fromPort: c.fromPort ?? o.fromPort,
				toPort: c.toPort ?? o.toPort,
				fromAt: c.fromAt,
				toAt: c.toAt,
				margin,
				obstacles,
			});
			this.#ctx.routeCache.set(key, route);
		}
		this.#usedRoutes.add(key);

		const arrow = o.arrow ?? "end";
		const head = o.head ?? "triangle";
		const size = o.headSize ?? 10;
		const trim = head === "arrow"
			? 0
			: head === "circle"
			? size * 0.8
			: head === "diamond"
			? size * 1.4
			: size;
		const atStart = arrow === "start" || arrow === "both";
		const atEnd = arrow === "end" || arrow === "both";
		const t = trimRoute(route, atStart ? trim : 0, atEnd ? trim : 0);
		const style = resolveStyle(o, CONNECT_DEFAULTS);
		const out: DrawCommand[] = [];
		const labels: DrawCommand[] = [];
		const drawn = routePath(t.route, kind === "orthogonal" ? o.cornerRadius ?? 6 : 0);
		out.push(command(drawn, { ...style, fill: null }));
		let labelRect: Rect | undefined;
		const color = style.stroke;
		if (color) {
			const tip = (end: Point, dir: Point) => this.#arrowHead(head, end, dir, size, style);
			if (atStart) out.push(tip(route.points[0], t.startDir));
			if (atEnd) out.push(tip(route.points[route.points.length - 1], t.endDir));
		}
		if (o.label) {
			const font = o.labelStyle?.font ?? this.font;
			if (!font) warnOnce("connection labels need a font");
			else {
				const [mx, my] = routeMidpoint(route);
				const size = o.labelStyle?.size ?? 12;
				const layout = layoutText(font, o.label, { size, maxWidth: o.labelStyle?.maxWidth });
				const pad = size * 0.3;
				const bg = resolveStyle({ fill: o.labelBackground ?? this.#ctx.background });
				labelRect = {
					x: mx - layout.width / 2 - pad,
					y: my - layout.height / 2 - pad / 2,
					w: layout.width + pad * 2,
					h: layout.height + pad,
				};
				labels.push(command(
					new Path().roundRect(labelRect.x, labelRect.y, labelRect.w, labelRect.h, pad),
					bg,
					true,
				));
				labels.push(command(
					textPath(font, layout, mx, my, "center", "middle"),
					resolveStyle({ fill: o.labelStyle?.fill ?? "#374151", opacity: o.labelStyle?.opacity }),
				));
			}
		}
		this.#ctx.handles?.addLine({
			target: {
				id: o.id ?? `${c.from}->${c.to}`,
				kind: "connection",
				from: c.from,
				to: c.to,
				label: o.label,
				data: o.data,
			},
			path: drawn,
			strokeWidth: style.strokeWidth,
			scaleWidth: style.scaleWidth,
			perInterval: 1,
			z: c.z ?? z,
			label: labelRect,
		});
		return { lines: out, labels };
	}

	#arrowHead(
		head: NonNullable<ConnectOptions["head"]>,
		[x, y]: Point,
		[dx, dy]: Point,
		size: number,
		style: ReturnType<typeof resolveStyle>,
	): DrawCommand {
		const nx = -dy, ny = dx;
		const p = new Path();
		const at = (back: number, side: number): [number, number] => [
			x - dx * back + nx * side,
			y - dy * back + ny * side,
		];
		const fill = { ...style, fill: style.stroke, stroke: null, dash: null };
		switch (head) {
			case "arrow":
				p.poly([at(size, size * 0.5), [x, y], at(size, -size * 0.5)]);
				return command(p, { ...style, fill: null, dash: null, join: "miter", cap: "round" });
			case "circle": {
				const r = size * 0.4;
				const [cx, cy] = at(r, 0);
				return command(p.circle(cx, cy, r), fill, true);
			}
			case "diamond":
				p.poly([
					[x, y],
					at(size * 0.7, size * 0.35),
					at(size * 1.4, 0),
					at(size * 0.7, -size * 0.35),
				], true);
				return command(p, fill, true);
			default:
				p.poly([[x, y], at(size, size * 0.4), at(size, -size * 0.4)], true);
				return command(p, fill, true);
		}
	}

	#usedRoutes = new Set<string>();

	/**
	 * Resolves connections and returns the commands in paint order. Prunes route-cache entries
	 * that were not used this frame.
	 */
	finish(): DrawCommand[] {
		const obstacles = [...this.#nodes.values()].map((n) => n.rect);
		const sig = obstacles.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(";");
		const inline = this.#entries.flatMap((e) => ("conn" in e ? [e.conn] : []));
		this.#spreadPorts([...this.#below, ...inline]);
		// Connections drawn below the nodes sit just under the first node in paint order.
		const base = (this.#firstNodeZ ?? this.#ctx.handles?.z ?? 0) - 0.5;
		const below = this.#below.map((c, k, all) =>
			this.#resolveConnection(c, obstacles, sig, base + (k * 0.4) / all.length)
		);
		const belowCmds = [...below.flatMap((r) => r.lines), ...below.flatMap((r) => r.labels)];
		const out: DrawCommand[] = [];
		this.#entries.forEach((e, i) => {
			if (i === this.#firstNode) out.push(...belowCmds);
			if ("cmd" in e) out.push(e.cmd);
			else {
				const r = this.#resolveConnection(e.conn, obstacles, sig);
				out.push(...r.lines, ...r.labels);
			}
		});
		if (this.#firstNode < 0 || this.#firstNode >= this.#entries.length) out.push(...belowCmds);
		const cache = this.#ctx.routeCache;
		for (const k of cache.keys()) if (!this.#usedRoutes.has(k)) cache.delete(k);
		return out;
	}

	/**
	 * When several connections leave or enter the same side of a node, spreads their attachment
	 * points along that side, ordered by where the other end sits, so routes don't pile up.
	 */
	#spreadPorts(conns: Connection[]): void {
		const groups = new Map<string, { c: Connection; end: "from" | "to"; key: number }[]>();
		for (const c of conns) {
			if ((c.opts.route ?? "orthogonal") === "straight") continue;
			const from = this.#nodes.get(c.from), to = this.#nodes.get(c.to);
			if (!from || !to) continue;
			const [fp, tp] = resolvePorts(from.rect, to.rect, c.opts.fromPort, c.opts.toPort);
			c.fromPort = fp;
			c.toPort = tp;
			for (
				const [end, id, port, other] of [
					["from", c.from, fp, to],
					["to", c.to, tp, from],
				] as const
			) {
				const [ox, oy] = center(other.rect);
				const k = `${id}|${port}`;
				const list = groups.get(k) ?? [];
				list.push({ c, end, key: port === "top" || port === "bottom" ? ox : oy });
				groups.set(k, list);
			}
		}
		for (const list of groups.values()) {
			if (list.length < 2) continue;
			list.sort((a, b) => a.key - b.key);
			list.forEach((item, i) => {
				const at = (i + 1) / (list.length + 1);
				if (item.end === "from") item.c.fromAt = at;
				else item.c.toAt = at;
			});
		}
	}
}

/** Union of command bounds, grown by each stroke's half-width in world units at `scale`. */
export function commandBounds(cmds: readonly DrawCommand[], scale: number): Bounds | null {
	let b: Bounds | null = null;
	for (const c of cmds) {
		if (!c.style.fill && !c.style.stroke) continue;
		const hw = c.style.stroke
			? (c.style.strokeWidth / 2) * (c.style.scaleWidth ? 1 : 1 / scale) *
				Math.max(1, Math.min(c.style.miterLimit, 2))
			: 0;
		const cb = c.bounds;
		if (!Number.isFinite(cb.minX)) continue;
		if (!b) b = { minX: cb.minX - hw, minY: cb.minY - hw, maxX: cb.maxX + hw, maxY: cb.maxY + hw };
		else {
			b.minX = Math.min(b.minX, cb.minX - hw);
			b.minY = Math.min(b.minY, cb.minY - hw);
			b.maxX = Math.max(b.maxX, cb.maxX + hw);
			b.maxY = Math.max(b.maxY, cb.maxY + hw);
		}
	}
	return b;
}
