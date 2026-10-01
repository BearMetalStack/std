import type { NodeShape, Point, Port, Rect } from "../types.ts";

/** The geometry a solver needs to know about a node. */
export interface NodeGeometry {
	rect: Rect;
	shape: NodeShape;
	/** Corner radius for `roundRect`. */
	radius: number;
}

/** Outward unit normal of each port. */
export const PORT_NORMALS: Record<Port, Point> = {
	top: [0, -1],
	right: [1, 0],
	bottom: [0, 1],
	left: [-1, 0],
	center: [0, 0],
};

/** Center of a rectangle. */
export function center(r: Rect): Point {
	return [r.x + r.w / 2, r.y + r.h / 2];
}

/**
 * The point where a connection attaches to a side. `at` runs `0..1` along the side (left to
 * right, top to bottom); `0.5` is the middle, which lies on every supported shape. Other values
 * stay clear of rounded corners and, for ellipses and diamonds, are projected onto the outline.
 */
export function portPoint(node: NodeGeometry, port: Port, at = 0.5): Point {
	const { x, y, w, h } = node.rect;
	if (port === "center") return center(node.rect);
	const horizontal = port === "top" || port === "bottom";
	const len = horizontal ? w : h;
	const inset = node.shape === "roundRect" ? Math.min(node.radius, len / 2) : 0;
	const along = inset + (len - inset * 2) * Math.max(0, Math.min(1, at));
	const p: Point = port === "top"
		? [x + along, y]
		: port === "bottom"
		? [x + along, y + h]
		: port === "left"
		? [x, y + along]
		: [x + w, y + along];
	if (at === 0.5 || node.shape === "rect" || node.shape === "roundRect") return p;
	return perimeterPoint(node, ...p);
}

/**
 * Where the ray from the node's center toward `(tx, ty)` leaves its outline. Rounded corners are
 * honoured, so arrowheads sit on the curve rather than floating off it.
 */
export function perimeterPoint(node: NodeGeometry, tx: number, ty: number): Point {
	const [cx, cy] = center(node.rect);
	const hw = node.rect.w / 2, hh = node.rect.h / 2;
	const dx = tx - cx, dy = ty - cy;
	if ((dx === 0 && dy === 0) || hw <= 0 || hh <= 0) return [cx, cy];
	switch (node.shape) {
		case "ellipse": {
			const t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
			return [cx + dx * t, cy + dy * t];
		}
		case "diamond": {
			const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
			return [cx + dx * t, cy + dy * t];
		}
		default: {
			const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
			const px = dx * t, py = dy * t;
			const r = node.shape === "roundRect" ? Math.min(node.radius, hw, hh) : 0;
			if (r > 0 && Math.abs(px) > hw - r && Math.abs(py) > hh - r) {
				const ccx = Math.sign(px) * (hw - r), ccy = Math.sign(py) * (hh - r);
				const len = Math.hypot(dx, dy);
				const ux = dx / len, uy = dy / len;
				const b = ux * ccx + uy * ccy;
				const c = ccx * ccx + ccy * ccy - r * r;
				const disc = b * b - c;
				if (disc >= 0) {
					const s = b + Math.sqrt(disc);
					return [cx + ux * s, cy + uy * s];
				}
			}
			return [cx + px, cy + py];
		}
	}
}

/** Picks facing sides for two nodes: horizontal when they are separated more across x than y. */
export function autoPorts(a: Rect, b: Rect): [Exclude<Port, "center">, Exclude<Port, "center">] {
	const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
	const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
	const [ax, ay] = center(a), [bx, by] = center(b);
	if (gapX >= gapY) return bx >= ax ? ["right", "left"] : ["left", "right"];
	return by >= ay ? ["bottom", "top"] : ["top", "bottom"];
}
