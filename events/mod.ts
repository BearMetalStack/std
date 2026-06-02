/**
 * Promise- and async-generator-based event utilities for `EventTarget` and `EventSource`.
 *
 * Provides standalone functions for one-shot, racing, streaming, debouncing, throttling,
 * buffering, and piping DOM events, plus typed subclasses (`BearMetalEventTarget` and
 * `BearMetalEventSource`) that expose the same API as instance methods with full
 * `EventMap`-based type inference.
 *
 * @module
 */

/**
 * Returns a promise that resolves with the next occurrence of `eventType` on `target`.
 *
 * The listener is registered with `{ once: true }` and cleans itself up automatically.
 *
 * @param target - The event target to listen on.
 * @param eventType - The event type to wait for.
 * @returns A promise that resolves with the fired event.
 */
export function onceEvent<T extends Event = Event>(
	target: EventTarget,
	eventType: string,
): Promise<T> {
	return new Promise((resolve) => {
		target.addEventListener(eventType, (event) => {
			resolve(event as T);
		}, { once: true });
	});
}

/**
 * Dispatches a `CustomEvent` of type `eventType` on `target`, then collects all
 * synchronously fired responses of type `responseType` and resolves with them on the
 * next microtask tick.
 *
 * Useful for request/response patterns where multiple listeners may each respond to a
 * single dispatched event.
 *
 * @param target - The event target to dispatch on and listen to.
 * @param eventType - The event type to dispatch.
 * @param responseType - The event type to collect responses for.
 * @param detail - The `detail` payload attached to the dispatched `CustomEvent`.
 * @returns A promise that resolves with all collected response events.
 */
export function promiseEvent<T extends Event = Event, R extends Event = T, D = unknown>(
	target: EventTarget,
	eventType: string,
	responseType: string,
	detail: D,
): Promise<R[]> {
	return new Promise((resolve) => {
		const responses: R[] = [];
		const handler = (e: Event) => responses.push(e as R);
		target.addEventListener(responseType, handler);
		target.dispatchEvent(new CustomEvent<D>(eventType, { detail }));
		setTimeout(() => {
			resolve(responses);
		}, 0);
	});
}

/**
 * Races multiple event types on the same target and resolves with whichever fires first.
 *
 * @param target - The event target to listen on.
 * @param eventTypes - The event types to race.
 * @returns A promise that resolves with the first event to fire.
 */
export function raceEvent<T extends Event = Event>(
	target: EventTarget,
	eventTypes: string[],
): Promise<T> {
	return Promise.race(eventTypes.map((e) => onceEvent<T>(target, e)));
}

/**
 * Returns an async generator that yields every occurrence of `eventType` on `target`
 * in order, buffering events that arrive while the consumer is awaiting.
 *
 * The listener is removed automatically when the generator is closed (via `return` or
 * `break` from a `for await…of` loop).
 *
 * @param target - The event target to listen on.
 * @param eventType - The event type to stream.
 * @returns An async generator that yields each event as it fires.
 */
export async function* eventStream<T extends Event = Event>(
	target: EventTarget,
	eventType: string,
): AsyncGenerator<T> {
	const queue: T[] = [];
	let resolve: (() => void) | null = null;

	const handler = (e: Event) => {
		queue.push(e as T);
		resolve?.();
		resolve = null;
	};

	target.addEventListener(eventType, handler);

	try {
		while (true) {
			if (queue.length === 0) {
				await new Promise<void>((r) => (resolve = r));
			}
			yield queue.shift()!;
		}
	} finally {
		target.removeEventListener(eventType, handler);
	}
}

/**
 * Like {@link promiseEvent}, but filters the collected responses with `predicate` before
 * resolving.
 *
 * @param target - The event target to dispatch on and listen to.
 * @param eventType - The event type to dispatch.
 * @param responseType - The event type to collect responses for.
 * @param predicate - A function to filter the collected response events.
 * @param detail - The `detail` payload attached to the dispatched `CustomEvent`.
 * @returns A promise that resolves with the filtered response events.
 */
export async function filteredEvent<T extends Event = Event, R extends Event = T>(
	target: EventTarget,
	eventType: string,
	responseType: string,
	predicate: (event: R) => boolean,
	detail: unknown,
): Promise<R[]> {
	return (await promiseEvent<T, R>(target, eventType, responseType, detail)).filter(predicate);
}

/**
 * Returns a promise that resolves with the last occurrence of `eventType` after `wait`
 * milliseconds of silence — i.e., resolves only once the event stops firing for at least
 * `wait` ms.
 *
 * The listener is removed automatically on resolution.
 *
 * @param target - The event target to listen on.
 * @param eventType - The event type to debounce.
 * @param wait - Quiet period in milliseconds before resolving.
 * @returns A promise that resolves with the final debounced event.
 */
