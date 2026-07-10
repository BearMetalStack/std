import type { Html } from "@bearmetal/jsx";

type SignalLike<T = unknown> = { get(): T };

export type MakeChild<Extra = never> =
	| globalThis.Element
	| Html
	| Promise<globalThis.Element | Html>
	| string
	| number
	| boolean
	| null
	| undefined
	| Extra
	| MakeChild<Extra>[];

export type MakeChildren<Extra = never> = MakeChild<Extra> | MakeChild<Extra>[];

export interface MakeCommonProps<Extra = never> {
	class?: string | Extra;
	id?: string | Extra;
	style?: string | Partial<CSSStyleDeclaration> | Extra;
	title?: string | Extra;
	tabindex?: number | Extra;
	hidden?: boolean | Extra;
	popover?: boolean | Extra;
	children?: MakeChildren<Extra>;
	raw?: boolean;
	ref?: string;
	[key: `data-${string}`]: string | undefined;
	[key: `aria-${string}`]: string | boolean | undefined;
}

export type EventProps = {
	[K in keyof HTMLElementEventMap as `on${Capitalize<K>}`]?: (
		e: HTMLElementEventMap[K],
	) => void;
};

export type MakeBaseProps<Extra = never> = MakeCommonProps<Extra> & EventProps;

export type MakeHtmlProps<Extra = never> = MakeBaseProps<Extra> & {
	lang?: string | Extra;
};

export interface MakeAnchorProps<Extra = never> extends MakeBaseProps<Extra> {
	href?: string | Extra;
	target?: string | Extra;
	rel?: string | Extra;
	download?: string | Extra;
}

export interface MakeButtonProps<Extra = never> extends MakeBaseProps<Extra> {
	type?: "button" | "submit" | "reset";
	disabled?: boolean | Extra;
	name?: string | Extra;
	value?: string | Extra;
	popovertarget?: string | Extra;
	popovertargetaction?: "hide" | "show" | "toggle" | Extra;
}

export interface MakeInputProps<Extra = never> extends MakeBaseProps<Extra> {
	type?: string | Extra;
	value?: string | Extra;
	placeholder?: string | Extra;
	disabled?: boolean | Extra;
	checked?: boolean | Extra;
	required?: boolean | Extra;
	min?: string | Extra;
	max?: string | Extra;
	step?: string | Extra;
	name?: string | Extra;
	readonly?: boolean | Extra;
	multiple?: boolean | Extra;
	accept?: string | Extra;
	popovertarget?: string | Extra;
	popovertargetaction?: "hide" | "show" | "toggle" | Extra;
}

export interface MakeTextareaProps<Extra = never> extends MakeBaseProps<Extra> {
	placeholder?: string | Extra;
	disabled?: boolean | Extra;
	required?: boolean | Extra;
	rows?: number | Extra;
	cols?: number | Extra;
	readonly?: boolean | Extra;
	name?: string | Extra;
}

export interface MakeSelectProps<Extra = never> extends MakeBaseProps<Extra> {
	disabled?: boolean | Extra;
	required?: boolean | Extra;
	multiple?: boolean | Extra;
	name?: string | Extra;
	value?: string | Extra;
}

export interface MakeOptionProps<Extra = never> extends MakeBaseProps<Extra> {
	value?: string | Extra;
	disabled?: boolean | Extra;
	selected?: boolean | Extra;
}

export interface MakeFormProps<Extra = never> extends MakeBaseProps<Extra> {
	action?: string | Extra;
	method?: string | Extra;
	enctype?: string | Extra;
	novalidate?: boolean | Extra;
}

export interface MakeImgProps<Extra = never> extends MakeBaseProps<Extra> {
	src?: string | Extra;
	alt?: string | Extra;
	width?: number | string | Extra;
	height?: number | string | Extra;
	loading?: "lazy" | "eager" | Extra;
	srcset?: string | Extra;
	sizes?: string | Extra;
	fetchPriority?: "high" | "low" | "auto" | Extra;
}

export interface MakeVideoProps<Extra = never> extends MakeBaseProps<Extra> {
	src?: string | Extra;
	controls?: boolean | Extra;
	autoplay?: boolean | Extra;
	loop?: boolean | Extra;
	muted?: boolean | Extra;
	poster?: string | Extra;
	width?: number | string | Extra;
	height?: number | string | Extra;
}

