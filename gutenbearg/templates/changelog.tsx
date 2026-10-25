import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { ChangeType, PackageInfo, PageContext, Tone } from "../types.ts";
import { Badge } from "../blocks/mod.tsx";
import { Document, Shell } from "./document.tsx";
import { measure } from "./measure.ts";
import { PageHeader } from "./doc.tsx";

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
 * Releases as a timeline, for one package or all of them, filterable by change type (and by
 * package on the combined page). Types are OR'd, then narrowed to the chosen package; a release
 * with nothing left dims rather than disappearing, so the timeline keeps its shape.
 */
export function ChangelogTemplate(
	{ ctx, package: pkg }: { ctx: PageContext; package?: PackageInfo },
): JSX.Element {
	const releases = ctx.content.releases.filter((r) => !pkg || r.package === pkg.id);
	const packages = pkg
		? []
		: ctx.content.packages.filter((p) => releases.some((r) => r.package === p.id));
	const name = (id: string) => ctx.content.packages.find((p) => p.id === id)?.name ?? id;
	const body = (
		<div class="gb-prose gb-cl" data-gb-changelog>
			<div class="gb-cl-filters">
				{CHANGE_TONES.map(([type, tone]) => (
					<button type="button" class="gb-chip sq" data-gb-cl-type={type}>
						<i class={`gb-dot-tone ${tone}`}></i>
						{type}
					</button>
				))}
				{packages.length > 1 && <span class="gb-cl-div"></span>}
				{packages.length > 1 &&
					packages.map((p) => (
						<button type="button" class="gb-chip sq mono" data-gb-cl-pkg={p.id}>{p.id}</button>
					))}
			</div>
			{releases.map((r) => {
				const label = pkg ? `v${r.version}` : `${name(r.package)} v${r.version}`;
				const id = `${pkg ? "" : `${r.package}-`}v${r.version.replaceAll(".", "-")}`;
				return (
					<section class="gb-rel" data-kind="list">
						<h2 id={id} data-text={label}>
							<span class="gb-rel-dot"></span>
							{label}
							{r.date && <small>{r.date}</small>}
						</h2>
						<ul>
							{r.changes.map((c) => (
								<li data-gb-type={c.type} data-gb-package={r.package}>
									<Badge tone={TONE[c.type]}>{c.type}</Badge>
									<span>{c.text()}</span>
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
	const title = pkg ? `${pkg.name} changelog` : "Changelog";
	const description = pkg
		? `Every release of ${pkg.name}, newest first.`
		: "Every release across the packages, newest first.";
	return (
		<Document ctx={ctx} title={title} description={description} written>
			<Shell ctx={ctx} measured={measured}>
				<article class="gb-article">
					<PageHeader
						ctx={ctx}
						title={title}
						description={description}
						minutes={measured.minutes}
					/>
					{body}
				</article>
			</Shell>
		</Document>
	);
}
