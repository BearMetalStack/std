import type {
	Bounds,
	DotGridOptions,
	FillRule,
	LineCap,
	LineJoin,
	RGBA,
	ShapeStyle,
} from "../types.ts";
import { DOT_GRID_DEFAULTS, dotGridPath } from "./grid.ts";
import type { Path } from "../geometry/path.ts";
import { parseColor } from "./color.ts";

/** A {@linkcode ShapeStyle} with defaults filled in, colors parsed and opacity applied. */
export interface ResolvedStyle {
	fill: RGBA | null;
	fillRule: FillRule;
	stroke: RGBA | null;
	strokeWidth: number;
	scaleWidth: boolean;
	join: LineJoin;
	cap: LineCap;
	miterLimit: number;
	dash: readonly number[] | null;
	dashOffset: number;
}

/** One recorded draw, in world coordinates. */
export interface DrawCommand {
	path: Path;
	style: ResolvedStyle;
	/** The fill is a single convex contour and can skip the stencil. */
	convex: boolean;
	bounds: Bounds;
	/** A dot grid waiting for the region it should cover; see {@linkcode expandGrids}. */
	grid?: DotGridOptions;
}

/** Fills in defaults for a {@linkcode ShapeStyle}. */
export function resolveStyle(s: ShapeStyle, defaults: ShapeStyle = {}): ResolvedStyle {
	const opacity = s.opacity ?? defaults.opacity ?? 1;
	const color = (c: ShapeStyle["fill"]): RGBA | null => {
		if (c === undefined) return null;
		const rgba = parseColor(c);
		rgba[3] *= opacity;
		return rgba[3] > 0 ? rgba : null;
	};
	const dash = s.dash ?? defaults.dash;
	return {
		fill: color(s.fill ?? defaults.fill),
		fillRule: s.fillRule ?? defaults.fillRule ?? "nonzero",
		stroke: color(s.stroke ?? defaults.stroke),
		strokeWidth: s.strokeWidth ?? defaults.strokeWidth ?? 1,
		scaleWidth: s.scaleWidth ?? defaults.scaleWidth ?? false,
		join: s.join ?? defaults.join ?? "miter",
		cap: s.cap ?? defaults.cap ?? "butt",
		miterLimit: s.miterLimit ?? defaults.miterLimit ?? 4,
		dash: dash && dash.length ? dash : null,
		dashOffset: s.dashOffset ?? defaults.dashOffset ?? 0,
	};
}

/** Builds a command, computing bounds once. */
export function command(path: Path, style: ResolvedStyle, convex = false): DrawCommand {
	return { path, style, convex, bounds: path.bounds() };
}

/**
 * Replaces dot-grid placeholders with dots covering `bounds` at `scale` screen pixels per world
 * unit. The covered region depends on what is being rendered (the viewport, or a snapshot's
 * content), which is only known after the frame is recorded.
 */
export function expandGrids(cmds: DrawCommand[], bounds: Bounds, scale: number): DrawCommand[] {
	return cmds.map((c) => {
		if (!c.grid) return c;
		const path = dotGridPath(c.grid, bounds, scale);
		return command(path, resolveStyle({ fill: c.grid.color ?? DOT_GRID_DEFAULTS.color }));
	});
}
