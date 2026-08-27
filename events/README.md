# @bearmetal/events

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fevents&valueColor=info)](https://jsr.io/@bearmetal/events)

Promise- and async-generator-based utilities for `EventTarget` and `EventSource`: one-shot waits,
racing multiple event types, streaming events as an async iterable, debouncing, throttling,
buffering, and piping events between targets. `BearMetalEventTarget`/`BearMetalEventSource` wrap the
same functions as typed instance methods, inferring event and detail shapes from an `EventMap` type
parameter.
