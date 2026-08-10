/**
 * The canonical set of Drip variant tokens.
 *
 * A *variant token* is a semantic colour slot that changes between theme
 * variants (light/dark/high-contrast/…). Everything else a stylesheet needs —
 * spacing, radii, font stacks, shadows, and the per-component tokens that hang
 * off them — lives in the defaults layer (`./defaults.ts`) and is expressed in
 * terms of these tokens, so a theme that defines nothing but its variants still
 * drives the whole compliant stylesheet.
 *
 * The mapping from authoring key to CSS custom property is *data*, never a
 * prefix heuristic: `btnSuccessFg` becomes `--btn-success-color` because this
 * table says so, not because the key happens to start with `btn`.
 *
 * @module
 */

/** Broad grouping used to organise the token table in docs and tool schemas. */
export type VariantTokenGroup =
	| "ground"
	| "text"
	| "border"
	| "interactive"
	| "semantic"
	| "fill"
	| "overlay"
	| "misc";

/** One semantic colour slot a theme variant can define. */
export interface VariantTokenDef {
	/** camelCase key used when authoring a variant (tool input, theme JSON). */
	key: string;
	/** The CSS custom property this key writes to. */
	property: string;
	/** Grouping for documentation and tool schemas. */
	group: VariantTokenGroup;
	/** One-line explanation of what the slot is for. */
	description: string;
	/**
	 * Every variant must define this. Required tokens are the ones no sensible
	 * value can be derived for — the grounds, the inks, and the fills whose
	 * contrast only the author can judge. Omitting one is reported at generate
	 * time; the `from`/`fallback` on a required token is a last resort that
	 * keeps the stylesheet valid, not a substitute for choosing.
	 */
	required?: boolean;
	/**
	 * Key this token falls back to when a variant omits it. Emitted as a
	 * `var()` reference to the other token *in the same variant block*, so an
	 * incomplete variant still resolves to something predictable.
	 */
	from?: string;
	/** Literal CSS value used when the token is omitted and has no `from`. */
	fallback?: string;
}

/** The four semantic states every Drip theme carries. */
export const SEMANTIC_ROLES = ["success", "danger", "warning", "info"] as const;
/** Semantic states plus `accent`, which all get a filled-control treatment. */
export const FILL_ROLES = [...SEMANTIC_ROLES, "accent"] as const;

export type SemanticRole = typeof SEMANTIC_ROLES[number];
export type FillRole = typeof FILL_ROLES[number];

function capitalize(s: string): string {
	return s[0].toUpperCase() + s.slice(1);
}

const GROUND: VariantTokenDef[] = [
	{
		key: "bg",
		property: "--color-bg",
		group: "ground",
		description: "Page background — the ground everything else sits on",
		required: true,
		fallback: "Canvas",
	},
	{
		key: "bgSubtle",
		property: "--color-bg-subtle",
		group: "ground",
		description: "Background one step away from the page, for banded rows and wells",
		from: "bg",
	},
	{
		key: "bgMuted",
		property: "--color-bg-muted",
		group: "ground",
		description: "Background for hover states and inline code",
		from: "bgSubtle",
	},
	{
		key: "bgEmphasis",
		property: "--color-bg-emphasis",
		group: "ground",
		description: "Strongest plain background — progress tracks, skeletons",
		from: "bgMuted",
	},
	{
		key: "surface",
		property: "--color-surface",
		group: "ground",
		description: "Cards, panels, inputs — anything that reads as a sheet on the page",
		required: true,
		from: "bg",
	},
	{
		key: "surfaceRaised",
		property: "--color-surface-raised",
		group: "ground",
		description: "A surface lifted above another surface",
		from: "surface",
	},
	{
		key: "surfaceOverlay",
		property: "--color-surface-overlay",
		group: "ground",
		description: "Floating surfaces: modals, dropdowns, popovers",
		from: "surface",
	},
];

const TEXT: VariantTokenDef[] = [
	{
		key: "text",
		property: "--color-text",
		group: "text",
		description: "Body text on `bg`",
		required: true,
		fallback: "CanvasText",
	},
	{
		key: "textSubtle",
		property: "--color-text-subtle",
		group: "text",
		description: "Secondary text — captions, labels, hints",
		from: "text",
	},
	{
		key: "textMuted",
		property: "--color-text-muted",
		group: "text",
		description: "Tertiary text — placeholders, timestamps",
		from: "textSubtle",
	},
	{
		key: "textDisabled",
		property: "--color-text-disabled",
		group: "text",
		description: "Text in a disabled control",
		from: "textMuted",
	},
	{
		key: "textInverse",
		property: "--color-text-inverse",
		group: "text",
		description: "Ink for grounds that invert the page — tooltips, inverted bars",
		from: "bg",
	},
	{
		key: "textOnBrand",
		property: "--color-text-on-brand",
		group: "text",
		description: "Ink that sits on `interactive` — primary button labels",
		required: true,
		from: "textInverse",
	},
];

