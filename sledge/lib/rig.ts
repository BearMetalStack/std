import { AngularSpring } from "./spring.ts";
import { type Bob, parseBob } from "./motion.ts";
import {
	blend,
	compatible,
	lerpValues,
	type NormalizedPath,
	normalizePath,
	serializePath,
	transformPath,
} from "./path.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

/** A path with alternate shapes (`data-shape-of`) that can be mixed by weight. */
export interface MorphTarget {
	el: SVGPathElement;
	base: NormalizedPath;
	states: Map<string, NormalizedPath>;
	/** Copies that must always carry the same `d`, such as a lid's edge line. */
	followers: SVGPathElement[];
	isLid: boolean;
	lastD: string;
}

/** A part that rotates on a spring around a pivot (`data-sway`, `data-pivot-for`). */
export interface SwayRig {
	part: Element;
	wrapper: SVGGElement;
	spring: AngularSpring;
	drag: number;
	cx: number;
	cy: number;
	lastAngle: number;
}

/** An eye, wrapped together with its lids so they tilt and glance as one. */
export interface EyeRig {
	eye: SVGGraphicsElement;
	wrapper: SVGGElement;
	lids: SVGPathElement[];
}

/** Everything Sledge animates, discovered from an SVG's `data-*` tags. */
export interface Rig {
	svg: SVGSVGElement;
	face?: Element;
	eyes?: Element;
	nose?: Element;
	eyeRigs: EyeRig[];
	zMix: Map<Element, [number, number]>;
	morphs: MorphTarget[];
	sways: SwayRig[];
	bob?: Bob;
	defaultExpression?: string;
	/** Every state name any morph target knows. */
	states: Set<string>;
	/** True when some lid has a `closed` state, so blinks morph lids rather than squash eyes. */
	lidBlink: boolean;
}

function matrixOf(el: Element): DOMMatrix {
	const list = (el as SVGGraphicsElement).transform?.baseVal;
	let m = new DOMMatrix();
	if (!list) return m;
	for (let i = 0; i < list.numberOfItems; i++) {
		const { a, b, c, d, e, f } = list.getItem(i).matrix;
		m = m.multiply(new DOMMatrix([a, b, c, d, e, f]));
	}
	return m;
}

/** Maps an element's own coordinates (its transform included) to the root `<svg>`'s. */
function localToRoot(el: Element, root: Element): DOMMatrix {
	let m = new DOMMatrix();
	for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
		m = matrixOf(n).multiply(m);
	}
	return m;
}

/** Maps an element's own coordinates into the coordinate space inside `space`. */
function mapInto(el: Element, space: Element, root: Element): DOMMatrix {
	return localToRoot(space, root).inverse().multiply(localToRoot(el, root));
}

