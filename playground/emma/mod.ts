import { argset, dedent, escapeHtml, fn } from "@bearmetal/miscellanea";
function ensureTrailingLine(s: string) {
	return s.replace(/\n*$/, "\n");
}

export function run() {
	const trimIndent = fn(String.raw).follow((s) => s.replace(/^\n*/, "").replace(/\t*$/, ""));
	const calcDedent = trimIndent.follow((s) => {
		const leading = s.matchAll(/^ +/gm).toArray().map((e) => e[0].length);
		const minspace = leading.length ? Math.min(...leading) : 4;
		return argset<typeof dedent>(s, minspace);
	}); // bad example, but shows how to get an intermediate function with an argset

	const dedented = calcDedent.pipe(dedent);
	const doc = dedented.follow(ensureTrailingLine);
	const css = doc;
	const html = doc.lead((
		s,
		...v
	) => [s, ...v.map((e) => typeof e === "string" ? escapeHtml(e) : e)]);
	const s = css`
		.banana {
			color: yellow;
		}
	`;
	const h = html`
		<div>
			${"<html>escaped</html>"}
		</div>
	`;
	console.log(s);
	console.log(h);
}