const BORDER: VariantTokenDef[] = [
	{
		key: "border",
		property: "--color-border",
		group: "border",
		description: "Default hairline between regions",
		required: true,
		from: "bgEmphasis",
	},
	{
		key: "borderStrong",
		property: "--color-border-strong",
		group: "border",
		description: "Border that has to be seen — input outlines, dividers under headers",
		from: "border",
	},
	{
		key: "borderSubtle",
		property: "--color-border-subtle",
		group: "border",
		description: "Border that should barely register",
		from: "border",
	},
	{
		key: "borderFocus",
		property: "--color-border-focus",
		group: "border",
		description: "Focus ring colour — drives `:focus-visible` everywhere",
		from: "interactive",
	},
];

const INTERACTIVE: VariantTokenDef[] = [
	{
		key: "interactive",
		property: "--color-interactive",
		group: "interactive",
		description: "Links and the primary action colour",
		required: true,
		fallback: "LinkText",
	},
	{
		key: "interactiveHover",
		property: "--color-interactive-hover",
		group: "interactive",
		description: "`interactive` under the pointer",
		from: "interactive",
	},
	{
		key: "interactiveActive",
		property: "--color-interactive-active",
		group: "interactive",
		description: "`interactive` while pressed",
		from: "interactiveHover",
	},
	{
		key: "interactiveSubtle",
		property: "--color-interactive-subtle",
		group: "interactive",
		description: "Tinted ground for a selected interactive row",
		from: "bgMuted",
	},
	{
		key: "interactiveDisabled",
		property: "--color-interactive-disabled",
		group: "interactive",
		description: "`interactive` when the control is unavailable",
		from: "textDisabled",
	},
	{
		key: "accent",
		property: "--color-accent",
		group: "interactive",
		description: "Secondary brand colour — gradients and the accent fill",
		from: "interactive",
	},
	{
		key: "accentHover",
		property: "--color-accent-hover",
		group: "interactive",
		description: "`accent` under the pointer",
		from: "accent",
	},
];

/**
 * `<role>Text` / `<role>Bg` / `<role>Border` for each semantic state. The text
 * and background pair is required because it is the pair an author has to judge
 * for contrast; the border derives from the text colour.
 */
const SEMANTIC: VariantTokenDef[] = SEMANTIC_ROLES.flatMap((role): VariantTokenDef[] => [
	{
		key: `${role}Text`,
		property: `--color-${role}-text`,
		group: "semantic",
		description: `${capitalize(role)} ink, sitting on \`${role}Bg\``,
		required: true,
		fallback: "CanvasText",
	},
	{
		key: `${role}Bg`,
		property: `--color-${role}-bg`,
		group: "semantic",
		description: `${capitalize(role)} tinted ground for alerts and badges`,
		required: true,
		from: "bgSubtle",
	},
	{
		key: `${role}Border`,
		property: `--color-${role}-border`,
		group: "semantic",
		description: `Border around a ${role} alert or badge`,
		from: `${role}Text`,
	},
]);

/**
 * Filled controls. `Fg` is the ink deliberately chosen for the fill — without
 * it the only token in reach is `--color-bg`, which lands well under 4.5:1 on a
 * mid-scale light-mode fill.
 */
const FILLS: VariantTokenDef[] = FILL_ROLES.flatMap((role): VariantTokenDef[] => {
	const isAccent = role === "accent";
	return [
		{
			key: `btn${capitalize(role)}Bg`,
			property: `--btn-${role}-bg`,
			group: "fill",
			description: `Fill for a ${role} button`,
			required: !isAccent,
			from: isAccent ? "accent" : `${role}Text`,
		},
		{
			key: `btn${capitalize(role)}Fg`,
			property: `--btn-${role}-color`,
			group: "fill",
			description: `Ink on the ${role} fill — pick it against \`btn${
				capitalize(role)
			}Bg\`, not against the page`,
			required: !isAccent,
			from: isAccent ? "textOnBrand" : `${role}Bg`,
		},
		{
			key: `btn${capitalize(role)}BgHover`,
			property: `--btn-${role}-bg-hover`,
			group: "fill",
			description: `The ${role} fill under the pointer`,
			from: `btn${capitalize(role)}Bg`,
		},
		{
			key: `btn${capitalize(role)}Border`,
			property: `--btn-${role}-border`,
			group: "fill",
			description: `Border around the ${role} fill`,
			fallback: "transparent",
		},
	];
});

const OVERLAY: VariantTokenDef[] = [
	{
		key: "toastBg",
		property: "--toast-bg",
		group: "overlay",
		description: "Toast background",
		from: "surfaceOverlay",
	},
	{
		key: "toastFg",
		property: "--toast-color",
		group: "overlay",
		description: "Toast text",
		from: "text",
	},
	{
		key: "toastBorder",
		property: "--toast-border",
		group: "overlay",
		description: "Toast border",
		from: "border",
	},
	{
		key: "tooltipBg",
		property: "--tooltip-bg",
		group: "overlay",
		description: "Tooltip background — conventionally inverted against the page",
		from: "text",
	},
	{
		key: "tooltipFg",
		property: "--tooltip-color",
		group: "overlay",
		description: "Tooltip text",
		from: "textInverse",
	},
	{
		key: "modalBackdrop",
		property: "--modal-backdrop",
		group: "overlay",
		description: "Scrim behind a modal",
		fallback: "rgb(0 0 0 / 0.7)",
	},
];