function setMatrix(el: Element, m: DOMMatrix) {
	el.setAttribute("transform", `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
}

function svgEl<K extends keyof SVGElementTagNameMap>(
	name: K,
	attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
	const el = document.createElementNS(SVG_NS, name);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	return el;
}

function wrap(el: Element, attrs: Record<string, string> = {}): SVGGElement {
	const g = svgEl("g", attrs);
	el.parentNode!.insertBefore(g, el);
	g.appendChild(el);
	return g;
}

function byId(svg: SVGSVGElement, id: string | null): Element | null {
	return id ? svg.querySelector(`#${CSS.escape(id)}`) : null;
}

function warn(message: string) {
	console.warn(`[sledge] ${message}`);
}

let rigCount = 0;

/**
 * Scans an SVG's tags and rewires it for animation: variant shapes and pivot
 * markers are read and removed, swaying parts and eyes are wrapped, and lids
 * get their masks and clips. Call once, with the SVG connected so geometry can
 * be measured.
 */
export function buildRig(svg: SVGSVGElement): Rig {
	const uid = `sledge${++rigCount}`;
	const defs = svg.querySelector("defs") ?? svg.insertBefore(svgEl("defs"), svg.firstChild);

	const rig: Rig = {
		svg,
		face: svg.querySelector('[data-part="face"]') ?? undefined,
		eyes: svg.querySelector('[data-part="eyes"]') ?? undefined,
		nose: svg.querySelector('[data-part="nose"]') ?? undefined,
		eyeRigs: [],
		zMix: new Map(),
		morphs: [],
		sways: [],
		bob: parseBob(svg.getAttribute("data-bob")),
		defaultExpression: svg.getAttribute("data-default-expression") ?? undefined,
		states: new Set(),
		lidBlink: false,
	};

	// Geometry has to be read before anything moves or loses its transform.
	const morphs = new Map<Element, MorphTarget>();
	for (const variant of svg.querySelectorAll("[data-shape-of]")) {
		const id = variant.getAttribute("data-shape-of");
		const state = variant.getAttribute("data-state");
		const base = byId(svg, id);
		const toBase = base ? mapInto(variant, base, svg) : undefined;
		variant.remove();
		if (!state) {
			warn(`variant of "${id}" has no data-state`);
			continue;
		}
		if (!(base instanceof SVGPathElement) || !(variant instanceof SVGPathElement)) {
			warn(`"${state}" variant of "${id}": both the base and the variant must be <path>s`);
			continue;
		}
		let target = morphs.get(base);
		if (!target) {
			const d = base.getAttribute("d") ?? "";
			target = {
				el: base,
				base: normalizePath(d),
				states: new Map(),
				followers: [],
				isLid: base.hasAttribute("data-lid"),
				lastD: d,
			};
			morphs.set(base, target);
		}
		let shape: NormalizedPath | null;
		try {
			shape = normalizePath(variant.getAttribute("d") ?? "");
		} catch (e) {
			warn(`"${state}" variant of "${id}": ${(e as Error).message}`);
			continue;
		}
		shape = transformPath(shape, toBase!);
		if (!shape) {
			warn(`"${state}" variant of "${id}" has arcs and sits in a different coordinate space`);
			continue;
		}
		if (!compatible(target.base, shape)) {
			warn(
				`"${state}" variant of "${id}" has different nodes (${shape.signature} vs ${target.base.signature}); duplicate the path and only move nodes`,
			);
			continue;
		}
		target.states.set(state, shape);
		rig.states.add(state);
	}
	rig.morphs = [...morphs.values()];
	rig.lidBlink = rig.morphs.some((m) => m.isLid && m.states.has("closed"));

	const pivots = new Map<string, [number, number]>();
	for (const marker of svg.querySelectorAll("[data-pivot-for]")) {
		let center: DOMPointInit;
		if (marker instanceof SVGCircleElement || marker instanceof SVGEllipseElement) {
			center = { x: marker.cx.baseVal.value, y: marker.cy.baseVal.value };
		} else {
			const box = (marker as SVGGraphicsElement).getBBox();
			center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		}
		const p = localToRoot(marker, svg).transformPoint(center);
		pivots.set(marker.getAttribute("data-pivot-for")!, [p.x, p.y]);
		marker.remove();
	}

	for (const part of svg.querySelectorAll("[data-sway]")) {
		const [stiffness = 120, damping = 10, gain = 1, drag = 1] = part
			.getAttribute("data-sway")!
			.trim()
			.split(/[\s,]+/)
			.map(Number);
		const pivot = pivots.get(part.id);
		if (!pivot) {
			warn(`"${part.id || part.tagName}" sways but no data-pivot-for marker names it`);
			continue;
		}
		const parent = part.parentElement!;
		const local = localToRoot(parent, svg).inverse().transformPoint({ x: pivot[0], y: pivot[1] });
		rig.sways.push({
			part,
			wrapper: wrap(part, { "data-sledge-sway": "" }),
			spring: new AngularSpring(stiffness, damping, gain),
			drag,
			cx: local.x,
			cy: local.y,
			lastAngle: 0,
		});
	}

	for (const eye of svg.querySelectorAll<SVGGraphicsElement>('[data-part="eye"]')) {
		const wrapper = wrap(eye, { "data-sledge-eye": "" });
		const lids = eye.id
			? [...svg.querySelectorAll<SVGPathElement>(`[data-lid][data-for="${CSS.escape(eye.id)}"]`)]
			: [];
		rig.eyeRigs.push({ eye, wrapper, lids });
		if (lids.length) rigLids(svg, defs, `${uid}-${rig.eyeRigs.length}`, eye, wrapper, lids, morphs);
	}

	for (const el of svg.querySelectorAll("[data-z-mix]")) {
		const mix = JSON.parse(el.getAttribute("data-z-mix") ?? "null");
		if (Array.isArray(mix) && mix.length === 2) rig.zMix.set(el, mix as [number, number]);
	}

	for (const layer of svg.querySelectorAll<SVGGraphicsElement>("[data-layer]")) {
		if (layer.hasAttribute("transform")) {
			const m = matrixOf(layer);
			layer.style.setProperty(
				"--base-transform",
				`matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`,
			);
			layer.removeAttribute("transform");
		}
		layer.style.setProperty("--depth", layer.getAttribute("data-layer") || "0");
	}

	return rig;
}

function isStroked(el: Element): boolean {
	const style = getComputedStyle(el);
	return style.stroke !== "none" && parseFloat(style.strokeWidth) > 0;
}

/**
 * Lids live in the eye wrapper's coordinate space. A `mask` lid cuts the eye
 * away and, for a stroked eye, a copy of its edge is drawn in the eye's stroke
 * so the outline survives the cut. A `cover` lid paints over the eye, confined
 * to it, and the eye's outline is drawn again on top of it.
 */
function rigLids(
	svg: SVGSVGElement,
	defs: SVGDefsElement,
	id: string,
	eye: SVGGraphicsElement,
	wrapper: SVGGElement,
	lids: SVGPathElement[],
	morphs: Map<Element, MorphTarget>,
) {
	const stroked = isStroked(eye);
	const eyeStyle = getComputedStyle(eye);
	const toWrapper = lids.map((lid) => mapInto(lid, wrapper, svg));

	// Lids are confined to the eye including its stroke, so an edge line runs to the
	// outline's outer edge instead of stopping halfway through it.
	const area = svgEl("mask", {
		id: `${id}-area`,
		maskUnits: "userSpaceOnUse",
		x: "-100000",
		y: "-100000",
		width: "200000",
		height: "200000",
	});
	const eyeShape = eye.cloneNode() as SVGGraphicsElement;
	eyeShape.removeAttribute("id");
	eyeShape.removeAttribute("data-part");
	eyeShape.setAttribute(
		"style",
		`fill:#fff;stroke:${stroked ? "#fff" : "none"};stroke-width:${eyeStyle.strokeWidth}`,
	);
	area.appendChild(eyeShape);
	defs.appendChild(area);

	const mask = svgEl("mask", {
		id: `${id}-mask`,
		maskUnits: "userSpaceOnUse",
		x: "-100000",
		y: "-100000",
		width: "200000",
		height: "200000",
	});
	mask.appendChild(svgEl("rect", {
		x: "-100000",
		y: "-100000",
		width: "200000",
		height: "200000",
		fill: "#fff",
	}));
	let masked = false;

	const over = svgEl("g", { mask: `url(#${id}-area)` });

	lids.forEach((lid, i) => {
		const mode = lid.getAttribute("data-lid");
		setMatrix(lid, toWrapper[i]);
		if (mode === "mask") {
			lid.style.setProperty("fill", "#000");
			lid.style.setProperty("stroke", "none");
			mask.appendChild(lid);
			masked = true;
			if (stroked) {
				const edge = lid.cloneNode() as SVGPathElement;
				edge.removeAttribute("id");
				edge.style.setProperty("fill", "none");
				edge.style.setProperty("stroke", eyeStyle.stroke);
				edge.style.setProperty("stroke-width", eyeStyle.strokeWidth);
				edge.style.setProperty("stroke-linecap", "round");
				over.appendChild(edge);
				morphs.get(lid)?.followers.push(edge);
			}
		} else {
			if (mode !== "cover") warn(`lid "${lid.id}" has data-lid="${mode}"; expected cover or mask`);
			over.appendChild(lid);
		}
	});

	if (masked) {
		defs.appendChild(mask);
		wrap(eye, { mask: `url(#${id}-mask)` });
	}
	wrapper.appendChild(over);

	const eyeMorph = morphs.get(eye);
	if (eyeMorph && eyeShape instanceof SVGPathElement) eyeMorph.followers.push(eyeShape);
	if (stroked && lids.some((l) => l.getAttribute("data-lid") !== "mask")) {
		const outline = eye.cloneNode() as SVGGraphicsElement;
		outline.removeAttribute("id");
		outline.removeAttribute("data-part");
		outline.style.setProperty("fill", "none");
		wrapper.appendChild(outline);
		if (eyeMorph && outline instanceof SVGPathElement) eyeMorph.followers.push(outline);
	}
}

const scratch = new Map<MorphTarget, Float64Array>();

/**
 * Writes each morph target's blended shape for the given state weights, then,
 * on lids, closes them toward their `closed` state by `blink` (0–1).
 */
export function applyMorphs(rig: Rig, weights: ReadonlyMap<string, number>, blink: number) {
	for (const target of rig.morphs) {
		const names = [...target.states.keys()];
		let out = scratch.get(target);
		if (!out) scratch.set(target, out = new Float64Array(target.base.values.length));
		blend(
			target.base,
			names.map((n) => target.states.get(n)!),
			names.map((n) => weights.get(n) ?? 0),
			out,
		);
		const closed = target.isLid ? target.states.get("closed") : undefined;
		if (closed && blink > 0) lerpValues(out, closed.values, blink, out);
		const d = serializePath(target.base.signature, out);
		if (d === target.lastD) continue;
		target.lastD = d;
		target.el.setAttribute("d", d);
		for (const f of target.followers) f.setAttribute("d", d);
	}
}
