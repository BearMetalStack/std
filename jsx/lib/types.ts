import type { Html } from "@bearmetal/jsx";
import type { CustomProps } from "../types.ts";

type SignalLike<T = unknown> = { get(): T };
export type WritableSignalLike<T = unknown> = SignalLike<T> & { set(value: T): void };

export type MakeChild<Extra = never> =
	| globalThis.Element
	// A DocumentFragment is a valid child — it is a Node, so `appendChild`
	// splices its contents in. `<>…</>`, `each()` and `<For>` all return one, to
	// keep what they render transparent (no wrapper element) in the DOM.
	| globalThis.DocumentFragment
	| Html
	// A value that has not arrived yet. The runtime holds a slot for it and
	// fills it in when it settles; a server render waits before serializing.
	| Promise<globalThis.Element | globalThis.DocumentFragment | Html>
	| string
	| number
	| boolean
	| null
	| undefined
	| Extra
	| MakeChild<Extra>[];

export type MakeChildren<Extra = never> = MakeChild<Extra> | MakeChild<Extra>[];

/** Every CSS property `CSSStyleDeclaration` knows, by its camelCase name. */
export type CssPropertyName = Exclude<
	{
		[K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string ? K : never;
	}[keyof CSSStyleDeclaration],
	number | "cssText"
>;

/** One declaration's value. `null`, `undefined` and `false` leave the property unset. */
export type CssValue = string | number | null | undefined | false;

/**
 * An inline style written as an object.
 *
 * Keys are camelCase CSS properties, kebab-case ones, or custom properties
 * (`--accent`). A number gets `px` appended unless the property is unitless
 * (`opacity`, `zIndex`, `lineHeight`, …). Any single value may be a signal, and
 * only that property is rewritten when it changes.
 */
export type MakeStyleObject<Extra = never> =
	& { [K in CssPropertyName]?: CssValue | Extra }
	& { [key: `--${string}`]: CssValue | Extra }
	& { [key: `${string}-${string}`]: CssValue | Extra };

/** The attributes every element takes, HTML or SVG. */
export interface MakeCoreProps<Extra = never> extends CustomProps {
	class?: string | Extra;
	id?: string | Extra;
	style?: string | MakeStyleObject<Extra> | Extra;
	role?: string | Extra;
	tabindex?: number | Extra;
	/** A boolean attribute: `true` adds it, `false` leaves it off. */
	autofocus?: boolean | Extra;
	lang?: string | Extra;
	children?: MakeChildren<Extra>;
	$raw?: boolean;
	ref?: string;
	[key: `data-${string}`]: string | undefined;
	[key: `aria-${string}`]: string | boolean | undefined;
}

/** The global attributes of an HTML element. */
export interface MakeCommonProps<Extra = never> extends MakeCoreProps<Extra> {
	title?: string | Extra;
	hidden?: boolean | Extra;
	popover?: boolean | "manual" | "hint" | "auto" | Extra;
	draggable?: boolean | "true" | "false" | Extra;
	/**
	 * An enumerated attribute, not a boolean one — `spellcheck="false"` turns it
	 * off, while a bare or absent `spellcheck` leaves the browser's default. So
	 * it takes the strings, which is what the runtime writes through.
	 */
	spellcheck?: "true" | "false" | Extra;
	inputmode?:
		| "none"
		| "text"
		| "decimal"
		| "numeric"
		| "tel"
		| "search"
		| "email"
		| "url"
		| Extra;
	enterkeyhint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send" | Extra;
	autocapitalize?: "off" | "none" | "on" | "sentences" | "words" | "characters" | Extra;
	dir?: "ltr" | "rtl" | "auto" | Extra;
	translate?: "yes" | "no" | Extra;
	inert?: boolean | Extra;
}

/**
 * An event as a handler on `Current` receives it: `currentTarget` is always
 * `Current`, and `target` is whatever `Target` says it can be.
 *
 * ```ts
 * const save = (e: TargetedEvent<HTMLFormElement, SubmitEvent>) => {
 * 	e.preventDefault();
 * 	new FormData(e.currentTarget);
 * };
 * ```
 */
export type TargetedEvent<
	Current extends EventTarget = EventTarget,
	Ev extends Event = Event,
	Target extends EventTarget | null = Current,
> =
	& Omit<Ev, "currentTarget" | "target">
	& {
		readonly currentTarget: Current;
		readonly target: Target;
	};

/** A listener for one event type. */
export type EventHandler<Ev extends Event = Event> = (e: Ev) => void;

/** The event names and payloads an element of type `E` dispatches. */
export type EventMapFor<E extends Element> = E extends HTMLVideoElement ? HTMLVideoElementEventMap
	: E extends HTMLMediaElement ? HTMLMediaElementEventMap
	: E extends HTMLBodyElement ? HTMLBodyElementEventMap
	: E extends HTMLFrameSetElement ? HTMLFrameSetElementEventMap
	: E extends SVGElement ? SVGElementEventMap
	: E extends HTMLElement ? HTMLElementEventMap
	: ElementEventMap;

type NonBubblingEvent =
	| "abort"
	| "beforetoggle"
	| "blur"
	| "cancel"
	| "canplay"
	| "canplaythrough"
	| "close"
	| "contextlost"
	| "contextrestored"
	| "durationchange"
	| "emptied"
	| "ended"
	| "error"
	| "focus"
	| "invalid"
	| "load"
	| "loadeddata"
	| "loadedmetadata"
	| "loadstart"
	| "mouseenter"
	| "mouseleave"
	| "pause"
	| "play"
	| "playing"
	| "pointerenter"
	| "pointerleave"
	| "progress"
	| "ratechange"
	| "resize"
	| "scroll"
	| "scrollend"
	| "seeked"
	| "seeking"
	| "stalled"
	| "suspend"
	| "timeupdate"
	| "toggle"
	| "volumechange"
	| "waiting";

type VoidElement =
	| HTMLAreaElement
	| HTMLBaseElement
	| HTMLBRElement
	| HTMLEmbedElement
	| HTMLHRElement
	| HTMLImageElement
	| HTMLInputElement
	| HTMLLinkElement
	| HTMLMetaElement
	| HTMLSourceElement
	| HTMLTableColElement
	| HTMLTrackElement;

/**
 * The events whose `target` is guaranteed to be the element the handler is on.
 *
 * Anything that bubbles can arrive from a descendant, so a `click` on a
 * `<button>` may well have a `<span>` for its target. What is left: events
 * that do not bubble, every event on an element that has no element children,
 * and the events only an element of this kind dispatches (`submit` on a form —
 * forms do not nest; `input`/`change` on a form control).
 */
export type SelfTargetedEvent<E extends Element> =
	| NonBubblingEvent
	| (E extends VoidElement | HTMLTextAreaElement ? keyof EventMapFor<E> : never)
	| (E extends HTMLFormElement ? "submit" | "reset" | "formdata" : never)
	| (E extends HTMLSelectElement ? "input" | "change" | "beforeinput" : never);

/**
 * The event a handler for `K` on an element of type `E` receives.
 *
 * ```ts
 * const onSubmit = (e: ElementEvent<HTMLFormElement, "submit">) => {
 * 	e.target; // HTMLFormElement
 * 	e.submitter; // HTMLElement | null
 * };
 * ```
 */
export type ElementEvent<
	E extends Element,
	K extends keyof EventMapFor<E>,
> = EventMapFor<E>[K] extends infer Ev extends Event
	? TargetedEvent<E, Ev, K extends SelfTargetedEvent<E> ? E : EventTarget | null>
	: never;

/** The `on*` handler props of an element of type `E`. */
export type EventProps<E extends Element = HTMLElement> = {
	[K in keyof EventMapFor<E> & string as `on${Capitalize<K>}`]?: EventHandler<
		ElementEvent<E, K>
	>;
};

export type MakeBaseProps<Extra = never, E extends Element = HTMLElement> =
	& MakeCommonProps<Extra>
	& EventProps<E>;

export type MakeHtmlProps<Extra = never, E extends Element = HTMLHtmlElement> =
	& MakeBaseProps<Extra, E>
	& {
		lang?: string | Extra;
	};

export interface MakeAnchorProps<Extra = never> extends MakeBaseProps<Extra, HTMLAnchorElement> {
	href?: string | Extra;
	target?: string | Extra;
	rel?: string | Extra;
	/** `true` for a bare `download`; a string suggests the saved file's name. */
	download?: boolean | string | Extra;
	hreflang?: string | Extra;
	referrerpolicy?: string | Extra;
}

export interface MakeButtonProps<Extra = never> extends MakeBaseProps<Extra, HTMLButtonElement> {
	type?: "button" | "submit" | "reset";
	disabled?: boolean | Extra;
	name?: string | Extra;
	value?: string | Extra;
	popovertarget?: string | Extra;
	popovertargetaction?: "hide" | "show" | "toggle" | Extra;
}

export interface MakeInputProps<Extra = never> extends MakeBaseProps<Extra, HTMLInputElement> {
	type?: string | Extra;
	value?: string | Extra;
	placeholder?: string | Extra;
	disabled?: boolean | Extra;
	checked?: boolean | Extra;
	required?: boolean | Extra;
	min?: string | number | Extra;
	max?: string | number | Extra;
	step?: string | number | Extra;
	name?: string | Extra;
	readonly?: boolean | Extra;
	multiple?: boolean | Extra;
	accept?: string | Extra;
	pattern?: string | Extra;
	size?: number | Extra;
	list?: string | Extra;
	form?: string | Extra;
	capture?: "user" | "environment" | Extra;
	popovertarget?: string | Extra;
	popovertargetaction?: "hide" | "show" | "toggle" | Extra;
	autocomplete?: "off" | "on" | string | Extra;
	maxlength?: number | Extra;
	minlength?: number | Extra;
	$bind?: Extra extends never ? never : WritableSignalLike;
	$type?: Extra extends never ? never : (raw: string | boolean) => unknown;
}

export interface MakeTextareaProps<Extra = never>
	extends MakeBaseProps<Extra, HTMLTextAreaElement> {
	placeholder?: string | Extra;
	disabled?: boolean | Extra;
	required?: boolean | Extra;
	rows?: number | Extra;
	cols?: number | Extra;
	wrap?: "hard" | "soft" | "off" | Extra;
	readonly?: boolean | Extra;
	name?: string | Extra;
	autocomplete?: "off" | "on" | string | Extra;
	maxlength?: number | Extra;
	minlength?: number | Extra;
	$bind?: Extra extends never ? never : WritableSignalLike;
	$type?: Extra extends never ? never : (raw: string | boolean) => unknown;
}

export interface MakeSelectProps<Extra = never> extends MakeBaseProps<Extra, HTMLSelectElement> {
	disabled?: boolean | Extra;
	required?: boolean | Extra;
	multiple?: boolean | Extra;
	name?: string | Extra;
	value?: string | Extra;
	autocomplete?: "off" | "on" | string | Extra;
	$bind?: Extra extends never ? never : WritableSignalLike;
	$type?: Extra extends never ? never : (raw: string | boolean) => unknown;
}

export interface MakeOptionProps<Extra = never> extends MakeBaseProps<Extra, HTMLOptionElement> {
	value?: string | Extra;
	disabled?: boolean | Extra;
	selected?: boolean | Extra;
}

export interface MakeFormProps<Extra = never> extends MakeBaseProps<Extra, HTMLFormElement> {
	action?: string | Extra;
	method?: string | Extra;
	enctype?: string | Extra;
	novalidate?: boolean | Extra;
	autocomplete?: "off" | "on" | string | Extra;
}

export interface MakeImgProps<Extra = never> extends MakeBaseProps<Extra, HTMLImageElement> {
	src?: string | Extra;
	alt?: string | Extra;
	width?: number | string | Extra;
	height?: number | string | Extra;
	loading?: "lazy" | "eager" | Extra;
	srcset?: string | Extra;
	sizes?: string | Extra;
	fetchPriority?: "high" | "low" | "auto" | Extra;
}

export interface MakeVideoProps<Extra = never> extends MakeBaseProps<Extra, HTMLVideoElement> {
	src?: string | Extra;
	controls?: boolean | Extra;
	autoplay?: boolean | Extra;
	loop?: boolean | Extra;
	muted?: boolean | Extra;
	poster?: string | Extra;
	width?: number | string | Extra;
	height?: number | string | Extra;
}

export interface MakeAudioProps<Extra = never> extends MakeBaseProps<Extra, HTMLAudioElement> {
	src?: string | Extra;
	controls?: boolean | Extra;
	autoplay?: boolean | Extra;
	loop?: boolean | Extra;
	muted?: boolean | Extra;
}

export interface MakeSourceProps<Extra = never> extends MakeBaseProps<Extra, HTMLSourceElement> {
	src?: string | Extra;
	type?: string | Extra;
	srcset?: string | Extra;
	media?: string | Extra;
}

export interface MakeIframeProps<Extra = never> extends MakeBaseProps<Extra, HTMLIFrameElement> {
	src?: string | Extra;
	width?: number | string | Extra;
	height?: number | string | Extra;
	title?: string | Extra;
	allow?: string | Extra;
	sandbox?: string | Extra;
}

export interface MakeLinkProps<Extra = never> extends MakeBaseProps<Extra, HTMLLinkElement> {
	href?: string | Extra;
	rel?: string | Extra;
	type?: string | Extra;
	media?: string | Extra;
	as?: string | Extra;
	crossorigin?: string | boolean | Extra;
}

export interface MakeMetaProps<Extra = never> extends MakeBaseProps<Extra, HTMLMetaElement> {
	name?: string | Extra;
	content?: string | Extra;
	charset?: string | Extra;
	"http-equiv"?: string | Extra;
}

export interface MakeScriptProps<Extra = never> extends MakeBaseProps<Extra, HTMLScriptElement> {
	src?: string | Extra;
	type?: string | Extra;
	async?: boolean | Extra;
	defer?: boolean | Extra;
	crossorigin?: string | Extra;
}

export interface MakeTdProps<Extra = never> extends MakeBaseProps<Extra, HTMLTableCellElement> {
	colspan?: number | Extra;
	rowspan?: number | Extra;
}

export interface MakeThProps<Extra = never> extends MakeBaseProps<Extra, HTMLTableCellElement> {
	colspan?: number | Extra;
	rowspan?: number | Extra;
	scope?: string | Extra;
}

export interface MakeColProps<Extra = never> extends MakeBaseProps<Extra, HTMLTableColElement> {
	span?: number | Extra;
}

export interface MakeLabelProps<Extra = never> extends MakeBaseProps<Extra, HTMLLabelElement> {
	for?: string | Extra;
}

export interface MakeDetailsProps<Extra = never> extends MakeBaseProps<Extra, HTMLDetailsElement> {
	open?: boolean | Extra;
}

export interface MakeDialogProps<Extra = never> extends MakeBaseProps<Extra, HTMLDialogElement> {
	open?: boolean | Extra;
}

export interface MakeProgressProps<Extra = never>
	extends MakeBaseProps<Extra, HTMLProgressElement> {
	value?: number | Extra;
	max?: number | Extra;
}

export interface MakeMeterProps<Extra = never> extends MakeBaseProps<Extra, HTMLMeterElement> {
	value?: number | Extra;
	min?: number | Extra;
	max?: number | Extra;
	low?: number | Extra;
	high?: number | Extra;
	optimum?: number | Extra;
}

export interface MakeFieldsetProps<Extra = never>
	extends MakeBaseProps<Extra, HTMLFieldSetElement> {
	disabled?: boolean | Extra;
}

export interface MakeTrackProps<Extra = never> extends MakeBaseProps<Extra, HTMLTrackElement> {
	src?: string | Extra;
	kind?: string | Extra;
	srclang?: string | Extra;
	label?: string | Extra;
	default?: boolean | Extra;
}

export interface MakeCanvasProps<Extra = never> extends MakeBaseProps<Extra, HTMLCanvasElement> {
	width?: number | Extra;
	height?: number | Extra;
}

export interface MakeOlProps<Extra = never> extends MakeBaseProps<Extra, HTMLOListElement> {
	reversed?: boolean | Extra;
	start?: number | Extra;
	type?: string | Extra;
}

export interface MakeSlotProps<Extra = never> extends MakeBaseProps<Extra, HTMLSlotElement> {
	name?: string | Extra;
}

// -- SVG --

/**
 * A length, coordinate or plain number. A number is written as-is: unitless,
 * which SVG reads as user units (or as a fraction, under `objectBoundingBox`).
 */
export type SvgLength<Extra = never> = number | string | Extra;

/** A coordinate system for a referencing element's attributes or contents. */
export type SvgUnits = "userSpaceOnUse" | "objectBoundingBox";

/** The props every SVG element takes, with handlers typed for an element of type `E`. */
export type MakeSvgBaseProps<Extra = never, E extends SVGElement = SVGElement> =
	& MakeCoreProps<Extra>
	& EventProps<E>
	& MakeSvgConditionalProps<Extra>;

/** {@linkcode MakeSvgBaseProps} plus the presentation attributes. */
export type MakeSvgProps<Extra = never, E extends SVGElement = SVGElement> =
	& MakeSvgBaseProps<Extra, E>
	& MakeSvgPresentationProps<Extra>;

/** The conditional processing attributes `<switch>` chooses between children by. */
export interface MakeSvgConditionalProps<Extra = never> {
	requiredExtensions?: string | Extra;
	systemLanguage?: string | Extra;
}

/**
 * The presentation attributes: CSS properties SVG also accepts as attributes,
 * written by their kebab-case names (`stroke-width`, not `strokeWidth`).
 */
export interface MakeSvgPresentationProps<Extra = never> {
	"alignment-baseline"?:
		| "auto"
		| "baseline"
		| "before-edge"
		| "text-before-edge"
		| "middle"
		| "central"
		| "after-edge"
		| "text-after-edge"
		| "ideographic"
		| "alphabetic"
		| "hanging"
		| "mathematical"
		| "top"
		| "center"
		| "bottom"
		| Extra;
	"baseline-shift"?: SvgLength<Extra>;
	"clip-path"?: string | Extra;
	"clip-rule"?: "nonzero" | "evenodd" | "inherit" | Extra;
	color?: string | Extra;
	"color-interpolation"?: "auto" | "sRGB" | "linearRGB" | "inherit" | Extra;
	"color-interpolation-filters"?: "auto" | "sRGB" | "linearRGB" | "inherit" | Extra;
	cursor?: string | Extra;
	direction?: "ltr" | "rtl" | "inherit" | Extra;
	display?: string | Extra;
	"dominant-baseline"?:
		| "auto"
		| "text-bottom"
		| "alphabetic"
		| "ideographic"
		| "middle"
		| "central"
		| "mathematical"
		| "hanging"
		| "text-top"
		| "inherit"
		| Extra;
	fill?: string | Extra;
	"fill-opacity"?: number | string | Extra;
	"fill-rule"?: "nonzero" | "evenodd" | "inherit" | Extra;
	filter?: string | Extra;
	"flood-color"?: string | Extra;
	"flood-opacity"?: number | string | Extra;
	"font-family"?: string | Extra;
	"font-size"?: SvgLength<Extra>;
	"font-size-adjust"?: number | string | Extra;
	"font-stretch"?: string | Extra;
	"font-style"?: "normal" | "italic" | "oblique" | "inherit" | Extra;
	"font-variant"?: string | Extra;
	"font-weight"?: number | string | Extra;
	"image-rendering"?: "auto" | "optimizeSpeed" | "optimizeQuality" | "inherit" | Extra;
	"letter-spacing"?: SvgLength<Extra>;
	"lighting-color"?: string | Extra;
	"marker-start"?: string | Extra;
	"marker-mid"?: string | Extra;
	"marker-end"?: string | Extra;
	mask?: string | Extra;
	"mask-type"?: "luminance" | "alpha" | Extra;
	opacity?: number | string | Extra;
	overflow?: "visible" | "hidden" | "scroll" | "auto" | "clip" | "inherit" | Extra;
	"paint-order"?: string | Extra;
	"pointer-events"?:
		| "bounding-box"
		| "visiblePainted"
		| "visibleFill"
		| "visibleStroke"
		| "visible"
		| "painted"
		| "fill"
		| "stroke"
		| "all"
		| "none"
		| "inherit"
		| Extra;
	"shape-rendering"?:
		| "auto"
		| "optimizeSpeed"
		| "crispEdges"
		| "geometricPrecision"
		| "inherit"
		| Extra;
	"stop-color"?: string | Extra;
	"stop-opacity"?: number | string | Extra;
	stroke?: string | Extra;
	"stroke-dasharray"?: string | number | Extra;
	"stroke-dashoffset"?: SvgLength<Extra>;
	"stroke-linecap"?: "butt" | "round" | "square" | "inherit" | Extra;
	"stroke-linejoin"?: "miter" | "miter-clip" | "round" | "bevel" | "arcs" | "inherit" | Extra;
	"stroke-miterlimit"?: number | string | Extra;
	"stroke-opacity"?: number | string | Extra;
	"stroke-width"?: SvgLength<Extra>;
	"text-anchor"?: "start" | "middle" | "end" | "inherit" | Extra;
	"text-decoration"?: string | Extra;
	"text-overflow"?: "clip" | "ellipsis" | string | Extra;
	"text-rendering"?:
		| "auto"
		| "optimizeSpeed"
		| "optimizeLegibility"
		| "geometricPrecision"
		| "inherit"
		| Extra;
	transform?: string | Extra;
	"transform-origin"?: string | Extra;
	"unicode-bidi"?: string | Extra;
	"vector-effect"?:
		| "none"
		| "non-scaling-stroke"
		| "non-scaling-size"
		| "non-rotation"
		| "fixed-position"
		| Extra;
	visibility?: "visible" | "hidden" | "collapse" | "inherit" | Extra;
	"white-space"?: string | Extra;
	"word-spacing"?: SvgLength<Extra>;
	"writing-mode"?: "horizontal-tb" | "vertical-rl" | "vertical-lr" | "inherit" | Extra;
}

/** `x`/`y`/`width`/`height`: the box an element occupies. */
export interface MakeSvgBoxProps<Extra = never> {
	x?: SvgLength<Extra>;
	y?: SvgLength<Extra>;
	width?: SvgLength<Extra>;
	height?: SvgLength<Extra>;
}

/** How an element fits a `viewBox` into its viewport. */
export interface MakeSvgFitToViewBoxProps<Extra = never> {
	/** `"minX minY width height"`. */
	viewBox?: string | Extra;
	preserveAspectRatio?: string | Extra;
}

export interface MakeSvgSvgProps<Extra = never>
	extends
		MakeSvgProps<Extra, SVGSVGElement>,
		MakeSvgBoxProps<Extra>,
		MakeSvgFitToViewBoxProps<Extra> {
	xmlns?: string | Extra;
}

export interface MakeSvgSymbolProps<Extra = never>
	extends
		MakeSvgProps<Extra, SVGSymbolElement>,
		MakeSvgBoxProps<Extra>,
		MakeSvgFitToViewBoxProps<Extra> {
	refX?: SvgLength<Extra>;
	refY?: SvgLength<Extra>;
}

export interface MakeSvgUseProps<Extra = never>
	extends MakeSvgProps<Extra, SVGUseElement>, MakeSvgBoxProps<Extra> {
	href?: string | Extra;
}

export interface MakeSvgImageProps<Extra = never>
	extends MakeSvgProps<Extra, SVGImageElement>, MakeSvgBoxProps<Extra> {
	href?: string | Extra;
	preserveAspectRatio?: string | Extra;
	crossorigin?: "anonymous" | "use-credentials" | "" | Extra;
	decoding?: "sync" | "async" | "auto" | Extra;
}

export interface MakeSvgForeignObjectProps<Extra = never>
	extends MakeSvgProps<Extra, SVGForeignObjectElement>, MakeSvgBoxProps<Extra> {}

export interface MakeSvgViewProps<Extra = never>
	extends MakeSvgBaseProps<Extra, SVGViewElement>, MakeSvgFitToViewBoxProps<Extra> {}

// -- SVG shapes --

/** The author's computed length of a shape's path, which distances along it are scaled to. */
interface MakeSvgPathLengthProps<Extra = never> {
	pathLength?: number | string | Extra;
}

export interface MakeSvgCircleProps<Extra = never>
	extends MakeSvgProps<Extra, SVGCircleElement>, MakeSvgPathLengthProps<Extra> {
	cx?: SvgLength<Extra>;
	cy?: SvgLength<Extra>;
	r?: SvgLength<Extra>;
}

export interface MakeSvgEllipseProps<Extra = never>
	extends MakeSvgProps<Extra, SVGEllipseElement>, MakeSvgPathLengthProps<Extra> {
	cx?: SvgLength<Extra>;
	cy?: SvgLength<Extra>;
	rx?: SvgLength<Extra>;
	ry?: SvgLength<Extra>;
}

export interface MakeSvgLineProps<Extra = never>
	extends MakeSvgProps<Extra, SVGLineElement>, MakeSvgPathLengthProps<Extra> {
	x1?: SvgLength<Extra>;
	y1?: SvgLength<Extra>;
	x2?: SvgLength<Extra>;
	y2?: SvgLength<Extra>;
}

export interface MakeSvgPathProps<Extra = never>
	extends MakeSvgProps<Extra, SVGPathElement>, MakeSvgPathLengthProps<Extra> {
	d?: string | Extra;
}

export interface MakeSvgPolygonProps<Extra = never>
	extends MakeSvgProps<Extra, SVGPolygonElement>, MakeSvgPathLengthProps<Extra> {
	points?: string | Extra;
}

export interface MakeSvgPolylineProps<Extra = never>
	extends MakeSvgProps<Extra, SVGPolylineElement>, MakeSvgPathLengthProps<Extra> {
	points?: string | Extra;
}

export interface MakeSvgRectProps<Extra = never>
	extends
		MakeSvgProps<Extra, SVGRectElement>,
		MakeSvgBoxProps<Extra>,
		MakeSvgPathLengthProps<Extra> {
	rx?: SvgLength<Extra>;
	ry?: SvgLength<Extra>;
}

// -- SVG text --

interface MakeSvgTextContentProps<Extra = never> {
	textLength?: SvgLength<Extra>;
	lengthAdjust?: "spacing" | "spacingAndGlyphs" | Extra;
}

interface MakeSvgTextPositioningProps<Extra = never> {
	x?: SvgLength<Extra>;
	y?: SvgLength<Extra>;
	dx?: SvgLength<Extra>;
	dy?: SvgLength<Extra>;
	rotate?: string | number | Extra;
}

export interface MakeSvgTextProps<Extra = never>
	extends
		MakeSvgProps<Extra, SVGTextElement>,
		MakeSvgTextContentProps<Extra>,
		MakeSvgTextPositioningProps<Extra> {}

export interface MakeSvgTspanProps<Extra = never>
	extends
		MakeSvgProps<Extra, SVGTSpanElement>,
		MakeSvgTextContentProps<Extra>,
		MakeSvgTextPositioningProps<Extra> {}

export interface MakeSvgTextPathProps<Extra = never>
	extends MakeSvgProps<Extra, SVGTextPathElement>, MakeSvgTextContentProps<Extra> {
	href?: string | Extra;
	path?: string | Extra;
	startOffset?: SvgLength<Extra>;
	method?: "align" | "stretch" | Extra;
	spacing?: "auto" | "exact" | Extra;
	side?: "left" | "right" | Extra;
}

// -- SVG paint servers, clipping, masking, markers --

interface MakeSvgGradientProps<Extra = never> {
	href?: string | Extra;
	gradientUnits?: SvgUnits | Extra;
	gradientTransform?: string | Extra;
	spreadMethod?: "pad" | "reflect" | "repeat" | Extra;
}

export interface MakeSvgLinearGradientProps<Extra = never>
	extends MakeSvgProps<Extra, SVGLinearGradientElement>, MakeSvgGradientProps<Extra> {
	x1?: SvgLength<Extra>;
	y1?: SvgLength<Extra>;
	x2?: SvgLength<Extra>;
	y2?: SvgLength<Extra>;
}

export interface MakeSvgRadialGradientProps<Extra = never>
	extends MakeSvgProps<Extra, SVGRadialGradientElement>, MakeSvgGradientProps<Extra> {
	cx?: SvgLength<Extra>;
	cy?: SvgLength<Extra>;
	r?: SvgLength<Extra>;
	fx?: SvgLength<Extra>;
	fy?: SvgLength<Extra>;
	fr?: SvgLength<Extra>;
}

export interface MakeSvgStopProps<Extra = never> extends MakeSvgProps<Extra, SVGStopElement> {
	offset?: number | string | Extra;
}

export interface MakeSvgPatternProps<Extra = never>
	extends
		MakeSvgProps<Extra, SVGPatternElement>,
		MakeSvgBoxProps<Extra>,
		MakeSvgFitToViewBoxProps<Extra> {
	href?: string | Extra;
	patternUnits?: SvgUnits | Extra;
	patternContentUnits?: SvgUnits | Extra;
	patternTransform?: string | Extra;
}

export interface MakeSvgClipPathProps<Extra = never>
	extends MakeSvgProps<Extra, SVGClipPathElement> {
	clipPathUnits?: SvgUnits | Extra;
}

export interface MakeSvgMaskProps<Extra = never>
	extends MakeSvgProps<Extra, SVGMaskElement>, MakeSvgBoxProps<Extra> {
	maskUnits?: SvgUnits | Extra;
	maskContentUnits?: SvgUnits | Extra;
}

export interface MakeSvgMarkerProps<Extra = never>
	extends MakeSvgProps<Extra, SVGMarkerElement>, MakeSvgFitToViewBoxProps<Extra> {
	refX?: SvgLength<Extra>;
	refY?: SvgLength<Extra>;
	markerUnits?: "strokeWidth" | "userSpaceOnUse" | Extra;
	markerWidth?: SvgLength<Extra>;
	markerHeight?: SvgLength<Extra>;
	/** `"auto"`, `"auto-start-reverse"`, or an angle. */
	orient?: "auto" | "auto-start-reverse" | number | string | Extra;
}

// -- SVG filters --

export interface MakeSvgFilterProps<Extra = never>
	extends MakeSvgProps<Extra, SVGFilterElement>, MakeSvgBoxProps<Extra> {
	filterUnits?: SvgUnits | Extra;
	primitiveUnits?: SvgUnits | Extra;
}

/** A filter primitive's input: a keyword, or the `result` of an earlier primitive. */
export type SvgFilterInput<Extra = never> =
	| "SourceGraphic"
	| "SourceAlpha"
	| "BackgroundImage"
	| "BackgroundAlpha"
	| "FillPaint"
	| "StrokePaint"
	| string
	| Extra;

/** What every filter primitive takes: its subregion and the name of its output. */
type MakeSvgFilterPrimitiveProps<Extra, E extends SVGElement> =
	& MakeSvgProps<Extra, E>
	& MakeSvgBoxProps<Extra>
	& { result?: string | Extra };

/** A filter primitive reading one input. */
type MakeSvgFilterPrimitive1Props<Extra, E extends SVGElement> =
	& MakeSvgFilterPrimitiveProps<Extra, E>
	& { in?: SvgFilterInput<Extra> };

/** A filter primitive reading two inputs. */
type MakeSvgFilterPrimitive2Props<Extra, E extends SVGElement> =
	& MakeSvgFilterPrimitive1Props<Extra, E>
	& { in2?: SvgFilterInput<Extra> };

type SvgEdgeMode = "duplicate" | "wrap" | "none";

type SvgChannel = "R" | "G" | "B" | "A";

export interface MakeSvgFeBlendProps<Extra = never>
	extends MakeSvgFilterPrimitive2Props<Extra, SVGFEBlendElement> {
	mode?:
		| "normal"
		| "multiply"
		| "screen"
		| "overlay"
		| "darken"
		| "lighten"
		| "color-dodge"
		| "color-burn"
		| "hard-light"
		| "soft-light"
		| "difference"
		| "exclusion"
		| "hue"
		| "saturation"
		| "color"
		| "luminosity"
		| Extra;
}

export interface MakeSvgFeColorMatrixProps<Extra = never>
	extends MakeSvgFilterPrimitive1Props<Extra, SVGFEColorMatrixElement> {
	type?: "matrix" | "saturate" | "hueRotate" | "luminanceToAlpha" | Extra;
	values?: string | number | Extra;
}

export interface MakeSvgFeComponentTransferProps<Extra = never>
	extends MakeSvgFilterPrimitive1Props<Extra, SVGFEComponentTransferElement> {}

/** `<feFuncR>`, `<feFuncG>`, `<feFuncB>` and `<feFuncA>`: one channel's transfer function. */
export type MakeSvgFeFuncProps<
	Extra = never,
	E extends SVGComponentTransferFunctionElement = SVGComponentTransferFunctionElement,
> =
	& MakeSvgBaseProps<Extra, E>
	& {
		type?: "identity" | "table" | "discrete" | "linear" | "gamma" | Extra;
		tableValues?: string | Extra;
		slope?: number | string | Extra;
		intercept?: number | string | Extra;
		amplitude?: number | string | Extra;
		exponent?: number | string | Extra;
		offset?: number | string | Extra;
	};

export interface MakeSvgFeCompositeProps<Extra = never>
	extends MakeSvgFilterPrimitive2Props<Extra, SVGFECompositeElement> {
	operator?: "over" | "in" | "out" | "atop" | "xor" | "lighter" | "arithmetic" | Extra;
	k1?: number | string | Extra;
	k2?: number | string | Extra;
	k3?: number | string | Extra;
	k4?: number | string | Extra;
}

export interface MakeSvgFeConvolveMatrixProps<Extra = never>
	extends MakeSvgFilterPrimitive1Props<Extra, SVGFEConvolveMatrixElement> {
	order?: number | string | Extra;
	kernelMatrix?: string | Extra;
	divisor?: number | string | Extra;
	bias?: number | string | Extra;
	targetX?: number | string | Extra;
	targetY?: number | string | Extra;
	edgeMode?: SvgEdgeMode | Extra;
	kernelUnitLength?: number | string | Extra;
	preserveAlpha?: "true" | "false" | Extra;
}

export interface MakeSvgFeDiffuseLightingProps<Extra = never>
	extends MakeSvgFilterPrimitive1Props<Extra, SVGFEDiffuseLightingElement> {
	surfaceScale?: number | string | Extra;
	diffuseConstant?: number | string | Extra;
	kernelUnitLength?: number | string | Extra;
}

export interface MakeSvgFeSpecularLightingProps<Extra = never>
	extends MakeSvgFilterPrimitive1Props<Extra, SVGFESpecularLightingElement> {
	surfaceScale?: number | string | Extra;
	specularConstant?: number | string | Extra;
	specularExponent?: number | string | Extra;
	kernelUnitLength?: number | string | Extra;
}

export interface MakeSvgFeDistantLightProps<Extra = never>
	extends MakeSvgBaseProps<Extra, SVGFEDistantLightElement> {
	azimuth?: number | string | Extra;
	elevation?: number | string | Extra;
}

export interface MakeSvgFePointLightProps<Extra = never>
	extends MakeSvgBaseProps<Extra, SVGFEPointLightElement> {
	x?: number | string | Extra;
	y?: number | string | Extra;
	z?: number | string | Extra;
}

export interface MakeSvgFeSpotLightProps<Extra = never>
	extends MakeSvgBaseProps<Extra, SVGFESpotLightElement> {
	x?: number | string | Extra;
	y?: number | string | Extra;
	z?: number | string | Extra;
	pointsAtX?: number | string | Extra;
	pointsAtY?: number | string | Extra;
	pointsAtZ?: number | string | Extra;
	specularExponent?: number | string | Extra;
	limitingConeAngle?: number | string | Extra;
}

export interface MakeSvgFeDisplacementMapProps<Extra = never>
	extends MakeSvgFilterPrimitive2Props<Extra, SVGFEDisplacementMapElement> {
	scale?: number | string | Extra;
	xChannelSelector?: SvgChannel | Extra;
	yChannelSelector?: SvgChannel | Extra;
}

export interface MakeSvgFeDropShadowProps<Extra = never>
	extends MakeSvgFilterPrimitive1Props<Extra, SVGFEDropShadowElement> {
	dx?: number | string | Extra;
	dy?: number | string | Extra;
	stdDeviation?: number | string | Extra;
}

export interface MakeSvgFeFloodProps<Extra = never>
	extends MakeSvgFilterPrimitiveProps<Extra, SVGFEFloodElement> {}

export interface MakeSvgFeGaussianBlurProps<Extra = never>
	extends MakeSvgFilterPrimitive1Props<Extra, SVGFEGaussianBlurElement> {
	stdDeviation?: number | string | Extra;
	edgeMode?: SvgEdgeMode | Extra;
}

export interface MakeSvgFeImageProps<Extra = never>
	extends MakeSvgFilterPrimitiveProps<Extra, SVGFEImageElement> {
	href?: string | Extra;
	preserveAspectRatio?: string | Extra;
	crossorigin?: "anonymous" | "use-credentials" | "" | Extra;
}

export interface MakeSvgFeMergeProps<Extra = never>
	extends MakeSvgFilterPrimitiveProps<Extra, SVGFEMergeElement> {}

export interface MakeSvgFeMergeNodeProps<Extra = never>
	extends MakeSvgBaseProps<Extra, SVGFEMergeNodeElement> {
	in?: SvgFilterInput<Extra>;
}

export interface MakeSvgFeMorphologyProps<Extra = never>
	extends MakeSvgFilterPrimitive1Props<Extra, SVGFEMorphologyElement> {
	operator?: "erode" | "dilate" | Extra;
	radius?: number | string | Extra;
}

export interface MakeSvgFeOffsetProps<Extra = never>
	extends MakeSvgFilterPrimitive1Props<Extra, SVGFEOffsetElement> {
	dx?: number | string | Extra;
	dy?: number | string | Extra;
}

export interface MakeSvgFeTileProps<Extra = never>
	extends MakeSvgFilterPrimitive1Props<Extra, SVGFETileElement> {}

export interface MakeSvgFeTurbulenceProps<Extra = never>
	extends MakeSvgFilterPrimitiveProps<Extra, SVGFETurbulenceElement> {
	baseFrequency?: number | string | Extra;
	numOctaves?: number | string | Extra;
	seed?: number | string | Extra;
	stitchTiles?: "stitch" | "noStitch" | Extra;
	type?: "fractalNoise" | "turbulence" | Extra;
}

// -- SVG animation --

/**
 * When an animation runs. Animation elements take no presentation attributes,
 * so `fill` here is what happens after it ends, not a paint.
 */
interface MakeSvgAnimationTimingProps<Extra = never> {
	begin?: string | Extra;
	dur?: string | Extra;
	end?: string | Extra;
	min?: string | Extra;
	max?: string | Extra;
	restart?: "always" | "whenNotActive" | "never" | Extra;
	repeatCount?: number | "indefinite" | Extra;
	repeatDur?: string | Extra;
	fill?: "freeze" | "remove" | Extra;
}

/** What an animation interpolates between, and how. */
interface MakeSvgAnimationValueProps<Extra = never> {
	calcMode?: "discrete" | "linear" | "paced" | "spline" | Extra;
	values?: string | Extra;
	keyTimes?: string | Extra;
	keySplines?: string | Extra;
	from?: string | number | Extra;
	to?: string | number | Extra;
	by?: string | number | Extra;
}

/** How an animation combines with the underlying value and with its own earlier repeats. */
interface MakeSvgAnimationAdditionProps<Extra = never> {
	additive?: "replace" | "sum" | Extra;
	accumulate?: "none" | "sum" | Extra;
}

/** The element an animation acts on (its parent, without `href`) and which attribute. */
interface MakeSvgAnimationTargetProps<Extra = never> {
	href?: string | Extra;
	attributeName?: string | Extra;
}

export interface MakeSvgAnimateProps<Extra = never>
	extends
		MakeSvgBaseProps<Extra, SVGAnimateElement>,
		MakeSvgAnimationTimingProps<Extra>,
		MakeSvgAnimationValueProps<Extra>,
		MakeSvgAnimationAdditionProps<Extra>,
		MakeSvgAnimationTargetProps<Extra> {}

export interface MakeSvgAnimateTransformProps<Extra = never>
	extends
		MakeSvgBaseProps<Extra, SVGAnimateTransformElement>,
		MakeSvgAnimationTimingProps<Extra>,
		MakeSvgAnimationValueProps<Extra>,
		MakeSvgAnimationAdditionProps<Extra>,
		MakeSvgAnimationTargetProps<Extra> {
	type?: "translate" | "scale" | "rotate" | "skewX" | "skewY" | Extra;
}

export interface MakeSvgAnimateMotionProps<Extra = never>
	extends
		MakeSvgBaseProps<Extra, SVGAnimateMotionElement>,
		MakeSvgAnimationTimingProps<Extra>,
		MakeSvgAnimationValueProps<Extra>,
		MakeSvgAnimationAdditionProps<Extra> {
	href?: string | Extra;
	path?: string | Extra;
	keyPoints?: string | Extra;
	/** `"auto"`, `"auto-reverse"`, or an angle. */
	rotate?: "auto" | "auto-reverse" | number | string | Extra;
}

export interface MakeSvgSetProps<Extra = never>
	extends
		MakeSvgBaseProps<Extra, SVGSetElement>,
		MakeSvgAnimationTimingProps<Extra>,
		MakeSvgAnimationTargetProps<Extra> {
	to?: string | number | Extra;
}

export interface MakeSvgMpathProps<Extra = never> extends MakeSvgBaseProps<Extra, SVGMPathElement> {
	href?: string | Extra;
}

/**
 * The SVG tags, by name.
 *
 * `<a>`, `<script>`, `<style>` and `<title>` are missing: each shares its name
 * with an HTML element, and in JSX the HTML one wins — that is also the
 * namespace the runtime builds them in.
 */
export type MakeSvgIntrinsicElements<Extra = never> = {
	svg: MakeSvgSvgProps<Extra>;
	g: MakeSvgProps<Extra, SVGGElement>;
	defs: MakeSvgProps<Extra, SVGDefsElement>;
	symbol: MakeSvgSymbolProps<Extra>;
	use: MakeSvgUseProps<Extra>;
	switch: MakeSvgProps<Extra, SVGSwitchElement>;
	image: MakeSvgImageProps<Extra>;
	foreignObject: MakeSvgForeignObjectProps<Extra>;
	view: MakeSvgViewProps<Extra>;
	desc: MakeSvgBaseProps<Extra, SVGDescElement>;
	metadata: MakeSvgBaseProps<Extra, SVGMetadataElement>;
	circle: MakeSvgCircleProps<Extra>;
	ellipse: MakeSvgEllipseProps<Extra>;
	line: MakeSvgLineProps<Extra>;
	path: MakeSvgPathProps<Extra>;
	polygon: MakeSvgPolygonProps<Extra>;
	polyline: MakeSvgPolylineProps<Extra>;
	rect: MakeSvgRectProps<Extra>;
	text: MakeSvgTextProps<Extra>;
	tspan: MakeSvgTspanProps<Extra>;
	textPath: MakeSvgTextPathProps<Extra>;
	linearGradient: MakeSvgLinearGradientProps<Extra>;
	radialGradient: MakeSvgRadialGradientProps<Extra>;
	stop: MakeSvgStopProps<Extra>;
	pattern: MakeSvgPatternProps<Extra>;
	clipPath: MakeSvgClipPathProps<Extra>;
	mask: MakeSvgMaskProps<Extra>;
	marker: MakeSvgMarkerProps<Extra>;
	filter: MakeSvgFilterProps<Extra>;
	feBlend: MakeSvgFeBlendProps<Extra>;
	feColorMatrix: MakeSvgFeColorMatrixProps<Extra>;
	feComponentTransfer: MakeSvgFeComponentTransferProps<Extra>;
	feComposite: MakeSvgFeCompositeProps<Extra>;
	feConvolveMatrix: MakeSvgFeConvolveMatrixProps<Extra>;
	feDiffuseLighting: MakeSvgFeDiffuseLightingProps<Extra>;
	feDisplacementMap: MakeSvgFeDisplacementMapProps<Extra>;
	feDistantLight: MakeSvgFeDistantLightProps<Extra>;
	feDropShadow: MakeSvgFeDropShadowProps<Extra>;
	feFlood: MakeSvgFeFloodProps<Extra>;
	feFuncA: MakeSvgFeFuncProps<Extra, SVGFEFuncAElement>;
	feFuncB: MakeSvgFeFuncProps<Extra, SVGFEFuncBElement>;
	feFuncG: MakeSvgFeFuncProps<Extra, SVGFEFuncGElement>;
	feFuncR: MakeSvgFeFuncProps<Extra, SVGFEFuncRElement>;
	feGaussianBlur: MakeSvgFeGaussianBlurProps<Extra>;
	feImage: MakeSvgFeImageProps<Extra>;
	feMerge: MakeSvgFeMergeProps<Extra>;
	feMergeNode: MakeSvgFeMergeNodeProps<Extra>;
	feMorphology: MakeSvgFeMorphologyProps<Extra>;
	feOffset: MakeSvgFeOffsetProps<Extra>;
	fePointLight: MakeSvgFePointLightProps<Extra>;
	feSpecularLighting: MakeSvgFeSpecularLightingProps<Extra>;
	feSpotLight: MakeSvgFeSpotLightProps<Extra>;
	feTile: MakeSvgFeTileProps<Extra>;
	feTurbulence: MakeSvgFeTurbulenceProps<Extra>;
	animate: MakeSvgAnimateProps<Extra>;
	animateMotion: MakeSvgAnimateMotionProps<Extra>;
	animateTransform: MakeSvgAnimateTransformProps<Extra>;
	set: MakeSvgSetProps<Extra>;
	mpath: MakeSvgMpathProps<Extra>;
};

/**
 * Every tag with typed props. An interface rather than an intersection, so its
 * own members win over the string index signature instead of merging with it.
 */
export interface MakeIntrinsicElements<Extra = never> extends MakeSvgIntrinsicElements<Extra> {
	div: MakeBaseProps<Extra, HTMLElementTagNameMap["div"]>;
	span: MakeBaseProps<Extra, HTMLElementTagNameMap["span"]>;
	p: MakeBaseProps<Extra, HTMLElementTagNameMap["p"]>;
	section: MakeBaseProps<Extra, HTMLElementTagNameMap["section"]>;
	article: MakeBaseProps<Extra, HTMLElementTagNameMap["article"]>;
	aside: MakeBaseProps<Extra, HTMLElementTagNameMap["aside"]>;
	main: MakeBaseProps<Extra, HTMLElementTagNameMap["main"]>;
	header: MakeBaseProps<Extra, HTMLElementTagNameMap["header"]>;
	footer: MakeBaseProps<Extra, HTMLElementTagNameMap["footer"]>;
	nav: MakeBaseProps<Extra, HTMLElementTagNameMap["nav"]>;
	h1: MakeBaseProps<Extra, HTMLElementTagNameMap["h1"]>;
	h2: MakeBaseProps<Extra, HTMLElementTagNameMap["h2"]>;
	h3: MakeBaseProps<Extra, HTMLElementTagNameMap["h3"]>;
	h4: MakeBaseProps<Extra, HTMLElementTagNameMap["h4"]>;
	h5: MakeBaseProps<Extra, HTMLElementTagNameMap["h5"]>;
	h6: MakeBaseProps<Extra, HTMLElementTagNameMap["h6"]>;
	ul: MakeBaseProps<Extra, HTMLElementTagNameMap["ul"]>;
	ol: MakeOlProps<Extra>;
	li: MakeBaseProps<Extra, HTMLElementTagNameMap["li"]>;
	dl: MakeBaseProps<Extra, HTMLElementTagNameMap["dl"]>;
	dt: MakeBaseProps<Extra, HTMLElementTagNameMap["dt"]>;
	dd: MakeBaseProps<Extra, HTMLElementTagNameMap["dd"]>;
	figure: MakeBaseProps<Extra, HTMLElementTagNameMap["figure"]>;
	figcaption: MakeBaseProps<Extra, HTMLElementTagNameMap["figcaption"]>;
	blockquote: MakeBaseProps<Extra, HTMLElementTagNameMap["blockquote"]>;
	pre: MakeBaseProps<Extra, HTMLElementTagNameMap["pre"]>;
	code: MakeBaseProps<Extra, HTMLElementTagNameMap["code"]>;
	kbd: MakeBaseProps<Extra, HTMLElementTagNameMap["kbd"]>;
	samp: MakeBaseProps<Extra, HTMLElementTagNameMap["samp"]>;
	var: MakeBaseProps<Extra, HTMLElementTagNameMap["var"]>;
	strong: MakeBaseProps<Extra, HTMLElementTagNameMap["strong"]>;
	em: MakeBaseProps<Extra, HTMLElementTagNameMap["em"]>;
	small: MakeBaseProps<Extra, HTMLElementTagNameMap["small"]>;
	mark: MakeBaseProps<Extra, HTMLElementTagNameMap["mark"]>;
	del: MakeBaseProps<Extra, HTMLElementTagNameMap["del"]>;
	ins: MakeBaseProps<Extra, HTMLElementTagNameMap["ins"]>;
	sub: MakeBaseProps<Extra, HTMLElementTagNameMap["sub"]>;
	sup: MakeBaseProps<Extra, HTMLElementTagNameMap["sup"]>;
	abbr: MakeBaseProps<Extra, HTMLElementTagNameMap["abbr"]>;
	cite: MakeBaseProps<Extra, HTMLElementTagNameMap["cite"]>;
	q: MakeBaseProps<Extra, HTMLElementTagNameMap["q"]>;
	time: MakeBaseProps<Extra, HTMLElementTagNameMap["time"]>;
	address: MakeBaseProps<Extra, HTMLElementTagNameMap["address"]>;
	hr: MakeBaseProps<Extra, HTMLElementTagNameMap["hr"]>;
	br: MakeBaseProps<Extra, HTMLElementTagNameMap["br"]>;
	wbr: MakeBaseProps<Extra, HTMLElementTagNameMap["wbr"]>;
	summary: MakeBaseProps<Extra, HTMLElementTagNameMap["summary"]>;
	a: MakeAnchorProps<Extra>;
	button: MakeButtonProps<Extra>;
	input: MakeInputProps<Extra>;
	textarea: MakeTextareaProps<Extra>;
	select: MakeSelectProps<Extra>;
	option: MakeOptionProps<Extra>;
	optgroup: MakeBaseProps<Extra, HTMLElementTagNameMap["optgroup"]>;
	form: MakeFormProps<Extra>;
	label: MakeLabelProps<Extra>;
	fieldset: MakeFieldsetProps<Extra>;
	legend: MakeBaseProps<Extra, HTMLElementTagNameMap["legend"]>;
	details: MakeDetailsProps<Extra>;
	dialog: MakeDialogProps<Extra>;
	img: MakeImgProps<Extra>;
	video: MakeVideoProps<Extra>;
	audio: MakeAudioProps<Extra>;
	source: MakeSourceProps<Extra>;
	picture: MakeBaseProps<Extra, HTMLElementTagNameMap["picture"]>;
	iframe: MakeIframeProps<Extra>;
	canvas: MakeCanvasProps<Extra>;
	track: MakeTrackProps<Extra>;
	embed: MakeBaseProps<Extra, HTMLElementTagNameMap["embed"]>;
	object: MakeBaseProps<Extra, HTMLElementTagNameMap["object"]>;
	table: MakeBaseProps<Extra, HTMLElementTagNameMap["table"]>;
	thead: MakeBaseProps<Extra, HTMLElementTagNameMap["thead"]>;
	tbody: MakeBaseProps<Extra, HTMLElementTagNameMap["tbody"]>;
	tfoot: MakeBaseProps<Extra, HTMLElementTagNameMap["tfoot"]>;
	tr: MakeBaseProps<Extra, HTMLElementTagNameMap["tr"]>;
	td: MakeTdProps<Extra>;
	th: MakeThProps<Extra>;
	colgroup: MakeBaseProps<Extra, HTMLElementTagNameMap["colgroup"]>;
	col: MakeColProps<Extra>;
	caption: MakeBaseProps<Extra, HTMLElementTagNameMap["caption"]>;
	head: MakeBaseProps<Extra, HTMLElementTagNameMap["head"]>;
	body: MakeBaseProps<Extra, HTMLElementTagNameMap["body"]>;
	html: MakeHtmlProps<Extra, HTMLElementTagNameMap["html"]>;
	title: MakeBaseProps<Extra, HTMLElementTagNameMap["title"]>;
	link: MakeLinkProps<Extra>;
	meta: MakeMetaProps<Extra>;
	script: MakeScriptProps<Extra>;
	style: MakeBaseProps<Extra, HTMLElementTagNameMap["style"]>;
	base: MakeBaseProps<Extra, HTMLElementTagNameMap["base"]>;
	slot: MakeSlotProps<Extra>;
	template: MakeBaseProps<Extra, HTMLElementTagNameMap["template"]>;
	noscript: MakeBaseProps<Extra, HTMLElementTagNameMap["noscript"]>;
	progress: MakeProgressProps<Extra>;
	meter: MakeMeterProps<Extra>;
	map: MakeBaseProps<Extra, HTMLElementTagNameMap["map"]>;
	area: MakeBaseProps<Extra, HTMLElementTagNameMap["area"]>;
	// deno-lint-ignore no-explicit-any
	[tag: string]: any;
}
