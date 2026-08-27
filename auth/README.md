# @bearmetal/auth

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fauth&valueColor=info)](https://jsr.io/@bearmetal/auth)

Token-based authentication as a `@bearmetal/router` module. Mounting `authModule()` registers
session cookie handling, user/session tables against `@bearmetal/db`, and a set of login routes
under `/__auth` for whichever methods are configured — alias/password today, with OAuth (Google,
Discord, GitHub) and passkeys planned.

The module depends on a `db` service being available in the router tree and defers its own setup via
`onAdopted` until one is found. What gets embedded in the issued auth token is configurable per
project through `AuthConfig`.
