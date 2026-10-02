import type { HandleResult, Handles, HitTarget, Rect } from "../types.ts";
import type { Camera } from "../core/camera.ts";
import type { InputState } from "./input.ts";
import { hitLine, type LineHit, type LineRegion } from "./linehit.ts";

/** Which part of an object the pointer is on. */
export type HandlePart = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const RESIZE_PARTS: [HandlePart, number, number][] = [
	["nw", 0, 0],
	["n", 0.5, 0],
	["ne", 1, 0],
	["e", 1, 0.5],
	["se", 1, 1],
	["s", 0.5, 1],
	["sw", 0, 1],
	["w", 0, 0.5],
];

const CURSORS: Record<HandlePart, string> = {
	move: "move",
	n: "ns-resize",
	s: "ns-resize",
	e: "ew-resize",
	w: "ew-resize",
	ne: "nesw-resize",
	sw: "nesw-resize",
	nw: "nwse-resize",
	se: "nwse-resize",
};

interface ResolvedHandles {
	move: boolean;
	resize: boolean;
	minSize: number;
}

interface Region {
	id: string;
	rect: Rect;
	handles: ResolvedHandles | null;
	target: Omit<HitTarget, "screen">;
	z: number;
}

/** What {@linkcode HandleManager.interact} needs to know to report a hit. */
export type HitMeta = Pick<HitTarget, "kind" | "shape" | "label" | "data">;

/** `true` when world point `(x, y)` is inside the target's outline. */
export function contains(t: Rect & Pick<HitTarget, "shape">, x: number, y: number): boolean {
	const hw = t.w / 2, hh = t.h / 2;
	if (hw <= 0 || hh <= 0) return false;
	const dx = (x - t.x - hw) / hw, dy = (y - t.y - hh) / hh;
	switch (t.shape) {
		case "ellipse":
			return dx * dx + dy * dy <= 1;
		case "diamond":
			return Math.abs(dx) + Math.abs(dy) <= 1;
		default:
			return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
	}
}

/** An object whose handles should be drawn this frame. */
export interface HandleOverlay {
	rect: Rect;
	/** Handle centers in world coordinates. */
	points: [number, number][];
}

function resolve(h: Handles | undefined): ResolvedHandles | null {
	if (!h) return null;
	const o = h === true
		? {}
		: h === "move"
		? { resize: false }
		: h === "resize"
		? { move: false }
		: h;
	return { move: o.move ?? true, resize: o.resize ?? true, minSize: o.minSize ?? 4 };
}

/**
 * Immediate-mode interaction state. The only thing that survives between frames is which id is
 * hovered and which one is being dragged; positions always come from the caller.
 */
export class HandleManager {
	/** Handle square size in CSS pixels. */
	handleSize = 8;
	hot: { id: string; part: HandlePart } | null = null;
	active: { id: string; part: HandlePart; wx: number; wy: number; rect: Rect } | null = null;
	#regions: Region[] = [];
	#lines: LineRegion[] = [];
	#z = 0;
	#input: InputState | null = null;
	#camera: Camera | null = null;

	begin(input: InputState | null, camera: Camera): void {
		this.#regions = [];
		this.#lines = [];
		this.#z = 0;
		this.#input = input;
		this.#camera = camera;
		if (this.active && !input) this.active = null;
	}

