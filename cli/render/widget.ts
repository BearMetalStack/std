/**
 * The shared lifecycle every interactive widget follows.
 *
 * Acquire a session, take a region, decide inline-versus-alternate-screen, take
 * keyboard focus, paint, wait for a result, then put everything back. Doing this
 * once here is what keeps the prompt and menu implementations to their actual
 * behaviour.
 * @module
 */

import type { KeyEvent } from "../input/mod.ts";
import type { Region, RegionOptions } from "./region.ts";
import { type CliSession, forgetRegion, getOrCreateSession, type Widget } from "./session.ts";

/** Handed to a widget's key handler to drive the frame and finish. */
export interface WidgetControl<T> {
	readonly session: CliSession;
	readonly region: Region;
	/** Repaints from the current state. */
	rerender(): void;
	/** Finishes the widget with a value. */
	resolve(value: T): void;
	/** Finishes the widget by throwing. */
	reject(error: unknown): void;
}

/** Everything a widget has to supply. */
export interface WidgetSpec<T> {
	/** Session to run in. Defaults to the ambient one, or a transient one. */
	session?: CliSession;
	/** Region options — notably `wrap`. */
	region?: RegionOptions;
	/**
	 * Rows the widget would use if unconstrained.
	 *
	 * When this exceeds what is available inline, the session switches to the
	 * alternate screen for the widget's lifetime rather than bulldozing scrollback.
	 * Omit it for widgets that are always short.
	 */
	naturalHeight?(): number;
	/** Opts out of the escalation above, keeping the widget inline whatever its size. */
	neverEscalate?: boolean;
	/** Produces the current frame. */
	frame(ctl: WidgetControl<T>): string[];
	/** Handles one key. */
	onKey(event: KeyEvent, ctl: WidgetControl<T>): void;
	/** Called after the frame is first painted, e.g. to position the cursor. */
	afterRender?(ctl: WidgetControl<T>): void;
	/** Called if the session tears down mid-widget. */
	onCancel?(ctl: WidgetControl<T>): void;
}

/** Runs a widget to completion. */
export function runWidget<T>(spec: WidgetSpec<T>): Promise<T> {
	const { session, release } = getOrCreateSession(spec.session);
	const region = session.region(spec.region);

	let settle: ((value: T) => void) | null = null;
	let fail: ((error: unknown) => void) | null = null;
	let done = false;
	let escalated = false;

	const control: WidgetControl<T> = {
		session,
		region,
		rerender: () => {
			if (done) return;
			const lines = spec.frame(control).slice(0, session.availableRows);
			region.render(lines);
			spec.afterRender?.(control);
		},
		resolve: (value: T) => {
			if (done) return;
			done = true;
			settle?.(value);
		},
		reject: (error: unknown) => {
			if (done) return;
			done = true;
			fail?.(error);
		},
	};

	const widget: Widget = {
		handleKey: (event) => spec.onKey(event, control),
		refresh: () => control.rerender(),
		cancel: () => {
			spec.onCancel?.(control);
			control.reject(new WidgetCancelledError());
		},
	};

	const finish = () => {
		session.pop(widget);
		if (escalated) session.deescalate();
		forgetRegion(session, region);
		release();
	};

	const result = new Promise<T>((resolve, reject) => {
		settle = resolve;
		fail = reject;

		if (spec.naturalHeight && !spec.neverEscalate) {
			if (spec.naturalHeight() > session.availableRows) {
				escalated = session.escalate();
			}
		}

		session.push(widget);
		control.rerender();
	}).finally(finish);

	result.catch(() => {});
	return result;
}

/** Thrown into a widget whose session was torn down before it finished. */
export class WidgetCancelledError extends Error {
	override readonly name = "WidgetCancelledError";
	constructor() {
		super("Interactive widget was cancelled");
	}
}
