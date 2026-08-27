# @bearmetal/devproxy

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fdevproxy&valueColor=info)](https://jsr.io/@bearmetal/devproxy)

Dev-time reverse proxy integration for `@bearmetal/router` apps. `devProxyModule()` claims a
subdomain on a shared dev proxy host (`BEARMETAL_PROXY_HOST`) on startup, so a project running
locally becomes reachable at `https://<name>.<proxy-host>` without any tunneling setup of its own.
Outside of dev environments every export becomes a no-op, so the module is safe to leave wired into
a shared entrypoint unconditionally.
