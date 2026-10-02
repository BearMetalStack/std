/**
 * @module
 * Public types for `@bearmetal/anodized`.
 */

/** A point as an `[x, y]` tuple. */
export type Point = readonly [number, number];

/** An axis-aligned rectangle given by its top-left corner and size. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** An axis-aligned bounding box. */
export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/** A straight-alpha color with every channel in `0..1`. */
export type RGBA = [number, number, number, number];

/**
 * Anything {@linkcode parseColor} understands: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`,
 * `rgba()`, a handful of CSS names, `transparent`, or an `[r, g, b, a?]` tuple in `0..1`.
 */
export type ColorInput = string | readonly [number, number, number, number?];

/** How the corners of a stroke are drawn. */
export type LineJoin = "miter" | "round" | "bevel";

/** How the open ends of a stroke are drawn. */
export type LineCap = "butt" | "round" | "square";

/** Which regions of a self-overlapping path count as inside. */
export type FillRule = "nonzero" | "evenodd";

/** Straight-alpha RGBA pixels: what {@linkcode decodePng} returns, and the shape of a {@linkcode Snapshot}. */
export interface RawImage {
	width: number;
	height: number;
	/** RGBA, straight alpha, row-major, no padding. */
	pixels: Uint8Array;
}

/**
 * Anything an image can be drawn from. Raw pixels work everywhere; the DOM sources need a
 * runtime that can upload them to the GPU (browsers can, Deno cannot). An `HTMLImageElement`
 * must have finished loading.
 */
export type ImageSource =
	| RawImage
	| ImageBitmap
	| HTMLImageElement
	| HTMLCanvasElement
	| OffscreenCanvas
	| HTMLVideoElement
	| VideoFrame;

/**
 * How an image is fitted into its box, as in CSS `object-fit`: `"fill"` stretches it,
 * `"contain"` fits it inside keeping its aspect ratio, `"cover"` fills the box keeping its aspect
 * ratio and crops the rest, `"none"` draws it at one world unit per pixel.
 */
export type ImageFit = "fill" | "contain" | "cover" | "none";

/** How an image is sampled: `"linear"` is smooth, `"nearest"` keeps hard pixel edges. */
export type ImageSmoothing = "linear" | "nearest";

/** Image placement shared by image fills and {@linkcode Frame.image}. */
export interface ImagePlacement {
	/** Default `"cover"` for fills, `"fill"` for {@linkcode Frame.image}. */
	fit?: ImageFit;
	/** Where the image sits in its box when it does not fill it exactly, as fractions. Default `[0.5, 0.5]`. */
	position?: readonly [number, number];
	/** Default `"linear"`. */
	smoothing?: ImageSmoothing;
}

/** Fills a shape with an image. The parts of the shape the image does not reach stay empty. */
export interface ImagePaint extends ImagePlacement {
	image: ImageSource;
	/**
	 * The box the image is fitted into, in the same coordinates as the shape. Defaults to the
	 * shape's bounding box.
	 */
	box?: Rect;
}

/** What a shape can be filled with: a color, or an image. */
export type Paint = ColorInput | ImagePaint;

/** Fill and stroke settings shared by every shape. */
export interface ShapeStyle {
	/** Fill color or image. Omit for no fill. */
	fill?: Paint;
	/** Fill rule for paths whose contours overlap. Default `"nonzero"`. */
	fillRule?: FillRule;
	/** Stroke color. Omit for no stroke. */
	stroke?: ColorInput;
	/** Stroke width in screen pixels (or world units with `scaleWidth`). Default `1`. */
	strokeWidth?: number;
	/** Scale the stroke width with zoom instead of keeping it constant on screen. */
	scaleWidth?: boolean;
	/** Stroke join. Default `"miter"`. */
	join?: LineJoin;
	/** Stroke cap. Default `"butt"`. */
	cap?: LineCap;
	/** Miter length limit, as a multiple of the stroke width. Default `4`. */
	miterLimit?: number;
	/** Dash pattern, in the same units as `strokeWidth`. */
	dash?: readonly number[];
	/** Offset into the dash pattern. */
	dashOffset?: number;
	/** Multiplies the alpha of both fill and stroke. */
	opacity?: number;
}

/** Makes a line-like object clickable via `anode:lineclick`. */
export interface Clickable {
	/** A stable id. Required for the line to be hit-tested. */
	id?: string;
	/** Anything you like; handed back as `target.data` when the line is clicked. */
	data?: unknown;
}

