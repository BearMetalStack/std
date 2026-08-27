# @bearmetal/sockpuppet

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fsockpuppet&valueColor=info)](https://jsr.io/@bearmetal/sockpuppet)

A WebSocket channel server, mounted as a `@bearmetal/router` module, with a matching browser client
(`sockpuppet/client`). Connections are organized into named channels with their own middleware and
pub/sub, rather than one raw socket per handler — the client mirrors that shape so subscribing to a
channel from the browser looks the same as handling one on the server.
