import { assertEquals } from "@std/assert";
import {
	bufferEvent,
	debounceEvent,
	eventStream,
	filteredEvent,
	onceEvent,
	pipeEvent,
	promiseEvent,
	raceEvent,
	throttleEvent,
} from "./mod.ts";

// onceEvent

Deno.test("onceEvent resolves with the fired event", async () => {
	const target = new EventTarget();
	const promise = onceEvent(target, "test");
	target.dispatchEvent(new Event("test"));
	const event = await promise;
	assertEquals(event.type, "test");
});

Deno.test("onceEvent ignores subsequent events", async () => {
	const target = new EventTarget();
	const promise = onceEvent<CustomEvent<number>>(target, "test");
	target.dispatchEvent(new CustomEvent("test", { detail: 1 }));
	target.dispatchEvent(new CustomEvent("test", { detail: 2 }));
	const event = await promise;
	assertEquals(event.detail, 1);
});

// promiseEvent

Deno.test("promiseEvent collects synchronous responses", async () => {
	const target = new EventTarget();
	target.addEventListener("request", () => {
		target.dispatchEvent(new CustomEvent("response", { detail: "pong" }));
	});
	const responses = await promiseEvent<Event, CustomEvent<string>>(
		target,
		"request",
		"response",
		"ping",
	);
	assertEquals(responses.length, 1);
	assertEquals(responses[0].detail, "pong");
});

Deno.test("promiseEvent collects multiple responses", async () => {
	const target = new EventTarget();
	target.addEventListener("request", () => {
		for (const d of ["a", "b", "c"]) {
			target.dispatchEvent(new CustomEvent("response", { detail: d }));
		}
	});
	const responses = await promiseEvent<Event, CustomEvent<string>>(
		target,
		"request",
		"response",
		null,
	);
	assertEquals(responses.map((e) => e.detail), ["a", "b", "c"]);
});

// raceEvent

Deno.test("raceEvent resolves with the first fired event type", async () => {
	const target = new EventTarget();
	const promise = raceEvent(target, ["foo", "bar", "baz"]);
	target.dispatchEvent(new Event("bar"));
	const event = await promise;
	assertEquals(event.type, "bar");
});

// eventStream

Deno.test("eventStream yields events in order", async () => {
	const target = new EventTarget();
	const gen = eventStream<CustomEvent<number>>(target, "data");

	// gen.next() runs the body up to the first await, registering the listener
	const p1 = gen.next();
	target.dispatchEvent(new CustomEvent("data", { detail: 1 }));
	target.dispatchEvent(new CustomEvent("data", { detail: 2 }));
	target.dispatchEvent(new CustomEvent("data", { detail: 3 }));

	const results = [
		(await p1).value.detail,
		(await gen.next()).value.detail,
		(await gen.next()).value.detail,
	];
	await gen.return(undefined);

	assertEquals(results, [1, 2, 3]);
});

Deno.test("eventStream removes listener on close", async () => {
	const target = new EventTarget();
	const received: number[] = [];
	const gen = eventStream<CustomEvent<number>>(target, "data");

	const p1 = gen.next();
	target.dispatchEvent(new CustomEvent("data", { detail: 1 }));
	received.push((await p1).value.detail);

	await gen.return(undefined);

	// Listener removed by finally block - this event should not appear
	target.dispatchEvent(new CustomEvent("data", { detail: 2 }));

	assertEquals(received, [1]);
});

// filteredEvent

Deno.test("filteredEvent returns only matching responses", async () => {
	const target = new EventTarget();
	target.addEventListener("request", () => {
		for (const n of [1, 2, 3, 4, 5]) {
			target.dispatchEvent(new CustomEvent("response", { detail: n }));
		}
	});
	const responses = await filteredEvent<Event, CustomEvent<number>>(
		target,
		"request",
		"response",
		(e) => e.detail % 2 !== 0,
		null,
	);
	assertEquals(responses.map((e) => e.detail), [1, 3, 5]);
});

Deno.test("filteredEvent returns empty array when no responses match", async () => {
	const target = new EventTarget();
	target.addEventListener("request", () => {
		target.dispatchEvent(new CustomEvent("response", { detail: 2 }));
	});
	const responses = await filteredEvent<Event, CustomEvent<number>>(
		target,
		"request",
		"response",
		(e) => e.detail % 2 !== 0,
		null,
	);
	assertEquals(responses, []);
});

// debounceEvent

Deno.test("debounceEvent resolves with last event after quiet period", async () => {
	const target = new EventTarget();
	const promise = debounceEvent<CustomEvent<number>>(target, "input", 20);
	target.dispatchEvent(new CustomEvent("input", { detail: 1 }));
	target.dispatchEvent(new CustomEvent("input", { detail: 2 }));
	target.dispatchEvent(new CustomEvent("input", { detail: 3 }));
	const event = await promise;
	assertEquals(event.detail, 3);
});

// throttleEvent

Deno.test("throttleEvent yields the event after the wait window", async () => {
	const target = new EventTarget();
	const gen = throttleEvent<CustomEvent<number>>(target, "tick", 20);
	const p1 = gen.next();
	target.dispatchEvent(new CustomEvent("tick", { detail: 42 }));
	const result = await p1;
	assertEquals(result.value.detail, 42);
	await gen.return(undefined);
});

// bufferEvent

Deno.test("bufferEvent collects all events within the window", async () => {
	const target = new EventTarget();
	const promise = bufferEvent<CustomEvent<number>>(target, "data", 20);
	target.dispatchEvent(new CustomEvent("data", { detail: 1 }));
	target.dispatchEvent(new CustomEvent("data", { detail: 2 }));
	target.dispatchEvent(new CustomEvent("data", { detail: 3 }));
	const events = await promise;
	assertEquals(events.map((e) => e.detail), [1, 2, 3]);
});

Deno.test("bufferEvent resolves with empty array when no events fire", async () => {
	const target = new EventTarget();
	const events = await bufferEvent(target, "data", 20);
	assertEquals(events, []);
});

// pipeEvent

Deno.test("pipeEvent forwards events to destination", async () => {
	const source = new EventTarget();
	const dest = new EventTarget();
	const teardown = pipeEvent<CustomEvent<string>>(source, dest, "test");
	const received = onceEvent<CustomEvent<string>>(dest, "test");
	source.dispatchEvent(new CustomEvent("test", { detail: "hello" }));
	const event = await received;
	assertEquals(event.detail, "hello");
	teardown();
});

Deno.test("pipeEvent applies transform before forwarding", async () => {
	const source = new EventTarget();
	const dest = new EventTarget();
	const teardown = pipeEvent<CustomEvent<number>, CustomEvent<string>>(
		source,
		dest,
		"data",
		(e) => new CustomEvent("data", { detail: String(e.detail) }),
	);
	const received = onceEvent<CustomEvent<string>>(dest, "data");
	source.dispatchEvent(new CustomEvent("data", { detail: 42 }));
	assertEquals((await received).detail, "42");
	teardown();
});

Deno.test("pipeEvent teardown stops forwarding", async () => {
	const source = new EventTarget();
	const dest = new EventTarget();
	let count = 0;
	dest.addEventListener("test", () => count++);
	const teardown = pipeEvent(source, dest, "test");
	source.dispatchEvent(new Event("test"));
	teardown();
	source.dispatchEvent(new Event("test"));
	await new Promise((r) => setTimeout(r, 0));
	assertEquals(count, 1);
});