/** Turns on hit-testing and opt-in control handles for an object. */
export interface Interactive {
	/** A stable id. Required for hover tracking and handles. */
	id?: string;
	/** Which control handles the object gets; see {@linkcode Handles}. */
	handles?: Handles;
	/** Anything you like; handed back as `target.data` when the object is clicked. */
	data?: unknown;
}

/**
 * Which control handles an object gets: `true` for both moving and resizing, `"move"` to drag it
 * by its body only, `"resize"` for the eight edge/corner handles only, or {@linkcode HandleOptions}
 * for finer control. `false` or omitted for none.
 */
export type Handles = boolean | "move" | "resize" | HandleOptions;

/** Which control handles an object gets, spelled out. */
export interface HandleOptions {
	/** Drag the body to move it. Default `true`. */
	move?: boolean;
	/** Drag the eight edge/corner handles to resize it. Default `true`. */
	resize?: boolean;
	/** Smallest width/height a resize can produce, in world units. Default `4`. */
	minSize?: number;
}

/** Interaction state returned for an object, ImGui style. */
export interface HandleResult {
	/** The pointer is over the object (and nothing drawn after it). */
	hovered: boolean;
	/** The object is being moved. */
	dragging: boolean;
	/** The object is being resized. */
	resizing: boolean;
	/** The position the object should take: the input position, plus any drag in progress. */
	pos: { x: number; y: number };
	/** The size the object should take: the input size, plus any resize in progress. */
	size: { w: number; h: number };
	/** `pos` or `size` differ from what was passed in. */
	changed: boolean;
}

/** Options for {@linkcode Frame.rect}. */
export interface RectOptions extends ShapeStyle, Interactive {
	x: number;
	y: number;
	w: number;
	h: number;
	/** Corner radius in world units. */
	radius?: number;
}

/** Options for {@linkcode Frame.circle}. */
export interface CircleOptions extends ShapeStyle, Interactive {
	/** Center x. */
	x: number;
	/** Center y. */
	y: number;
	r: number;
}

/** Options for {@linkcode Frame.ellipse}. */
export interface EllipseOptions extends ShapeStyle, Interactive {
	/** Center x. */
	x: number;
	/** Center y. */
	y: number;
	rx: number;
	ry: number;
}

/** Options for {@linkcode Frame.image}. */
export interface ImageOptions
	extends Omit<ShapeStyle, "fill" | "fillRule">, Interactive, ImagePlacement {
	/** Left edge. */
	x: number;
	/** Top edge. */
	y: number;
	/** Width in world units. Defaults to the image's width, or keeps its aspect ratio when only `h` is given. */
	w?: number;
	/** Height in world units. Defaults to the image's height, or keeps its aspect ratio when only `w` is given. */
	h?: number;
	/** Corner radius in world units. */
	radius?: number;
}

/** Horizontal text alignment relative to the anchor. */
export type TextAlign = "start" | "center" | "end";

/** Which part of the text box the anchor's y names. */
export type TextBaseline = "top" | "middle" | "alphabetic" | "bottom";

/** Options for {@linkcode Frame.text}. */
export interface TextOptions {
	x: number;
	y: number;
	/** Font size in world units. Default `14`. */
	size?: number;
	/** Font to draw with. Defaults to the instance's `font`. */
	font?: Font;
	/** Color or image. Default `"#000"`. */
	fill?: Paint;
	align?: TextAlign;
	baseline?: TextBaseline;
	/** Wrap words to this width, in world units. */
	maxWidth?: number;
	/** Line height as a multiple of `size`. Default `1.2`. */
	lineHeight?: number;
	opacity?: number;
}

/** The outline a node is drawn with. */
export type NodeShape = "rect" | "roundRect" | "ellipse" | "diamond";

/** Options for {@linkcode Frame.node}. */
export interface NodeOptions extends ShapeStyle, Interactive {
	/** Required: connections refer to nodes by id. */
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** Default `"roundRect"`. */
	shape?: NodeShape;
	/** Corner radius for `roundRect`. Default `6`. */
	radius?: number;
	/** Text centered inside the node and wrapped to fit. */
	label?: string;
	/** Label styling. */
	labelStyle?: Omit<TextOptions, "x" | "y" | "maxWidth">;
	/** Space between the label and the node's edge. Default `8`. */
	padding?: number;
}

/** A side of a node, used to pin where a connection attaches. */
export type Port = "top" | "right" | "bottom" | "left" | "center";

