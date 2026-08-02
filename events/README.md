# @bearmetal/events

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fevents&valueColor=info)](https://jsr.io/@bearmetal/events)

Promise- and async-generator-based utilities for `EventTarget` and `EventSource`: one-shot waits,
racing multiple event types, streaming events as an async iterable, debouncing, throttling,
buffering, and piping events between targets. `BearMetalEventTarget`/`BearMetalEventSource` wrap the
same functions as typed instance methods, inferring event and detail shapes from an `EventMap` type
parameter.