export function debounceEvent<T extends Event = Event>(
	target: EventTarget,
	eventType: string,
	wait: number,
): Promise<T> {
	return new Promise<T>((resolve) => {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const handler = (event: Event) => {
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				target.removeEventListener(eventType, handler); // 👈
				resolve(event as T);
			}, wait);
		};
		target.addEventListener(eventType, handler);
	});
}

/**
 * Returns an async generator that yields at most one occurrence of `eventType` per
 * `wait`-millisecond window. Each iteration waits for both the next event and the end of
 * the current window before yielding.
 *
 * @param target - The event target to listen on.
 * @param eventType - The event type to throttle.
 * @param wait - Minimum milliseconds between yielded events.
 * @returns An async generator that yields throttled events.
 */
export async function* throttleEvent<T extends Event = Event>(
	target: EventTarget,
	eventType: string,
	wait: number,
): AsyncGenerator<T> {
	try {
		while (true) {
			const [event] = await Promise.all([
				onceEvent<T>(target, eventType),
				new Promise((resolve) => setTimeout(resolve, wait)),
			]);
			yield event;
		}
	} finally {
		// onceEvent cleans itself up so nothing extra needed here
		// but the block needs to exist to handle the break case cleanly
	}
}

/**
 * Collects all occurrences of `eventType` on `target` over `wait` milliseconds, then
 * resolves with the full array. The listener is removed after the window closes.
 *
 * @param target - The event target to listen on.
 * @param eventType - The event type to buffer.
 * @param wait - Duration in milliseconds to collect events before resolving.
 * @returns A promise that resolves with all events collected during the window.
 */
export function bufferEvent<T extends Event = Event>(
	target: EventTarget,
	eventType: string,
	wait: number,
): Promise<T[]> {
	return new Promise((resolve) => {
		const events: T[] = [];
		const handler = (event: Event) => {
			events.push(event as T);
		};
		target.addEventListener(eventType, handler);
		setTimeout(() => {
			target.removeEventListener(eventType, handler);
			resolve(events);
		}, wait);
	});
}

/**
 * Forwards every `eventType` event from `target` to `destination`, optionally
 * transforming it with `transform` before dispatching.
 *
 * @param target - The source event target.
 * @param destination - The target to forward events to.
 * @param eventType - The event type to forward.
 * @param transform - An optional function to transform each event before forwarding.
 * @returns A teardown function that stops forwarding when called.
 */
export function pipeEvent<T extends Event = Event, R extends Event = T>(
	target: EventTarget,
	destination: EventTarget,
	eventType: string,
	transform?: (e: T) => R,
): () => void {
	const handler = (e: Event) => {
		e = transform ? transform(e as T) : e;
		destination.dispatchEvent(e as R);
	};
	target.addEventListener(eventType, handler);
	return () => {
		target.removeEventListener(eventType, handler);
	};
}

/**
 * A map of event type names to their `CustomEvent` detail shapes.
 * Used as the type parameter for `BearMetalEventTarget` and `BearMetalEventSource`.
 *
 * @example
 * ```ts
 * type MyEvents = {
 *   "user:login": { detail: { userId: string } };
 *   "user:logout": { detail: never };
 * };
 * ```
 */
export type EventMap = Record<string, { detail: unknown }>;

/**
 * A typed `EventTarget` subclass with promise- and generator-based event methods.
 * Methods are inferred from the `TMap` event map when available.
 *
 * @template TMap - An {@link EventMap} describing the events this target can emit.
 */
export class BearMetalEventTarget<TMap extends EventMap> extends EventTarget {
	/** @see {@link onceEvent} for full documentation */
	once<T extends keyof TMap | string = string>(
		eventType: T,
	): Promise<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event> {
		return onceEvent(this, eventType as string);
	}

	/** @see {@link promiseEvent} for full documentation */
	promiseEvent<T extends keyof TMap, R extends keyof TMap>(
		eventType: T,
		responseType: R,
		detail: TMap[T]["detail"],
	): Promise<CustomEvent<TMap[R]["detail"]>[]> {
		return promiseEvent<CustomEvent<TMap[T]["detail"]>, CustomEvent<TMap[R]["detail"]>>(
			this,
			eventType as string,
			responseType as string,
			detail,
		);
	}

	/** @see {@link filteredEvent} for full documentation */
	filteredEvent<T extends keyof TMap, R extends keyof TMap>(
		eventType: T,
		responseType: R,
		predicate: (event: CustomEvent<TMap[R]["detail"]>) => boolean,
		detail: TMap[T]["detail"],
	): Promise<CustomEvent<TMap[R]["detail"]>[]> {
		return filteredEvent<CustomEvent<TMap[T]["detail"]>, CustomEvent<TMap[R]["detail"]>>(
			this,
			eventType as string,
			responseType as string,
			predicate,
			detail,
		);
	}

