import { BMC, isBMC } from "../lib/bmc.ts";

function applyProps(el: HTMLElement, props: Record<string, unknown>) {
	for (const [key, val] of Object.entries(props)) {
		if (key === "children") continue;
		if (key === "class") {
			el.className = val as string;
		} else if (key.startsWith("on") && typeof val === "function") {
			el.addEventListener(key.slice(2).toLowerCase(), val as EventListener);
		} else if (typeof val === "boolean") {
			if (val) el.setAttribute(key, "");
		} else if (val != null) {
			el.setAttribute(key, String(val));
		}
	}
}

type AnyChild = Node | string | null | undefined;

function appendChildren(
	parent: Element | DocumentFragment,
	children: AnyChild[],
) {
	for (const child of children) {
		if (child == null) continue;
		parent.appendChild(
			typeof child === "string" ? document.createTextNode(child) : child,
		);
	}
}

function flatChildren(children: unknown): AnyChild[] {
	if (children == null) return [];
	if (Array.isArray(children)) {
		return (children as AnyChild[]).flat(Infinity as 0);
	}
	return [children as AnyChild];
}

export function jsx(
	tag:
		| string
		| ((props: Record<string, unknown>) => Element | DocumentFragment)
		| typeof BMC,
	props: Record<string, unknown>,
	_key?: unknown,
): Element | DocumentFragment {
	const { children, raw, ...rest } = props;
	const flat = flatChildren(children);

	if (isBMC(tag)) {
		const el = document.createElement(tag.tag) as HTMLElement;
		applyProps(el, rest);
		appendChildren(el, flat);
		return el;
	}

	if (typeof tag === "function") {
		return tag(props);
	}

	if (tag === "template") {
		const templateEl = document.createElement("template");
		applyProps(templateEl, rest);
		appendChildren(templateEl.content as unknown as DocumentFragment, flat);
		return templateEl;
	}

	const el = document.createElement(tag);
	applyProps(el, rest);
	if (raw) {
		for (const child of flat) {
			if (child == null) continue;
			if (typeof child === "string") {
				el.insertAdjacentHTML("beforeend", child);
			} else {
				el.appendChild(child);
			}
		}
	} else {
		appendChildren(el, flat);
	}
	return el;
}

export const jsxs = jsx;

export function Fragment(
	{ children }: { children?: unknown },
): DocumentFragment {
	const frag = document.createDocumentFragment();
	appendChildren(frag, flatChildren(children));
	return frag;
}

// Module-scoped JSX namespace (TypeScript 5.1+). No declare global - no conflict.
export namespace JSX {
	export type Element = globalThis.Element | DocumentFragment;

	export interface ElementChildrenAttribute {
		children: unknown;
	}

	export type Child = Element | string | number | boolean | null | undefined;
	export type Children = Child | Child[];

	export interface CommonProps {
		class?: string;
		id?: string;
		style?: string | Partial<CSSStyleDeclaration>;
		title?: string;
		tabindex?: number;
		hidden?: boolean;
		children?: Children;
		raw?: boolean;
		[key: `data-${string}`]: string | undefined;
		[key: `aria-${string}`]: string | boolean | undefined;
	}

	export type EventProps = {
		[K in keyof HTMLElementEventMap as `on${Capitalize<K>}`]?: (
			e: HTMLElementEventMap[K],
		) => void;
	};

	export type BaseProps = CommonProps & EventProps;

