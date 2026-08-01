---
name: run
description: Use this skill to verify changes work in a BearMetal package or app — overrides default RUN behavior. Trigger whenever you'd otherwise reach for a generic test/verification step.
---

# Running and verifying BearMetal code

This is a Deno-native project with no Node runtime, npm, or bundler in the loop. Don't assume
Node/web-app conventions (package.json scripts, dev servers meant for browser interaction, etc.) —
verify through Deno directly.

Preference order, cheapest/most direct first:

1. `deno test` and `deno check` — if the package has a test task or test files, run these. This is
   almost always sufficient.
2. `deno run` (or the relevant `deno task`) — for CLI-verifiable behavior, just run it and check
   output/exit code directly. Fast, no browser needed.
3. Headless chromium/CLI — if testing a browser specific behavior, prefer using the chromium CLI.
4. Playwright — only if the thing being verified is genuinely visual or DOM-interactive in a way CLI
   output can't confirm (e.g. actual rendered layout, real browser event handling). Don't reach for
   this by default.

Avoid Playwright when 1 or 2 would answer the question. If unsure which applies, prefer running the
plain Deno command and reading its output over spinning up a browser.
