import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Router } from "@bearmetal/router";
import { Layout, Page } from "@bearmetal/app/ssr";
import { BMDripBase } from "@bearmetal/drip/ssr";
import { type FrameKind, gutenbeargModule } from "@bearmetal/gutenbearg";

// An app with its own header and theme switch, serving the bramble docs at /docs inside its
// layout. `?frame=article` drops the docs' sidebar and rail.
const HEADER = "3.5rem";
const TOGGLE =
	`document.getElementById("theme").onclick=()=>{const r=document.documentElement;r.dataset.theme=r.dataset.theme==="light"?"dark":"light"}`;
const STYLE = `
body { margin: 0; background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); --gb-host-offset: ${HEADER}; }
.host { position: sticky; top: 0; z-index: 40; height: ${HEADER}; display: flex; align-items: center; gap: 1.5rem; padding: 0 1.5rem; background: var(--color-surface); border-bottom: 1px solid var(--color-border-strong); }
.host a { color: var(--color-text); text-decoration: none; font-weight: 600; }
.host span { flex: 1; }
.host-home { max-width: 40rem; margin: 4rem auto; }
`;

function AppLayout({ children, title }: { children: JSX.Element; title: string }): JSX.Element {
	return (
		<html lang="en" data-theme="dark">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{title} · Acme</title>
				<BMDripBase />
				<style $raw>{STYLE}</style>
			</head>
			<body>
				<header class="host">
					<a href="/">Acme</a>
					<a href="/docs">Docs</a>
					<span></span>
					<button type="button" id="theme">Theme</button>
				</header>
				{children}
				<script $raw>{TOGGLE}</script>
			</body>
		</html>
	);
}

const router = new Router();
router.use(Layout(AppLayout));
router.route("/").get(Page(
	() => (
		<main class="host-home">
			<h1>Acme</h1>
			<p>
				The app's own page. The <a href="/docs">docs</a> render inside this same layout.
			</p>
		</main>
	),
	"Home",
));
router.use(
	await gutenbeargModule({
		dir: new URL("../bramble/.bearmetal/gutenbearg", import.meta.url).pathname,
		base: "/docs",
		frame: "shell",
		watch: Deno.args.includes("--watch"),
		resolve: (ctx) => ({ frame: ctx.query.frame as FrameKind | undefined }),
	}),
);

Deno.serve({ port: Number(Deno.env.get("BEARMETAL_GUTENBEARG_PORT") ?? 8000) }, router.handle);