	export interface AnchorProps extends BaseProps {
		href?: string;
		target?: string;
		rel?: string;
		download?: string;
	}
	export interface ButtonProps extends BaseProps {
		type?: "button" | "submit" | "reset";
		disabled?: boolean;
		name?: string;
		value?: string;
	}
	export interface InputProps extends BaseProps {
		type?: string;
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		checked?: boolean;
		required?: boolean;
		min?: string;
		max?: string;
		step?: string;
		name?: string;
		readonly?: boolean;
		multiple?: boolean;
		accept?: string;
	}
	export interface TextareaProps extends BaseProps {
		placeholder?: string;
		disabled?: boolean;
		required?: boolean;
		rows?: number;
		cols?: number;
		readonly?: boolean;
		name?: string;
	}
	export interface SelectProps extends BaseProps {
		disabled?: boolean;
		required?: boolean;
		multiple?: boolean;
		name?: string;
		value?: string;
	}
	export interface OptionProps extends BaseProps {
		value?: string;
		disabled?: boolean;
		selected?: boolean;
	}
	export interface FormProps extends BaseProps {
		action?: string;
		method?: string;
		enctype?: string;
		novalidate?: boolean;
	}
	export interface ImgProps extends BaseProps {
		src?: string;
		alt?: string;
		width?: number | string;
		height?: number | string;
		loading?: "lazy" | "eager";
		srcset?: string;
		sizes?: string;
	}
	export interface VideoProps extends BaseProps {
		src?: string;
		controls?: boolean;
		autoplay?: boolean;
		loop?: boolean;
		muted?: boolean;
		poster?: string;
		width?: number | string;
		height?: number | string;
	}
	export interface AudioProps extends BaseProps {
		src?: string;
		controls?: boolean;
		autoplay?: boolean;
		loop?: boolean;
		muted?: boolean;
	}
	export interface SourceProps extends BaseProps {
		src?: string;
		type?: string;
		srcset?: string;
		media?: string;
	}
	export interface IframeProps extends BaseProps {
		src?: string;
		width?: number | string;
		height?: number | string;
		title?: string;
		allow?: string;
		sandbox?: string;
	}
	export interface LinkProps extends BaseProps {
		href?: string;
		rel?: string;
		type?: string;
		media?: string;
		as?: string;
		crossorigin?: string;
	}
	export interface MetaProps extends BaseProps {
		name?: string;
		content?: string;
		charset?: string;
		"http-equiv"?: string;
	}
	export interface ScriptProps extends BaseProps {
		src?: string;
		type?: string;
		async?: boolean;
		defer?: boolean;
		crossorigin?: string;
	}
	// deno-lint-ignore no-empty-interface
	export interface TableProps extends BaseProps {}
	export interface TdProps extends BaseProps {
		colspan?: number;
		rowspan?: number;
	}
	export interface ThProps extends BaseProps {
		colspan?: number;
		rowspan?: number;
		scope?: string;
	}
	export interface ColProps extends BaseProps {
		span?: number;
	}
	export interface LabelProps extends BaseProps {
		for?: string;
	}
	export interface DetailsProps extends BaseProps {
		open?: boolean;
	}
	export interface DialogProps extends BaseProps {
		open?: boolean;
	}
	export interface ProgressProps extends BaseProps {
		value?: number;
		max?: number;
	}
	export interface MeterProps extends BaseProps {
		value?: number;
		min?: number;
		max?: number;
		low?: number;
		high?: number;
		optimum?: number;
	}
	export interface FieldsetProps extends BaseProps {
		disabled?: boolean;
	}
	export interface TrackProps extends BaseProps {
		src?: string;
		kind?: string;
		srclang?: string;
		label?: string;
		default?: boolean;
	}
	export interface CanvasProps extends BaseProps {
		width?: number;
		height?: number;
	}
	export interface OlProps extends BaseProps {
		reversed?: boolean;
		start?: number;
		type?: string;
	}
	export interface SlotProps extends BaseProps {
		name?: string;
	}

	export interface IntrinsicElements {
		div: BaseProps;
		span: BaseProps;
		p: BaseProps;
		section: BaseProps;
		article: BaseProps;
		aside: BaseProps;
		main: BaseProps;
		header: BaseProps;
		footer: BaseProps;
		nav: BaseProps;
		h1: BaseProps;
		h2: BaseProps;
		h3: BaseProps;
		h4: BaseProps;
		h5: BaseProps;
		h6: BaseProps;
		ul: BaseProps;
		ol: OlProps;
		li: BaseProps;
		dl: BaseProps;
		dt: BaseProps;
		dd: BaseProps;
		figure: BaseProps;
		figcaption: BaseProps;
		blockquote: BaseProps;
		pre: BaseProps;
		code: BaseProps;
		kbd: BaseProps;
		samp: BaseProps;
		var: BaseProps;
		strong: BaseProps;
		em: BaseProps;
		small: BaseProps;
		mark: BaseProps;
		del: BaseProps;
		ins: BaseProps;
		sub: BaseProps;
		sup: BaseProps;
		abbr: BaseProps;
		cite: BaseProps;
		q: BaseProps;
		time: BaseProps;
		address: BaseProps;
		hr: BaseProps;
		br: BaseProps;
		wbr: BaseProps;
		summary: BaseProps;
		a: AnchorProps;
		button: ButtonProps;
		input: InputProps;
		textarea: TextareaProps;
		select: SelectProps;
		option: OptionProps;
		optgroup: BaseProps;
		form: FormProps;
		label: LabelProps;
		fieldset: FieldsetProps;
		legend: BaseProps;
		details: DetailsProps;
		dialog: DialogProps;
		img: ImgProps;
		video: VideoProps;
		audio: AudioProps;
		source: SourceProps;
		picture: BaseProps;
		iframe: IframeProps;
		canvas: CanvasProps;
		track: TrackProps;
		embed: BaseProps;
		object: BaseProps;
		table: TableProps;
		thead: BaseProps;
		tbody: BaseProps;
		tfoot: BaseProps;
		tr: BaseProps;
		td: TdProps;
		th: ThProps;
		colgroup: BaseProps;
		col: ColProps;
		caption: BaseProps;
		head: BaseProps;
		body: BaseProps;
		html: BaseProps;
		title: BaseProps;
		link: LinkProps;
		meta: MetaProps;
		script: ScriptProps;
		style: BaseProps;
		base: BaseProps;
		slot: SlotProps;
		template: BaseProps;
		noscript: BaseProps;
		progress: ProgressProps;
		meter: MeterProps;
		map: BaseProps;
		area: BaseProps;
		// deno-lint-ignore no-explicit-any
		[tag: string]: any;
	}

	// deno-lint-ignore no-empty-interface
	export interface IntrinsicAttributes {}
}
