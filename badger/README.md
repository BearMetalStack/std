# badger

The SVG badge service behind the badges used throughout this repo's READMEs, hosted at [badger.bear-metal.dev](https://badger.bear-metal.dev). A `Deno.serve` handler renders label/value(/extra) badges to SVG on the fly from query parameters — colors, variants (filled, pill, outlined), and embedded or inherited fonts are all driven by the URL.

Visit `/sample` on a running instance for a live sheet of every supported permutation, with a form that copies the resulting badge URL to your clipboard. Not published as a package — this is a standalone service, run directly (`deno task dev`) or via the included `Dockerfile`.
