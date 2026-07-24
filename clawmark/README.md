# @bearmetal/clawmark

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fclawmark&valueColor=info)](https://jsr.io/@bearmetal/clawmark)

A rule-based markup engine: a lexer, tree builder, and renderer driven entirely by a swappable set
of `Rule` definitions, rather than a fixed grammar. `defaultRules()` covers Markdown-equivalent
syntax (headings, emphasis, lists, tables, blockquotes, links, images, footnotes, code, horizontal
rules), and parsed output can render to either an HTML string or a live DOM fragment.

This package is the working implementation and proving ground for the `Rule` contract sketched in
`webbies`' Markdown component — see `types.ts` for where that contract had to grow to make full
Markdown-equivalent behavior possible.