	/** Registers an object and returns where it should be drawn. */
	interact(
		id: string,
		rect: Rect,
		handles: Handles | undefined,
		meta: HitMeta,
	): HandleResult {
		const h = resolve(handles);
		const input = this.#input, cam = this.#camera!;
		const hovered = this.hot?.id === id;
		if (input?.pressed && hovered && h && !this.active) {
			const part = this.hot!.part;
			if ((part === "move" && h.move) || (part !== "move" && h.resize)) {
				const [wx, wy] = cam.screenToWorld(input.x, input.y);
				this.active = { id, part, wx, wy, rect: { ...rect } };
			}
		}
		let out = rect;
		let dragging = false, resizing = false;
		const a = this.active;
		if (a && a.id === id && input && h) {
			const [wx, wy] = cam.screenToWorld(input.x, input.y);
			out = applyDrag(a.part, a.rect, wx - a.wx, wy - a.wy, h.minSize);
			dragging = a.part === "move";
			resizing = !dragging;
		}
		this.#regions.push({
			id,
			rect: out,
			handles: h,
			target: { id, ...meta, ...out },
			z: this.#z++,
		});
		return {
			hovered,
			dragging,
			resizing,
			pos: { x: out.x, y: out.y },
			size: { w: out.w, h: out.h },
			changed: out.x !== rect.x || out.y !== rect.y || out.w !== rect.w || out.h !== rect.h,
		};
	}

	/**
	 * Settles the frame: works out what is under the pointer for the next one, ends drags on
	 * release, and reports which handles to draw and what cursor to show.
	 */
	end(): { overlays: HandleOverlay[]; cursor: string } {
		const input = this.#input;
		if (input?.released) this.active = null;
		const picked = input?.inside ? this.#pick(input.x, input.y) : null;
		this.hot = picked && { id: picked.id, part: picked.part };
		const overlays: HandleOverlay[] = [];
		for (const r of this.#regions) {
			if (!r.handles?.resize) continue;
			if (r.id !== this.hot?.id && r.id !== this.active?.id) continue;
			overlays.push({
				rect: r.rect,
				points: RESIZE_PARTS.map((
					[, fx, fy],
				) => [r.rect.x + r.rect.w * fx, r.rect.y + r.rect.h * fy]),
			});
		}
		const part = this.active?.part ?? this.hot?.part;
		const region = this.#regions.find((r) => r.id === (this.active?.id ?? this.hot?.id));
		let cursor = "default";
		if (part && region?.handles) {
			if (part !== "move" || region.handles.move) cursor = CURSORS[part];
		}
		return { overlays, cursor };
	}

	/** The paint-order value the next registered object will get. */
	get z(): number {
		return this.#z;
	}

	/** Claims the next paint-order value. */
	nextZ(): number {
		return this.#z++;
	}

	/** Registers a clickable line. `z` defaults to the next paint-order value. */
	addLine(region: Omit<LineRegion, "z"> & { z?: number }): void {
		this.#lines.push({ ...region, z: region.z ?? this.#z++ });
	}

	/** The topmost clickable line near a screen point, from the most recent frame. */
	hitTestLine(sx: number, sy: number): (LineHit & { z: number }) | undefined {
		const cam = this.#camera;
		if (!cam) return undefined;
		let best: LineHit | null = null;
		for (const r of this.#lines) {
			const h = hitLine(r, cam, sx, sy);
			if (!h) continue;
			if (!best || r.z > best.region.z || (r.z === best.region.z && h.distance < best.distance)) {
				best = h;
			}
		}
		return best ? { ...best, z: best.region.z } : undefined;
	}

	/** Paint order of the topmost shape under a screen point, or `-Infinity`. */
	shapeZ(sx: number, sy: number): number {
		return this.#pick(sx, sy)?.region.z ?? -Infinity;
	}

	/** The topmost region and part under a screen point, from the most recent frame. */
	#pick(sx: number, sy: number): { id: string; part: HandlePart; region: Region } | null {
		const cam = this.#camera;
		if (!cam) return null;
		const [wx, wy] = cam.screenToWorld(sx, sy);
		const half = this.handleSize / 2 + 2;
		for (let i = this.#regions.length - 1; i >= 0; i--) {
			const r = this.#regions[i];
			if (r.handles?.resize) {
				for (const [part, fx, fy] of RESIZE_PARTS) {
					const [hx, hy] = cam.worldToScreen(r.rect.x + r.rect.w * fx, r.rect.y + r.rect.h * fy);
					if (Math.abs(hx - sx) <= half && Math.abs(hy - sy) <= half) {
						return { id: r.id, part, region: r };
					}
				}
			}
			if (contains(r.target, wx, wy)) return { id: r.id, part: "move", region: r };
		}
		return null;
	}

	/** The topmost object under a screen point (CSS pixels), as drawn in the most recent frame. */
	hitTest(sx: number, sy: number): HitTarget | undefined {
		const t = this.#pick(sx, sy)?.region.target;
		return t ? { ...t, screen: this.#camera!.rectToScreen(t) } : undefined;
	}
}

function applyDrag(part: HandlePart, r: Rect, dx: number, dy: number, min: number): Rect {
	if (part === "move") return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
	let { x, y, w, h } = r;
	if (part.includes("e")) w = Math.max(min, r.w + dx);
	if (part.includes("s")) h = Math.max(min, r.h + dy);
	if (part.includes("w")) {
		w = Math.max(min, r.w - dx);
		x = r.x + r.w - w;
	}
	if (part.includes("n")) {
		h = Math.max(min, r.h - dy);
		y = r.y + r.h - h;
	}
	return { x, y, w, h };
}
