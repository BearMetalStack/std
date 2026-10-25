import { escapeHtml } from "@bearmetal/miscellanea";
import type { DashManifest, DashModule } from "./types.ts";

/** Options for {@link renderPage}. */
export interface PageOptions {
	/** Token the page was opened with, handed to the client so its fetches pass the gate too. */
	token?: string;
	/** URL of the client script. */
	script?: string;
}

const STYLE = `
*, *::before, *::after { box-sizing: border-box; }
:root {
	color-scheme: light dark;
	--bmh-bg: #f6f7f9; --bmh-surface: #fff; --bmh-fg: #1e2430; --bmh-muted: #6b7385;
	--bmh-line: #e3e6ec; --bmh-accent: #4f6bed; --bmh-ok: #2f9e66; --bmh-warn: #d98a00; --bmh-crit: #d43d4f;
	--bmh-radius: 10px; --bmh-font: system-ui, sans-serif; --bmh-mono: ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) {
	:root {
		--bmh-bg: #14171d; --bmh-surface: #1c2028; --bmh-fg: #e6e9ef; --bmh-muted: #939bad;
		--bmh-line: #2c323d; --bmh-accent: #8197ff; --bmh-ok: #4cc38a; --bmh-warn: #f0b440; --bmh-crit: #f0687a;
	}
}
body { margin: 0; background: var(--bmh-bg); color: var(--bmh-fg); font-family: var(--bmh-font); }
main { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem 4rem; }
header { margin-bottom: 1.5rem; }
h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--bmh-muted); margin: 2rem 0 .75rem; }
header p { margin: 0; color: var(--bmh-muted); }
.meta { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: .5rem; font-size: .85rem; }
.meta a { color: var(--bmh-accent); }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); }
.grid > [data-size="m"] { grid-column: span 2; }
.grid > [data-size="l"] { grid-column: 1 / -1; }
@media (max-width: 560px) { .grid > [data-size] { grid-column: auto; } }
`;

function moduleMarkup(m: DashModule, token: string | undefined): string {
	const tokenAttr = token ? ` token="${escapeHtml(token)}"` : "";
	return `<bmh-feed data-size="${m.size ?? "s"}"${tokenAttr}><bmh-module config="${
		escapeHtml(JSON.stringify(m))
	}"></bmh-module></bmh-feed>`;
}

/** Renders the standalone dashboard for `manifest` as a full HTML document. */
export function renderPage(manifest: DashManifest, opts: PageOptions = {}): string {
	const script = opts.script ?? "/@bearmetal/health/assets/client.js";
	const links = (manifest.links ?? [])
		.map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`)
		.join("");
	const version = manifest.version ? `<span>v${escapeHtml(manifest.version)}</span>` : "";
	const section = (title: string, modules: DashModule[]) =>
		modules.length
			? `<h2>${title}</h2><div class="grid">${
				modules.map((m) => moduleMarkup(m, opts.token)).join("")
			}</div>`
			: "";

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(manifest.name)} · health</title>
<style>${STYLE}</style>
<script type="module" src="${escapeHtml(script)}"></script>
</head>
<body>
<main>
<header>
<h1>${escapeHtml(manifest.name)}</h1>
<p>${escapeHtml(manifest.description)}</p>
<div class="meta">${version}${links}</div>
</header>
${section("Key", manifest.keyModules)}
${section("Everything else", manifest.modules)}
</main>
</body>
</html>`;
}
