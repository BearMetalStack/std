import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { BASE } from "./client.ts";

/**
 * An import map as script text, with `<` escaped so a specifier can never close
 * the `<script>` it sits in.
 */
export function importMapJson(imports: Record<string, string>): string {
	return JSON.stringify({ imports }).replaceAll("<", "\\u003c");
}

/**
 * What a server-rendered page needs from the dev server, in order: the import
 * map, the client, and the entry modules.
 */
export function headTags(imports: Record<string, string>, entries: string[]): JSX.Element[] {
	const tags = [
		<script type="importmap">{importMapJson(imports)}</script>,
		<script src={`${BASE}/client.js`}></script>,
	];
	for (const src of entries) tags.push(<script type="module" src={src}></script>);
	return tags;
}