/** How a connection is routed between its nodes. */
export type RouteKind = "straight" | "bezier" | "orthogonal";

/** The marker drawn at the end of a connection. */
export type ArrowHead = "triangle" | "arrow" | "circle" | "diamond";

/**
 * Options for {@linkcode Frame.connect}. Connections are always clickable; without an `id` they
 * report `"<from>-><to>"`.
 */
export interface ConnectOptions extends ShapeStyle, Clickable {
	/** Default `"orthogonal"`. */
	route?: RouteKind;
	/** Side of the source node to leave from. Picked automatically when omitted. */
	fromPort?: Port;
	/** Side of the target node to arrive at. Picked automatically when omitted. */
	toPort?: Port;
	/** Which ends get an arrowhead. Default `"end"`. */
	arrow?: "none" | "start" | "end" | "both";
	/** Default `"triangle"`. */
	head?: ArrowHead;
	/** Arrowhead length in world units. Default `10`. */
	headSize?: number;
	/** Corner radius for orthogonal routes, in world units. Default `6`. */
	cornerRadius?: number;
	/** Distance routes keep from nodes, in world units. Default `16`. */
	margin?: number;
	/** Text drawn at the middle of the route. */
	label?: string;
	labelStyle?: Omit<TextOptions, "x" | "y">;
	/** Plate behind the label so the line doesn't run through it. Default: the background. */
	labelBackground?: ColorInput;
	/** `"below"` (default) draws the connection under every node; `"inline"` keeps call order. */
	layer?: "below" | "inline";
}

/** How a series is interpolated between its points. */
export type CurveKind =
	| "linear"
	| "monotone"
	| "catmullRom"
	| "stepBefore"
	| "stepAfter"
	| "stepMiddle";

/** Options for {@linkcode Frame.series}. */
export interface SeriesOptions extends ShapeStyle, Clickable {
	/** Default `"monotone"`. */
	curve?: CurveKind;
	/** Catmull-Rom tension: `0` (default) is the classic spline, `1` is straight lines. */
	tension?: number;
	/** Fill the area between the line and `baseline`. */
	area?: { fill: ColorInput; baseline?: number; opacity?: number };
	/** Draw a dot at each point. Radius in screen pixels. */
	markers?: { r?: number; fill?: ColorInput; stroke?: ColorInput };
}

/** Options for {@linkcode Frame.dotGrid}. */
export interface DotGridOptions {
	/** Dot diameter in screen pixels; stays the same at every zoom. Default `2`. */
	size?: number;
	/** Distance between dots in world units, so the grid pans and zooms with the content. Default `20`. */
	spacing?: number;
	/** Default `"#cbd5e1"`. */
	color?: ColorInput;
}

/** Options for {@linkcode Anodized.snapshot}. */
export interface SnapshotOptions {
	/** Region of the world to render. Defaults to the bounds of everything drawn. */
	bounds?: Bounds;
	/** Output pixels per world unit. Default `1`. */
	scale?: number;
	/** Empty space around the content, in output pixels. Default `16`. */
	padding?: number;
	/** Default `"transparent"`. */
	background?: ColorInput;
	/** Largest tile edge in pixels; bigger outputs are rendered in tiles. Default `4096`. */
	tileSize?: number;
}

/** A rendered image. */
export interface Snapshot extends RawImage {
	/** Encodes the image as a PNG file. */
	png(): Promise<Uint8Array>;
}

/** Options for the opt-in pan/zoom controller. */
export interface ViewportOptions {
	/** Zoom around the cursor with the wheel. Default `true`. */
	wheelZoom?: boolean;
	/** Pan by dragging empty space. Default `true`. */
	dragPan?: boolean;
}

/** What kind of call drew a clickable object. */
export type HitKind = "node" | "rect" | "circle" | "ellipse" | "image";

/** The object under a point, as it was drawn in the most recent frame. */
export interface HitTarget {
	id: string;
	kind: HitKind;
	/** The outline used for the hit test. Circles and ellipses report `"ellipse"`. */
	shape: NodeShape;
	/** Bounding box in world units, after any drag in progress. */
	x: number;
	y: number;
	w: number;
	h: number;
	/**
	 * The bounding box in CSS pixels relative to the canvas, at the pan and zoom of the hit test.
	 * Position an HTML element here to cover the object exactly.
	 */
	screen: Rect;
	/** The node's label, for nodes that have one. */
	label?: string;
	/** Whatever was passed as `data`. */
	data?: unknown;
}

