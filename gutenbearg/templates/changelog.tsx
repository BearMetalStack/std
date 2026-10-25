import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { ChangelogContent, ChangeType, PageContext, ResolvedPage, Tone } from "../types.ts";
import { Badge } from "../blocks/mod.tsx";
import { Document, Shell } from "./document.tsx";
import { measure } from "./measure.ts";
import { PageHeader, PrevNext } from "./doc.tsx";

/** Each change type and the tone its badge and filter dot take. */
export const CHANGE_TONES: [ChangeType, Tone][] = [
	["added", "success"],
	["changed", "info"],
	["fixed", "brand"],
	["deprecated", "warn"],
	["breaking", "danger"],
];
const TONE = Object.fromEntries(CHANGE_TONES) as Record<ChangeType, Tone>;

/**
 * Every release as a timeline, filterable by change type and package. Filters combine: types are
 * OR'd together, then narrowed to the chosen package; a release with nothing left dims rather than
 * disappearing, so the timeline keeps its shape.
 */
export function ChangelogTemplate(
	{ ctx, page, content }: { ctx: PageContext; page?: ResolvedPage; content: ChangelogContent },
): JSX.Element {
	const releases = content.releases();
	const body = (
		<div class="gb-prose gb-cl" data-gb-changelog>
			<div class="gb-cl-filters">
				{CHANGE_TONES.map(([type, tone]) => (
					<button type="button" class="gb-chip sq" data-gb-cl-type={type}>
						<i class={`gb-dot-tone ${tone}`}></i>
						{type}
					</button>
				))}
				<span class="gb-cl-div"></span>
				{ctx.site.packages.map((p) => (
					<button type="button" class="gb-chip sq mono" data-gb-cl-pkg={p.id}>{p.id}</button>
				))}
			</div>
			{releases.map((r) => {
				const id = `v${r.version.replaceAll(".", "-")}`;
				return (
					<section class="gb-rel" data-kind="list">
						<h2 id={id} data-text={`v${r.version}`}>
							<span class="gb-rel-dot"></span>v{r.version}
							<small>{r.date}</small>
						</h2>
						<ul>
							{r.changes.map((c) => (
								<li data-gb-type={c.type} data-gb-package={c.package ?? ""}>
									<Badge tone={TONE[c.type]}>{c.type}</Badge>
									{c.package && <code>{c.package}</code>}
									<span>{c.text}</span>
								</li>
							))}
						</ul>
						<p class="gb-rel-none" hidden>No matching changes.</p>
					</section>
				);
			})}
		</div>
	);
	const measured = measure(body);
	const fm = content.frontmatter;
	return (
		<Document ctx={ctx} title={fm.title} description={fm.description} written>
			<Shell ctx={ctx} page={page} content={content} measured={measured}>
				<article class="gb-article">
					<PageHeader ctx={ctx} frontmatter={fm} minutes={measured.minutes} />
					{body}
					<PrevNext ctx={ctx} />
				</article>
			</Shell>
		</Document>
	);
}