const MISC: VariantTokenDef[] = [
	{
		key: "highlightBg",
		property: "--color-highlight-bg",
		group: "misc",
		description: "Marker highlight behind inline text",
		from: "accent",
	},
	{
		key: "highlightFg",
		property: "--color-highlight-text",
		group: "misc",
		description: "Ink on a highlight",
		from: "textOnBrand",
	},
];

/**
 * Every variant token, in documentation order. The order is also the order they
 * are emitted in, so a generated block reads grounds → text → borders →
 * interactive → semantic → fills → overlays.
 */
export const VARIANT_TOKENS: readonly VariantTokenDef[] = Object.freeze([
	...GROUND,
	...TEXT,
	...BORDER,
	...INTERACTIVE,
	...SEMANTIC,
	...FILLS,
	...OVERLAY,
	...MISC,
]);

/** Variant tokens indexed by their authoring key. */
export const VARIANT_TOKENS_BY_KEY: ReadonlyMap<string, VariantTokenDef> = new Map(
	VARIANT_TOKENS.map((t) => [t.key, t]),
);

/** Variant tokens indexed by the CSS custom property they write to. */
export const VARIANT_TOKENS_BY_PROPERTY: ReadonlyMap<string, VariantTokenDef> = new Map(
	VARIANT_TOKENS.map((t) => [t.property, t]),
);

/** Keys every variant has to supply. */
export const REQUIRED_VARIANT_KEYS: readonly string[] = Object.freeze(
	VARIANT_TOKENS.filter((t) => t.required).map((t) => t.key),
);

/**
 * Resolves an authoring key or a raw custom property to its token definition,
 * so both `btnSuccessFg` and `--btn-success-color` name the same slot.
 */
export function lookupVariantToken(nameOrProperty: string): VariantTokenDef | undefined {
	return VARIANT_TOKENS_BY_KEY.get(nameOrProperty) ??
		VARIANT_TOKENS_BY_PROPERTY.get(nameOrProperty);
}

/**
 * Completes a variant's rule set: every token the variant omitted is filled in
 * from its `from` chain (as a `var()` reference to the token it derives from)
 * or its literal fallback. Rules the theme set by hand always win, and rules
 * naming a property outside the manifest are passed through untouched so a
 * theme can still reach a component token directly.
 *
 * @param rules Rules keyed by CSS custom property, as stored in the theme file.
 * @returns The complete rule set, keyed by custom property, in manifest order.
 */
export function completeVariantRules<T>(
	rules: Record<string, T | string>,
): Record<string, T | string> {
	const complete: Record<string, T | string> = {};

	for (const token of VARIANT_TOKENS) {
		const own = rules[token.property];
		if (own !== undefined && own !== null && own !== "") {
			complete[token.property] = own;
			continue;
		}
		const derived = deriveValue(token, rules);
		if (derived !== undefined) complete[token.property] = derived;
	}

	// Anything the theme declared that isn't a manifest token — a component
	// token reached directly, say — survives at the end of the block.
	for (const [property, value] of Object.entries(rules)) {
		if (!VARIANT_TOKENS_BY_PROPERTY.has(property)) complete[property] = value;
	}

	return complete;
}

/**
 * Walks a token's `from` chain until it reaches a slot the variant actually
 * defined, or a literal fallback. Emits a `var()` reference rather than the
 * resolved colour so the relationship stays visible in the output and keeps
 * tracking the source token if it is overridden further down the cascade.
 */
function deriveValue(
	token: VariantTokenDef,
	rules: Record<string, unknown>,
	seen: Set<string> = new Set(),
): string | undefined {
	if (seen.has(token.key)) return token.fallback;
	seen.add(token.key);

	if (token.from) {
		const source = VARIANT_TOKENS_BY_KEY.get(token.from);
		if (!source) return token.fallback;
		const sourceDefined = rules[source.property] !== undefined && rules[source.property] !== "";
		// A defined source, or one that will itself be derived, is reachable by
		// reference — either way the emitted var() resolves inside the block.
		if (sourceDefined || source.required || deriveValue(source, rules, seen) !== undefined) {
			return `var(${source.property})`;
		}
	}
	return token.fallback;
}

/** Groups the manifest for rendering a token table in docs or tool descriptions. */
export function variantTokensByGroup(): Map<VariantTokenGroup, VariantTokenDef[]> {
	const groups = new Map<VariantTokenGroup, VariantTokenDef[]>();
	for (const token of VARIANT_TOKENS) {
		const bucket = groups.get(token.group) ?? [];
		bucket.push(token);
		groups.set(token.group, bucket);
	}
	return groups;
}