export interface MakeAudioProps<Extra = never> extends MakeBaseProps<Extra> {
	src?: string | Extra;
	controls?: boolean | Extra;
	autoplay?: boolean | Extra;
	loop?: boolean | Extra;
	muted?: boolean | Extra;
}

export interface MakeSourceProps<Extra = never> extends MakeBaseProps<Extra> {
	src?: string | Extra;
	type?: string | Extra;
	srcset?: string | Extra;
	media?: string | Extra;
}

export interface MakeIframeProps<Extra = never> extends MakeBaseProps<Extra> {
	src?: string | Extra;
	width?: number | string | Extra;
	height?: number | string | Extra;
	title?: string | Extra;
	allow?: string | Extra;
	sandbox?: string | Extra;
}

export interface MakeLinkProps<Extra = never> extends MakeBaseProps<Extra> {
	href?: string | Extra;
	rel?: string | Extra;
	type?: string | Extra;
	media?: string | Extra;
	as?: string | Extra;
	crossorigin?: string | boolean | Extra;
}

export interface MakeMetaProps<Extra = never> extends MakeBaseProps<Extra> {
	name?: string | Extra;
	content?: string | Extra;
	charset?: string | Extra;
	"http-equiv"?: string | Extra;
}

export interface MakeScriptProps<Extra = never> extends MakeBaseProps<Extra> {
	src?: string | Extra;
	type?: string | Extra;
	async?: boolean | Extra;
	defer?: boolean | Extra;
	crossorigin?: string | Extra;
}

export interface MakeTdProps<Extra = never> extends MakeBaseProps<Extra> {
	colspan?: number | Extra;
	rowspan?: number | Extra;
}

export interface MakeThProps<Extra = never> extends MakeBaseProps<Extra> {
	colspan?: number | Extra;
	rowspan?: number | Extra;
	scope?: string | Extra;
}

export interface MakeColProps<Extra = never> extends MakeBaseProps<Extra> {
	span?: number | Extra;
}

export interface MakeLabelProps<Extra = never> extends MakeBaseProps<Extra> {
	for?: string | Extra;
}

export interface MakeDetailsProps<Extra = never> extends MakeBaseProps<Extra> {
	open?: boolean | Extra;
}

export interface MakeDialogProps<Extra = never> extends MakeBaseProps<Extra> {
	open?: boolean | Extra;
}

export interface MakeProgressProps<Extra = never> extends MakeBaseProps<Extra> {
	value?: number | Extra;
	max?: number | Extra;
}

export interface MakeMeterProps<Extra = never> extends MakeBaseProps<Extra> {
	value?: number | Extra;
	min?: number | Extra;
	max?: number | Extra;
	low?: number | Extra;
	high?: number | Extra;
	optimum?: number | Extra;
}

export interface MakeFieldsetProps<Extra = never> extends MakeBaseProps<Extra> {
	disabled?: boolean | Extra;
}

export interface MakeTrackProps<Extra = never> extends MakeBaseProps<Extra> {
	src?: string | Extra;
	kind?: string | Extra;
	srclang?: string | Extra;
	label?: string | Extra;
	default?: boolean | Extra;
}

export interface MakeCanvasProps<Extra = never> extends MakeBaseProps<Extra> {
	width?: number | Extra;
	height?: number | Extra;
}

export interface MakeOlProps<Extra = never> extends MakeBaseProps<Extra> {
	reversed?: boolean | Extra;
	start?: number | Extra;
	type?: string | Extra;
}

export interface MakeSlotProps<Extra = never> extends MakeBaseProps<Extra> {
	name?: string | Extra;
}

