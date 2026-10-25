import { ASSET_BASE } from "../templates/assets.ts";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { IconName, Tone } from "../types.ts";

/** Where `gutenbeargModule()` serves the sprite sheet. */
export const ICON_SHEET = `${ASSET_BASE}/icons.svg`;

/** A symbol from the sprite sheet, sized to the text around it. */
export function Icon(
	{ name, class: className }: { name: IconName; class?: string },
): JSX.Element {
	return (
		<svg class={className ? `gb-icon ${className}` : "gb-icon"} aria-hidden="true">
			<use href={`${ICON_SHEET}#${name}`} />
		</svg>
	);
}

/** A small pill — drip's `.tag` in one of its legible tones. */
export function Badge(
	{ tone = "neutral", children }: { tone?: Tone; children?: JSX.Children },
): JSX.Element {
	return <span class={`tag ${tone} gb-badge`}>{children}</span>;
}
