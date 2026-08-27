# @bearmetal/internal

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)

Workspace-internal trust primitives, marked `"publish": false`. It has no importers left in the
published packages — `router` and `stack` used to depend on it before `TrustedModule` made that
unnecessary — and `publish_workspace.ts` refuses to publish anything that still imports it, so it
should stay that way.