/** The result of {@linkcode Anodized.hitTest}. */
export interface HitResult {
	hit: boolean;
	/** The topmost object with an `id` under the point. */
	target?: HitTarget;
	/** The point in world units. */
	x: number;
	y: number;
	/** The point in CSS pixels relative to the canvas. */
	screenX: number;
	screenY: number;
}

/** `detail` of an `anode:click` event. */
export interface AnodeClickDetail extends HitResult {
	/** `MouseEvent.button`: 0 primary, 1 middle, 2 secondary. */
	button: number;
}

/**
 * The event dispatched on the canvas when the user clicks without dragging. It bubbles. JSR does
 * not allow global type augmentation, so cast when listening directly, or use
 * {@linkcode Anodized.onClick}.
 */
export type AnodeClickEvent = CustomEvent<AnodeClickDetail>;

/** The name of the click event. */
export const ANODE_CLICK = "anode:click";

/** What kind of call drew a clickable line. */
export type LineHitKind = "connection" | "line" | "polyline" | "series" | "path";

/** The line under a point, as it was drawn in the most recent frame. */
export interface LineHitTarget {
	id: string;
	kind: LineHitKind;
	/** Source node id, for connections. */
	from?: string;
	/** Target node id, for connections. */
	to?: string;
	/** The connection's label, if it has one. */
	label?: string;
	/** Whatever was passed as `data`. */
	data?: unknown;
	/**
	 * Bounding box of the line in CSS pixels relative to the canvas, at the pan and zoom of the
	 * hit test. It contains the line; around curves it may be a little larger.
	 */
	screen: Rect;
	/** The label plate of a labelled connection, in CSS pixels relative to the canvas. */
	labelScreen?: Rect;
}

/** The result of {@linkcode Anodized.hitTestLine}. */
export interface LineHitResult {
	hit: boolean;
	/** The topmost clickable line near the point. */
	target?: LineHitTarget;
	/** The closest point on the line, in world units. Where you'd drop something new. */
	point?: { x: number; y: number };
	/**
	 * Which piece of the line was hit. For `line`, `polyline` and `series` this is the interval
	 * between point `segment` and `segment + 1`; for `path` and `connection` it is the index of
	 * the path segment (lines, curves and closes, in order).
	 */
	segment?: number;
	/** Distance from the start of the line to `point`, in world units. */
	along?: number;
	/** `along` as a fraction of the line's total length, `0..1`. */
	fraction?: number;
	/** The clicked point in world units. */
	x: number;
	y: number;
	/** The clicked point in CSS pixels relative to the canvas. */
	screenX: number;
	screenY: number;
}

/** `detail` of an `anode:lineclick` event. */
export interface AnodeLineClickDetail extends LineHitResult {
	/** `MouseEvent.button`: 0 primary, 1 middle, 2 secondary. */
	button: number;
}

/**
 * Dispatched on the canvas instead of `anode:click` when the topmost thing under a click is a
 * clickable line. It bubbles.
 */
export type AnodeLineClickEvent = CustomEvent<AnodeLineClickDetail>;

/** The name of the line click event. */
export const ANODE_LINE_CLICK = "anode:lineclick";

/** Options for {@linkcode Anodized.loop}. */
export interface LoopOptions {
	/**
	 * Redraw on every animation frame instead of only when something changed. Same as setting
	 * {@linkcode Anodized.continuous}, which can be flipped at any time.
	 */
	continuous?: boolean;
}

/** A frame's draw callback. */
export type DrawFn = (f: Frame) => void;

import type { Font } from "./text/ttf.ts";
import type { Frame } from "./core/frame.ts";
export type { Font, Frame };
export type { Anodized } from "./core/anodized.ts";
export type { Camera } from "./core/camera.ts";
export type { Path } from "./geometry/path.ts";
export type { AnodizedOptions, HeadlessOptions } from "./core/anodized.ts";
export type { Transform } from "./core/camera.ts";
export type { LinearScale } from "./core/scale.ts";
export type { Verb } from "./geometry/path.ts";
export type { Backend, DrawItem, Geometry, ImageDraw, Offscreen, Surface } from "./gpu/backend.ts";
export type { LayoutOptions, PlacedGlyph, TextLayout, TextLine } from "./text/layout.ts";
export type { NodeGeometry } from "./solvers/anchors.ts";
export type { Route, RouteRequest } from "./solvers/route.ts";