export type MakeIntrinsicElements<Extra = never> = {
	div: MakeBaseProps<Extra>;
	span: MakeBaseProps<Extra>;
	p: MakeBaseProps<Extra>;
	section: MakeBaseProps<Extra>;
	article: MakeBaseProps<Extra>;
	aside: MakeBaseProps<Extra>;
	main: MakeBaseProps<Extra>;
	header: MakeBaseProps<Extra>;
	footer: MakeBaseProps<Extra>;
	nav: MakeBaseProps<Extra>;
	h1: MakeBaseProps<Extra>;
	h2: MakeBaseProps<Extra>;
	h3: MakeBaseProps<Extra>;
	h4: MakeBaseProps<Extra>;
	h5: MakeBaseProps<Extra>;
	h6: MakeBaseProps<Extra>;
	ul: MakeBaseProps<Extra>;
	ol: MakeOlProps<Extra>;
	li: MakeBaseProps<Extra>;
	dl: MakeBaseProps<Extra>;
	dt: MakeBaseProps<Extra>;
	dd: MakeBaseProps<Extra>;
	figure: MakeBaseProps<Extra>;
	figcaption: MakeBaseProps<Extra>;
	blockquote: MakeBaseProps<Extra>;
	pre: MakeBaseProps<Extra>;
	code: MakeBaseProps<Extra>;
	kbd: MakeBaseProps<Extra>;
	samp: MakeBaseProps<Extra>;
	var: MakeBaseProps<Extra>;
	strong: MakeBaseProps<Extra>;
	em: MakeBaseProps<Extra>;
	small: MakeBaseProps<Extra>;
	mark: MakeBaseProps<Extra>;
	del: MakeBaseProps<Extra>;
	ins: MakeBaseProps<Extra>;
	sub: MakeBaseProps<Extra>;
	sup: MakeBaseProps<Extra>;
	abbr: MakeBaseProps<Extra>;
	cite: MakeBaseProps<Extra>;
	q: MakeBaseProps<Extra>;
	time: MakeBaseProps<Extra>;
	address: MakeBaseProps<Extra>;
	hr: MakeBaseProps<Extra>;
	br: MakeBaseProps<Extra>;
	wbr: MakeBaseProps<Extra>;
	summary: MakeBaseProps<Extra>;
	a: MakeAnchorProps<Extra>;
	button: MakeButtonProps<Extra>;
	input: MakeInputProps<Extra>;
	textarea: MakeTextareaProps<Extra>;
	select: MakeSelectProps<Extra>;
	option: MakeOptionProps<Extra>;
	optgroup: MakeBaseProps<Extra>;
	form: MakeFormProps<Extra>;
	label: MakeLabelProps<Extra>;
	fieldset: MakeFieldsetProps<Extra>;
	legend: MakeBaseProps<Extra>;
	details: MakeDetailsProps<Extra>;
	dialog: MakeDialogProps<Extra>;
	img: MakeImgProps<Extra>;
	video: MakeVideoProps<Extra>;
	audio: MakeAudioProps<Extra>;
	source: MakeSourceProps<Extra>;
	picture: MakeBaseProps<Extra>;
	iframe: MakeIframeProps<Extra>;
	canvas: MakeCanvasProps<Extra>;
	track: MakeTrackProps<Extra>;
	embed: MakeBaseProps<Extra>;
	object: MakeBaseProps<Extra>;
	table: MakeBaseProps<Extra>;
	thead: MakeBaseProps<Extra>;
	tbody: MakeBaseProps<Extra>;
	tfoot: MakeBaseProps<Extra>;
	tr: MakeBaseProps<Extra>;
	td: MakeTdProps<Extra>;
	th: MakeThProps<Extra>;
	colgroup: MakeBaseProps<Extra>;
	col: MakeColProps<Extra>;
	caption: MakeBaseProps<Extra>;
	head: MakeBaseProps<Extra>;
	body: MakeBaseProps<Extra>;
	html: MakeHtmlProps<Extra>;
	title: MakeBaseProps<Extra>;
	link: MakeLinkProps<Extra>;
	meta: MakeMetaProps<Extra>;
	script: MakeScriptProps<Extra>;
	style: MakeBaseProps<Extra>;
	base: MakeBaseProps<Extra>;
	slot: MakeSlotProps<Extra>;
	template: MakeBaseProps<Extra>;
	noscript: MakeBaseProps<Extra>;
	progress: MakeProgressProps<Extra>;
	meter: MakeMeterProps<Extra>;
	map: MakeBaseProps<Extra>;
	area: MakeBaseProps<Extra>;
	// deno-lint-ignore no-explicit-any
	[tag: string]: any;
};
