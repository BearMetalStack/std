# @bearmetal/cache

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fcache&valueColor=info)](https://jsr.io/@bearmetal/cache)

Response caching as a `@bearmetal/router` module. `cacheModule()` caches GET responses by path and
query string, invalidating any cached entry under a path automatically the moment a mutating request
touches it. The storage backend is pluggable behind a small `CacheProvider` interface — an in-memory
`Map` today, with a Redis provider slated but not yet implemented.
