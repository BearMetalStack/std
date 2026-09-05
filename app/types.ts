import type { Html } from "@bearmetal/jsx";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal } from "./signals/wrapper.ts";

export type SignalOf<T> = Signal.Computed<T> | Signal.State<T>;

/**
 * Maps a ref-name-to-element-type record (the shape given to `BMElement<TRefs>`
 * or `getRefs<T>()`) to the signals actually returned by `this.refs`/`getRefs()`.
 *
 * A ref is a `Signal.State`, not a live element, so an unregistered or
 * conditionally-absent ref reads as `undefined` rather than throwing — a
 * consumer reads one from inside a `computed()`/`effect()` the same way it
 * reads any other signal.
 */
export type RefSignals<T extends Record<string, Element>> = {
	[K in keyof T]: Signal.State<T[K] | undefined>;
};

/** Anything a `template` may resolve to, other than a signal. */
type TemplateValue = JSX.Element | Html | string | null | undefined;

/**
 * What `BMElement.template` may return.
 *
 * A node is the usual answer. `Html` and a bare string are accepted too, and go
 * through the same child handling the JSX runtime applies — raw markup for
 * `Html`, escaped text for a string.
 *
 * A signal is the reactive form: the component re-renders when it changes.
 * Prefer a static template with signals bound *inside* it, which updates the
 * parts that moved instead of rebuilding the tree.
 */
export type BMTemplate =
	| TemplateValue
	| Signal.State<TemplateValue>
	| Signal.Computed<TemplateValue>;

export type {
	LinkProps,
	NavigateOptions,
	RouteChain,
	RouteContext,
	RouteDescriptor,
	RouteFrame,
	RouteMatch,
	RouteMeta,
	RouteProps,
	RouteRenderer,
	RouterHandle,
	RouterProps,
} from "./built-ins/router/mod.ts";
