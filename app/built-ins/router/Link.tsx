/**
 * `<Link>` — an anchor that navigates without reloading, and knows when it is
 * pointing at the page you are on.
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal } from "../../signals/wrapper.ts";
import { createComputed } from "../../signals.ts";
import { currentHref, navigate, urlSignal } from "./location.ts";
import { isActivePath } from "./match.ts";

/** Props for {@linkcode Link}. */
export interface LinkProps {
	/** Destination, resolved against the current URL. */
	href: string | URL;
	/**
	 * Require the whole path to match before the link counts as active.
	 *
	 * By default a link is active for its section too — `/settings` is active on
	 * `/settings/profile`. The root (`/`) always requires an exact match.
	 */
	exact?: boolean;
	/** Replace the current history entry instead of pushing a new one. */
	replace?: boolean;
	class?: string;
	children?: JSX.Children;
	[key: string]: unknown;
}

/**
 * An anchor that navigates through the router.
 *
 * It renders a real `href`, so middle-click, "open in new tab" and crawlers all
 * behave normally; only a plain left click is intercepted. A cross-origin
 * `href` is left entirely alone and rendered as an ordinary link.
 *
 * While the link points at the current location it carries `data-active` and
 * `aria-current="page"`, which is the hook to style against:
 *
 * ```css
 * a[data-active] { font-weight: 600; }
 * ```
 *
 * @example
 * ```tsx
 * <Link href="/settings" class="nav-item">Settings</Link>
 * <Link href="/" exact>Home</Link>
 * ```
 */
export function Link(props: LinkProps): JSX.Element {
	const { href, exact, replace, children, ...rest } = props;
	const base = new URL(currentHref());
	const target = new URL(href, base);

	if (target.origin !== base.origin) {
		return <a {...rest} href={target.href}>{children}</a>;
	}

	// The server JSX runtime stringifies attribute values without unwrapping
	// signals, so on that side the active flag is resolved to a plain value.
	const active = typeof document === "undefined"
		? isActivePath(target.pathname, base.pathname, exact)
		: activeSignal(target.pathname, exact);

	return (
		<a
			{...rest}
			href={target.pathname + target.search + target.hash}
			data-active={active}
			aria-current={ariaCurrent(active)}
			onClick={(event: MouseEvent) => {
				if (event.defaultPrevented || isSecondaryButton(event)) return;
				if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
				event.preventDefault();
				navigate(target, { replace });
			}}
		>
			{children}
		</a>
	);
}

function activeSignal(pathname: string, exact?: boolean): Signal.Computed<boolean> {
	const url = urlSignal();
	return createComputed(() => isActivePath(pathname, new URL(url.get()).pathname, exact));
}

/**
 * Whether the click came from something other than the primary button.
 *
 * A synthetic `new Event("click")` — what `element.click()` produces outside a
 * browser — carries no `button` at all, and that is a plain click, not a middle
 * click. Only a *positive* button number is a reason to stand aside.
 */
function isSecondaryButton(event: MouseEvent): boolean {
	return event.button > 0;
}

/**
 * `"page"` when active, `false` when not — never `null`. Both JSX runtimes drop
 * a `false` attribute, while a `null` one is only skipped, so an `aria-current`
 * that had been set would linger after the link stopped being active.
 */
function ariaCurrent(
	active: boolean | Signal.Computed<boolean>,
): "page" | false | Signal.Computed<"page" | false> {
	if (typeof active === "boolean") return active ? "page" : false;
	return createComputed(() => active.get() ? "page" : false);
}
