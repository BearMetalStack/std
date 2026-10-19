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

export interface MakeCommonProps<Extra = never> extends CustomProps {
	class?: string | Extra;
	id?: string | Extra;
	style?: string | MakeStyleObject<Extra> | Extra;
	title?: string | Extra;
	role?: string | Extra;
	tabindex?: number | Extra;
	hidden?: boolean | Extra;
	popover?: boolean | "manual" | "hint" | "auto" | Extra;
	draggable?: boolean | "true" | "false" | Extra;
	/** A boolean attribute: `true` adds it, `false` leaves it off. */
	autofocus?: boolean | Extra;
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
	lang?: string | Extra;
	dir?: "ltr" | "rtl" | "auto" | Extra;
	translate?: "yes" | "no" | Extra;
	inert?: boolean | Extra;
	children?: MakeChildren<Extra>;
	$raw?: boolean;
	ref?: string;
	[key: `data-${string}`]: string | undefined;
	[key: `aria-${string}`]: string | boolean | undefined;
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

export type MakeIntrinsicElements<Extra = never> = {
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
};