	/** @see {@link raceEvent} for full documentation */
	race<T extends keyof TMap | string = string>(
		eventTypes: T[],
	): Promise<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event> {
		return raceEvent(this, eventTypes as string[]);
	}

	/** @see {@link eventStream} for full documentation */
	stream<T extends keyof TMap | string = string>(
		eventType: T,
	): AsyncGenerator<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event> {
		return eventStream<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event>(
			this,
			eventType as string,
		);
	}

	/** @see {@link debounceEvent} for full documentation */
	debounce<T extends keyof TMap | string = string>(
		eventType: T,
		wait: number,
	): Promise<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event> {
		return debounceEvent<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event>(
			this,
			eventType as string,
			wait,
		);
	}

	/** @see {@link throttleEvent} for full documentation */
	throttle<T extends keyof TMap | string = string>(
		eventType: T,
		wait: number,
	): AsyncGenerator<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event> {
		return throttleEvent<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event>(
			this,
			eventType as string,
			wait,
		);
	}

	/** @see {@link bufferEvent} for full documentation */
	buffer<T extends keyof TMap | string = string>(
		eventType: T,
		wait: number,
	): Promise<(T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event)[]> {
		return bufferEvent<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event>(
			this,
			eventType as string,
			wait,
		);
	}

	/** @see {@link pipeEvent} for full documentation */
	pipeTo<T extends keyof TMap | string = string>(
		destination: EventTarget,
		eventType: T,
		transform?: (
			e: T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event,
		) => T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event,
	): () => void {
		return pipeEvent(this, destination, eventType as string, transform);
	}
}

/**
 * A typed `EventSource` subclass with promise- and generator-based event methods.
 * Methods are inferred from the `TMap` event map when available.
 *
 * @template TMap - An {@link EventMap} describing the events this source can emit.
 */
export class BearMetalEventSource<TMap extends EventMap> extends EventSource {
	/** @see {@link onceEvent} for full documentation */
	once<T extends keyof TMap | string = string>(
		eventType: T,
	): Promise<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event> {
		return onceEvent(this, eventType as string);
	}

	/** @see {@link promiseEvent} for full documentation */
	promiseEvent<T extends keyof TMap, R extends keyof TMap>(
		eventType: T,
		responseType: R,
		detail: TMap[T]["detail"],
	): Promise<CustomEvent<TMap[R]["detail"]>[]> {
		return promiseEvent<CustomEvent<TMap[T]["detail"]>, CustomEvent<TMap[R]["detail"]>>(
			this,
			eventType as string,
			responseType as string,
			detail,
		);
	}

	/** @see {@link filteredEvent} for full documentation */
	filteredEvent<T extends keyof TMap, R extends keyof TMap>(
		eventType: T,
		responseType: R,
		predicate: (event: CustomEvent<TMap[R]["detail"]>) => boolean,
		detail: TMap[T]["detail"],
	): Promise<CustomEvent<TMap[R]["detail"]>[]> {
		return filteredEvent<CustomEvent<TMap[T]["detail"]>, CustomEvent<TMap[R]["detail"]>>(
			this,
			eventType as string,
			responseType as string,
			predicate,
			detail,
		);
	}

	/** @see {@link raceEvent} for full documentation */
	race<T extends keyof TMap | string = string>(
		eventTypes: T[],
	): Promise<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event> {
		return raceEvent(this, eventTypes as string[]);
	}

	/** @see {@link eventStream} for full documentation */
	stream<T extends keyof TMap | string = string>(
		eventType: T,
	): AsyncGenerator<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event> {
		return eventStream<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event>(
			this,
			eventType as string,
		);
	}

	/** @see {@link debounceEvent} for full documentation */
	debounce<T extends keyof TMap | string = string>(
		eventType: T,
		wait: number,
	): Promise<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event> {
		return debounceEvent<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event>(
			this,
			eventType as string,
			wait,
		);
	}

	/** @see {@link throttleEvent} for full documentation */
	throttle<T extends keyof TMap | string = string>(
		eventType: T,
		wait: number,
	): AsyncGenerator<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event> {
		return throttleEvent<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event>(
			this,
			eventType as string,
			wait,
		);
	}

	/** @see {@link bufferEvent} for full documentation */
	buffer<T extends keyof TMap | string = string>(
		eventType: T,
		wait: number,
	): Promise<(T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event)[]> {
		return bufferEvent<T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event>(
			this,
			eventType as string,
			wait,
		);
	}

	/** @see {@link pipeEvent} for full documentation */
	pipeTo<T extends keyof TMap | string = string>(
		destination: EventTarget,
		eventType: T,
		transform?: (
			e: T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event,
		) => T extends keyof TMap ? CustomEvent<TMap[T]["detail"]> : Event,
	): () => void {
		return pipeEvent(this, destination, eventType as string, transform);
	}
}
