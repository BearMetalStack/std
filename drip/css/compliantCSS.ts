import { dotBearmetalFile } from "@bearmetal/miscellanea/fs";
import { namespaces } from "../namespaces.ts";
import { compliantSheets } from "./embedded.ts";

const COMPLIANT_IDS = ["base", "components", "animations"] as const;
/** Id of one of Drip's compliant stylesheets. */
export type CompliantID = typeof COMPLIANT_IDS[number];

/**
 * One of Drip's compliant stylesheets: the element and component rules written
 * against the theme tokens, so they follow whichever theme is loaded. The
 * source is `css/<id>.css`, shipped through `css/embedded.ts`.
 */
export function compliantCSS(compliantId: CompliantID): string {
	return compliantSheets[compliantId];
}

/** Writes every compliant stylesheet to `.bearmetal/drip/stylesheets/<id>.css`. */
export async function storeStylesheets(): Promise<void> {
	for (const id of COMPLIANT_IDS) {
		const file = await dotBearmetalFile(namespaces.stylesheets, `${id}.css`);
		await file.write(compliantCSS(id));
	}
}

export default compliantCSS;
