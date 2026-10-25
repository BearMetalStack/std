// deno-lint-ignore-file no-namespace
import type {
	ElementEvent as MakeElementEvent,
	EventHandler as MakeEventHandler,
	EventMapFor,
	EventProps as MakeEventProps,
	MakeBaseProps,
	MakeChild,
	MakeChildren,
	MakeIntrinsicElements,
	MakeStyleObject,
	MakeSvgProps,
	TargetedEvent as MakeTargetedEvent,
} from "./lib/types.ts";
import type { BMC } from "./lib/bmc.ts";

type SignalLike<T = unknown> = { get(): T };

/**
 * Props every element accepts, beyond the ones HTML defines — open for
 * extension.
 *
 * A library that claims a prop with `registerPropHandler()` declares its type
 * here, by merging into this interface from its own module:
 *
 * ```ts
 * declare module "@bearmetal/jsx/types" {
 * 	interface CustomProps {
 * 		contextMenu?: MenuSpec;
 * 	}
 * }
 * ```
 *
 * The merge reaches every intrinsic element and every component, because this
 * is what their prop types are built from. Keep the members optional: they are
 * added to tags that know nothing about them.
 *
 * Signal-valued props are the caller's choice, so a prop that a handler is
 * happy to receive reactively should say so in its own type
 * (`contextMenu?: MenuSpec | SignalLike<MenuSpec>`) — nothing widens it here.
 */
// deno-lint-ignore no-empty-interface
export interface CustomProps {}

export namespace JSX {
	/**
	 * What the runtime produces: a node.
	 *
	 * Always a real one — this is the point of having a single runtime — so
	 * `container.appendChild(<div />)` type-checks, on a server as much as in a
	 * browser. A `DocumentFragment` counts: `<>…</>`, `each()` and `<For>` all
	 * produce one, and inserting it splices its contents in with no wrapper
	 * element. A promise is a node that has not arrived yet; the runtime holds a
	 * slot for it and a server render waits before serializing.
	 *
	 * Deliberately *not* `Html`, and not a promise. Both are perfectly good
	 * children — see {@linkcode JSX.Child} — but neither is a node, and every
	 * JSX expression is typed as this one regardless of what tag produced it. A
	 * union covering the two things only an `async` function component can
	 * return would put a cast in front of every `appendChild`.
	 */
	export type Element = globalThis.Element | globalThis.DocumentFragment;
	export type Child = MakeChild<SignalLike>;
	export type Children = MakeChildren<SignalLike>;
	/** The props every element takes, with handlers typed for an element of type `E`. */
	export type BaseProps<E extends globalThis.Element = HTMLElement> = MakeBaseProps<SignalLike, E>;
	/**
	 * The props every SVG element takes, presentation attributes included, with
	 * handlers typed for an element of type `E`.
	 */
	export type SvgProps<E extends SVGElement = SVGElement> = MakeSvgProps<SignalLike, E>;
	/**
	 * An event whose `currentTarget` is `Current` and whose `target` is `Target`
	 * (`Current` unless given).
	 *
	 * ```tsx
	 * const save = (e: JSX.TargetedEvent<HTMLFormElement, SubmitEvent>) => {
	 * 	e.preventDefault();
	 * 	new FormData(e.target);
	 * };
	 * <form onSubmit={save} />;
	 * ```
	 */
	export type TargetedEvent<
		Current extends EventTarget = EventTarget,
		Ev extends Event = Event,
		Target extends EventTarget | null = Current,
	> = MakeTargetedEvent<Current, Ev, Target>;
	/** A listener for one event type. */
	export type EventHandler<Ev extends Event = Event> = MakeEventHandler<Ev>;
	/**
	 * Exactly the event `on<K>` on an element of type `E` receives — for pulling
	 * a handler out of the JSX without restating it.
	 *
	 * ```tsx
	 * const onInput = (e: JSX.ElementEvent<HTMLInputElement, "input">) => {
	 * 	query.set(e.target.value);
	 * };
	 * ```
	 */
	export type ElementEvent<
		E extends globalThis.Element,
		K extends keyof EventMapFor<E>,
	> = MakeElementEvent<E, K>;
	/** The `on*` handler props of an element of type `E`. */
	export type EventProps<E extends globalThis.Element = HTMLElement> = MakeEventProps<E>;
	/** The object form of the `style` prop. */
	export type StyleObject = MakeStyleObject<SignalLike>;
	/**
	 * The tags that may be written directly in JSX.
	 *
	 * An interface, not an alias, so a library can type a tag of its own by
	 * merging into it. Unknown tags are already permitted — the underlying map
	 * has a string index signature — so merging is about giving a tag real props,
	 * not about being allowed to use it.
	 */
	export interface IntrinsicElements extends MakeIntrinsicElements<SignalLike> {}
	// deno-lint-ignore no-explicit-any
	export type ElementType = string | typeof BMC | ((props: any) => any);
	export interface ElementChildrenAttribute {
		children: unknown;
	}
	// deno-lint-ignore no-empty-interface
	export interface IntrinsicAttributes {}
}
