/**
 * Which element is being constructed right now, so code running in its class
 * field initializers can find it.
 *
 * Field initializers run inside the constructor, long before `connectedCallback`
 * makes the element the current owner — so a `createEffect()` reached from one
 * (directly, or through a helper like a preference signal) used to have no owner
 * and leak. `@define` wraps each class's constructor in a frame, and the base
 * class claims the frame for itself the moment it starts constructing; anything
 * asking during the rest of that constructor gets the element.
 *
 * @module
 */

/** An element that can take effects created while it was being constructed. */
export interface ConstructionOwner {
	adoptConstructionEffect(fn: () => (() => void) | void): () => void;
}

interface Frame {
	element?: ConstructionOwner;
}

let frame: Frame | null = null;

/** Opens a frame around a constructor call; returns the frame it replaced. */
export function beginConstruction(): Frame | null {
	const prev = frame;
	frame = {};
	return prev;
}

/**
 * Closes the current frame and restores `prev`. A frame opened by a subclass's
 * wrapper sits outside the one its base class's wrapper opened, and only the
 * innermost saw the element claim itself, so the claim is carried outwards.
 */
export function endConstruction(prev: Frame | null): void {
	const inner = frame;
	frame = prev;
	if (frame && !frame.element && inner?.element) frame.element = inner.element;
}

/** Called by the base class constructor: the first element to start constructing owns the frame. */
export function claimConstruction(element: ConstructionOwner): void {
	if (frame && !frame.element) frame.element = element;
}

/** The element whose constructor is running, if any. */
export function constructingElement(): ConstructionOwner | undefined {
	return frame?.element;
}
