import type {
	Bounds,
	DotGridOptions,
	FillRule,
	ImageFit,
	ImageSmoothing,
	ImageSource,
	LineCap,
	LineJoin,
	Rect,
	RGBA,
	ShapeStyle,
} from "../types.ts";
import { DOT_GRID_DEFAULTS, dotGridPath } from "./grid.ts";
import type { Path } from "../geometry/path.ts";
import { parseColor } from "./color.ts";
import { fitImage, imageSize, isImagePaint } from "../image/source.ts";

/** An image fill. `rect` is where the image lands, in world units, once the path is known. */
export interface ImageFill {
	image: ImageSource;
	fit: ImageFit;
	position: readonly [number, number];
	smoothing: ImageSmoothing;
	/** The box to fit into, or `null` for the path's bounds. */
	box: Rect | null;
	opacity: number;
	rect: Rect | null;
}

/** `true` when a resolved fill is an image rather than a color. */
export function isImageFill(f: RGBA | ImageFill | null): f is ImageFill {
	return f !== null && !Array.isArray(f);
}

/** A {@linkcode ShapeStyle} with defaults filled in, colors parsed and opacity applied. */
export interface ResolvedStyle {
	fill: RGBA | ImageFill | null;
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
	const color = (c: ShapeStyle["stroke"]): RGBA | null => {
		if (c === undefined) return null;
		const rgba = parseColor(c);
		rgba[3] *= opacity;
		return rgba[3] > 0 ? rgba : null;
	};
	const dash = s.dash ?? defaults.dash;
	const f = s.fill ?? defaults.fill;
	return {
		fill: f !== undefined && isImagePaint(f)
			? (opacity > 0
				? {
					image: f.image,
					fit: f.fit ?? "cover",
					position: f.position ?? [0.5, 0.5],
					smoothing: f.smoothing ?? "linear",
					box: f.box ?? null,
					opacity,
					rect: null,
				}
				: null)
			: color(f),
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

/** Builds a command, computing bounds once and placing an image fill within them. */
export function command(path: Path, style: ResolvedStyle, convex = false): DrawCommand {
	const bounds = path.bounds();
	const f = style.fill;
	if (isImageFill(f) && !f.rect) {
		const { width, height } = imageSize(f.image);
		const box = f.box ??
			{
				x: bounds.minX,
				y: bounds.minY,
				w: bounds.maxX - bounds.minX,
				h: bounds.maxY - bounds.minY,
			};
		style = {
			...style,
			fill: width > 0 && height > 0
				? { ...f, rect: fitImage(width, height, box, f.fit, f.position) }
				: null,
		};
	}
	return { path, style, convex, bounds };
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
