import type { Html } from "@bearmetal/jsx";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal } from "./signals/wrapper.ts";

export type SignalOf<T> = Signal.Computed<T> | Signal.State<T>;

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
