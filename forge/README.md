# @bearmetal/forge

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fforge&valueColor=info)](https://jsr.io/@bearmetal/forge)

Runtime schema validation with TypeScript inference and JSON Schema generation, in the spirit of Zod. Define a schema once with `f.object()` and friends, then use it to validate (`.parse()`/`.safeParse()`), infer a static type (`Infer<T>`), and produce a JSON Schema (`.toJSONSchema()`) — the same schema drives request validation in `@bearmetal/router`, table shapes in `@bearmetal/db`, and CLI flag validation in `@bearmetal/cli`. Fully portable: nothing about it depends on the rest of the stack.
