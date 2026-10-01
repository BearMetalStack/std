import { type Frame, linearScale, type NodeShape, type Point } from "@bearmetal/anodized";

interface Box {
	id: string;
	label: string;
	x: number;
	y: number;
	w: number;
	h: number;
	shape?: NodeShape;
}

/** The app's own data. The canvas never stores it; it is redrawn from here every frame. */
export const boxes: Box[] = [
	{ id: "req", label: "Request", x: 0, y: 40, w: 120, h: 48 },
	{ id: "auth", label: "Signed in?", x: 180, y: 28, w: 130, h: 72, shape: "diamond" },
	{ id: "login", label: "Show login", x: 185, y: 170, w: 120, h: 48 },
	{ id: "cache", label: "Cache", x: 400, y: 200, w: 90, h: 90, shape: "ellipse" },
	{ id: "render", label: "Render page", x: 380, y: 40, w: 130, h: 48 },
];

const edges: [string, string, string?][] = [
	["req", "auth"],
	["auth", "render", "yes"],
	["auth", "login", "no"],
	["login", "req"],
	["cache", "render"],
];

const visits: Point[] = [3, 7, 4, 9, 12, 10, 15, 13, 18, 22, 19, 25].map((v, i) => [i, v]);

/** Draws the whole scene. With `interactive`, nodes get drag/resize handles. */
export function scene(f: Frame, interactive = false): void {
	f.dotGrid();
	for (const b of boxes) {
		const r = f.node({ ...b, handles: interactive, fill: "#f8fafc", stroke: "#334155" });
		if (r.changed) Object.assign(b, r.pos, r.size);
	}
	for (const [from, to, label] of edges) {
		f.connect(from, to, { label, route: from === "cache" ? "bezier" : "orthogonal" });
	}
	chart(f, { x: 0, y: 400, w: 520, h: 220 });
}

function chart(f: Frame, box: { x: number; y: number; w: number; h: number }): void {
	const pad = 36;
	const x = linearScale([0, visits.length - 1], [box.x + pad, box.x + box.w - 12]);
	const y = linearScale([0, 30], [box.y + box.h - pad + 12, box.y + 44]);
	f.rect({ ...box, fill: "#ffffff", stroke: "#e2e8f0", radius: 8 });
	f.text("Visits per month", { x: box.x + 12, y: box.y + 8, size: 13, fill: "#334155" });
	for (const t of y.ticks(5)) {
		f.line(x.range[0], y(t), x.range[1], y(t), { stroke: "#e2e8f0" });
		f.text(String(t), {
			x: x.range[0] - 6,
			y: y(t),
			size: 10,
			align: "end",
			baseline: "middle",
			fill: "#64748b",
		});
	}
	const pts: Point[] = visits.map(([i, v]) => [x(i), y(v)]);
	f.series(pts, {
		id: "visits",
		curve: "monotone",
		stroke: "#2563eb",
		area: { fill: "#2563eb", opacity: 0.12, baseline: y(0) },
		markers: { r: 3 },
	});
}
