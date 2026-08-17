import { Page } from "@bearmetal/app/ssr";
import type { RouterContext } from "@bearmetal/router";

const POSTS: Record<string, string> = {
	"getting-started": "Point diecast at a router and it writes the site.",
	"reactivity": "Signals all the way down.",
};

export const home = Page(() => (
	<main>
		<h1>Diecast smoke test</h1>
		<p>
			One literal route, one parameterised route, and a layout - the smallest thing that exercises
			the whole pipeline.
		</p>
		<ul>
			{Object.keys(POSTS).map((slug) => (
				<li>
					<a href={`/md/${slug}`}>{slug}</a>
				</li>
			))}
		</ul>
	</main>
), "Diecast smoke test");

export const post = Page((ctx: RouterContext) => {
	const slug = ctx.params.file ?? "";
	return (
		<main>
			<h1>{slug}</h1>
			<p>{POSTS[slug] ?? "Not found."}</p>
			<p>
				<a href="/">Back</a>
			</p>
		</main>
	);
});

export const slugs = Object.keys(POSTS);
