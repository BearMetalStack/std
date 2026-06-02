export interface BadgeSection {
	text: string;
	bg: string;
	textColor: string;
	/** Accent color used for the slash shadow. Defaults to textColor at 35% opacity. */
	accentColor?: string;
}

export type BadgeVariant = "filled" | "pill" | "outlined";

export interface BadgeOptions {
	sections: [BadgeSection, BadgeSection] | [
		BadgeSection,
		BadgeSection,
		BadgeSection,
	];
	variant?: BadgeVariant;
	height?: number;
	fontSize?: number;
	paddingX?: number;
	/** Corner radius. Defaults: pill = height/2, others = 4 */
	radius?: number;
	/** Font family string embedded in SVG. Defaults to JetBrains Mono stack. */
	fontFamily?: string;
	/** Base64-encoded WOFF2 to embed. fontFamily must match its declared name. */
	fontBase64?: string;
	/** Width lookup: (codepoint) => pixelWidth. Plug in parseTTF output directly. */
	measureWidth?: (codepoint: number) => number;
}

// ---------------------------------------------------------------------------
// Text measurement
// ---------------------------------------------------------------------------
const FALLBACK_CHAR_WIDTH = 6.5; // px per char at 10.5px monospace

function measureText(
	text: string,
	fontSize: number,
	measureWidth?: (codepoint: number) => number,
): number {
	if (measureWidth) {
		let w = 0;
		for (const ch of text) w += measureWidth(ch.codePointAt(0)!);
		return w;
	}
	return text.length * FALLBACK_CHAR_WIDTH * (fontSize / 10.5);
}

// ---------------------------------------------------------------------------
// Separator geometry
// ---------------------------------------------------------------------------

/**
 * Slash separator between label (section 0) and value (section 1).
 *
 * The label is drawn as a parallelogram - top-right at `x`, bottom-right
 * pulled left by `skew`. The shadow strip sits flush on the right edge of
 * that parallelogram, derived by offsetting the same edge `shadow` px right.
 *
 * Label parallelogram:  (0,0)  (x,0)      (x-skew,h)  (0,h)
 * Right edge:           (x,0)  ->          (x-skew,h)
 * Shadow strip:         (x,0)  (x+shadow,0)  (x-skew+shadow,h)  (x-skew,h)
 *
 * @param x      x offset where the value section begins (= label section width)
 * @param h      badge height
 * @param skew   how far the bottom-right corner pulls left (default 8)
 * @param shadow shadow strip width in px (default 4)
 * @param labelBg label section background color
 */
function slashSeparator(
	x: number,
	h: number,
	labelBg: string,
	skew = 8,
	shadow = 4,
): string {
	// Label parallelogram
	const label = `0,0 ${x},0 ${x - skew},${h} 0,${h}`;
	// Shadow strip - right edge of label + shadow px rightward
	const strip = `${x},0 ${x + shadow},0 ${x - skew + shadow},${h} ${x - skew},${h}`;
	return [
		`    <polygon points="${label}" fill="${labelBg}"/>`,
		`    <polygon points="${strip}" fill="#000" opacity=".35"/>`,
	].join("\n");
}

/**
 * Chevron separator between value (section 1) and extra (section 2).
 *
 * The colored triangle uses the value section's bg so it reads as that
 * section pointing into the extra section. The shadow sliver's left points
 * trace the triangle's right hypotenuse exactly - no gap, no overlap.
 *
 * Triangle:      (x,0)  (x,h)  (x+depth, h/2)
 * Shadow sliver: (x,0)  (x+shadow,0)  (x+depth+shadow, h/2)
 *                (x+shadow,h)  (x,h)  (x+depth, h/2)   <- shared apex
 *
 * @param x        x offset where the extra section begins
 * @param h        badge height
 * @param valueBg  the value section's bg color
 * @param depth    how far the chevron point extends right (default 12)
 * @param shadow   shadow sliver width in px (default 2)
 */
function chevronSeparator(
	x: number,
	h: number,
	valueBg: string,
	depth = 12,
	shadow = 4,
): string {
	const mid = h / 2;
	const tri = `${x - 1},0 ${x - 1},${h} ${x},${h} ${x + depth},${mid} ${x},0`;
	const sliver = [
		`${x},0`,
		`${x + shadow},0`,
		`${x + depth + shadow},${mid}`,
		`${x + shadow},${h}`,
		`${x},${h}`,
		`${x + depth},${mid}`,
	].join(" ");
	return [
		`    <polygon points="${tri}" fill="${valueBg}"/>`,
		`    <polygon points="${sliver}" fill="#000" opacity=".3"/>`,
	].join("\n");
}

// ---------------------------------------------------------------------------
// Core renderer
// ---------------------------------------------------------------------------
export function renderBadge(opts: BadgeOptions): string {
	const {
		sections,
		variant = "filled",
		height = 22,
		fontSize = 10.5,
		paddingX = 10,
		fontFamily = "'JetBrains Mono',ui-monospace,'Courier New',monospace",
		fontBase64,
		measureWidth,
	} = opts;

	const isPill = variant === "pill";
	const isOutlined = variant === "outlined";
	const radius = opts.radius ?? (isPill ? Math.floor(height / 2) : 4);
	const textY = Math.round(height * 0.68);

	const SLASH_SKEW = 8;
	const CHEVRON_DEPTH = 6;
	const STRIPE = 4; // pill left accent stripe width

	// Section widths.
	// Label (0): extra right padding to keep text clear of the slash.
	// Extra (2): extra left padding to keep text clear of the chevron tip.
	const sectionWidths = sections.map((s, i) => {
		const textW = measureText(s.text, fontSize, measureWidth);
		const leftPad = paddingX;
		const rightPad = i === 0
			? paddingX + SLASH_SKEW
			: i === 2
			? paddingX + CHEVRON_DEPTH
			: paddingX;
		return Math.ceil(textW + leftPad + rightPad);
	});

	const totalWidth = sectionWidths.reduce((a, b) => a + b, 0);

	const offsets: number[] = [];
	let cursor = 0;
	for (const w of sectionWidths) {
		offsets.push(cursor);
		cursor += w;
	}
	const clipId = `bm-${Math.random().toString(36).slice(2, 8)}`;

	const defsContent: string[] = [
		`<clipPath id="${clipId}"><rect width="${totalWidth}" height="${height}" rx="${radius}"/></clipPath>`,
	];
	if (fontBase64) {
		defsContent.push(
			`<style>@font-face{font-family:${fontFamily};src:url('data:font/woff2;base64,${fontBase64}')format('woff2');}</style>`,
		);
	}

	const out: string[] = [];
	out.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img">`,
	);
	out.push(`  <defs>${defsContent.join("")}</defs>`);

	if (isOutlined) {
		// Outlined variant - plain vertical dividers, no slash/chevron
		let borderColor = sections[0].accentColor ?? sections[0].textColor;
		out.push(
			`  <rect x="0.5" y="0.5" width="${totalWidth - 1}" height="${height - 1}" rx="${
				radius - 0.5
			}" fill="none" stroke="${borderColor}" stroke-width="1"/>`,
		);
		out.push(
			`  <rect x="0.5" y="0.5" width="${sectionWidths[0] - 0.5}" height="${height - 1}" rx="${
				radius - 0.5
			}" fill="${sections[0].bg}"/>`,
		);
		for (let i = 1; i < sections.length; i++) {
			borderColor = sections[i].accentColor ?? sections[i].textColor;
			out.push(
				`  <line x1="${offsets[i]}" y1="1" x2="${offsets[i]}" y2="${
					height - 1
				}" stroke="${borderColor}" stroke-width="3"/>`,
			);
		}
	} else {
		// Filled / pill
		out.push(`  <g clip-path="url(#${clipId})">`);

		// Value and extra section background fills (label is drawn by slashSeparator)
		for (let i = 1; i < sections.length; i++) {
			out.push(
				`    <rect x="${offsets[i] - (i === 1 ? SLASH_SKEW : 0)}" width="${
					sectionWidths[i] + (i === 1 ? SLASH_SKEW : 0)
				}" height="${height}" fill="${sections[i].bg}"/>`,
			);
		}

		// Pill left accent stripe (drawn before label so it sits under the parallelogram)
		if (isPill) {
			const accent = sections[0].accentColor ?? sections[0].textColor;
			out.push(
				`    <rect x="0" width="${STRIPE}" height="${height}" fill="${accent}"/>`,
			);
		}

		// Slash: label parallelogram + shadow strip
		// x = label section width (= start of value section)
		out.push(
			slashSeparator(sectionWidths[0], height, sections[0].bg, SLASH_SKEW),
		);

		// Chevron between section 1 and section 2 (3-section only)
		if (sections.length === 3) {
			out.push(
				chevronSeparator(offsets[2], height, sections[1].bg, CHEVRON_DEPTH),
			);
		}

		out.push(`  </g>`);
	}

	// Text layer - centered within each section's rect bounds
	// Label text center is nudged left by half the skew so it sits in the parallelogram
	out.push(`  <g font-family="${fontFamily}" font-size="${fontSize}">`);
	for (let i = 0; i < sections.length; i++) {
		const s = sections[i];
		let cx = offsets[i] + sectionWidths[i] / 2;
		if (i === 0) cx -= SLASH_SKEW / 2; // optical center within parallelogram
		if (isPill && i === 0) cx += STRIPE / 2;
		if (i === 2 && !isOutlined) cx += CHEVRON_DEPTH / 2;
		out.push(
			`    <text x="${Math.round(cx)}" y="${textY}" text-anchor="middle" fill="${
				isOutlined ? s.accentColor : s.textColor
			}">${escapeXml(s.text)}</text>`,
		);
	}
	out.push(`  </g>`);
	out.push(`</svg>`);

	return out.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// BearMetal theme presets
// Usage: renderBadge({ sections: [BM.LABEL("version"), BM.BRAND("v1.4.2")] })
// ---------------------------------------------------------------------------
export const BM = {
	/** Dark near-black label */
	LABEL: (text: string): BadgeSection => ({
		text,
		bg: "#1c1820",
		textColor: "#e8ccff",
		accentColor: "#e8ccff",
	}),
	LABEL_LIGHT: (text: string): BadgeSection => ({
		text,
		bg: "#544d5e",
		textColor: "#ffffff",
		accentColor: "#7711cc",
	}),
	LABEL_INVERT: (text: string): BadgeSection => ({
		text,
		bg: "#e8ccff",
		textColor: "#1c1820",
		accentColor: "#e8ccff",
	}),
	/** Brand purple */
	BRAND: (text: string): BadgeSection => ({
		text,
		bg: "#4a0080",
		textColor: "#ffffff",
		accentColor: "#7711cc",
	}),
	BRAND_DARK: (text: string): BadgeSection => ({
		text,
		bg: "#290047",
		textColor: "#cc99ff",
		accentColor: "#7711cc",
	}),
	BRAND_LIGHT: (text: string): BadgeSection => ({
		text,
		bg: "#7711cc",
		textColor: "#ffffff",
		accentColor: "#7711cc",
	}),
	BRAND_INVERT: (text: string): BadgeSection => ({
		text,
		bg: "#cc99ff",
		textColor: "#4a0080",
		accentColor: "#7711cc",
	}),

	/** Success green */
	SUCCESS: (text: string): BadgeSection => ({
		text,
		bg: "#005c08",
		textColor: "#ffffff",
		accentColor: "#6bcf72",
	}),
	SUCCESS_DARK: (text: string): BadgeSection => ({
		text,
		bg: "#003d05",
		textColor: "#d6f5d8",
		accentColor: "#6bcf72",
	}),
	SUCCESS_LIGHT: (text: string): BadgeSection => ({
		text,
		bg: "#2ea838",
		textColor: "#ffffff",
		accentColor: "#6bcf72",
	}),
	SUCCESS_INVERT: (text: string): BadgeSection => ({
		text,
		bg: "#a8e8ac",
		textColor: "#005c08",
		accentColor: "#6bcf72",
	}),

	/** Danger red */
	DANGER: (text: string): BadgeSection => ({
		text,
		bg: "#5c0026",
		textColor: "#ffffff",
		accentColor: "#d96690",
	}),
	DANGER_DARK: (text: string): BadgeSection => ({
		text,
		bg: "#380016",
		textColor: "#f8d6e3",
		accentColor: "#d96690",
	}),
	DANGER_LIGHT: (text: string): BadgeSection => ({
		text,
		bg: "#b03060",
		textColor: "#fdf0f4",
		accentColor: "#d96690",
	}),
	DANGER_INVERT: (text: string): BadgeSection => ({
		text,
		bg: "#f0a8c2",
		textColor: "#5c0026",
		accentColor: "#d96690",
	}),

	/** Warning amber */
	WARNING: (text: string): BadgeSection => ({
		text,
		bg: "#3d2e00",
		textColor: "#ffffff",
		accentColor: "#e8c030",
	}),
	WARNING_DARK: (text: string): BadgeSection => ({
		text,
		bg: "#261c00",
		textColor: "#faefc8",
		accentColor: "#e8c030",
	}),
	WARNING_LIGHT: (text: string): BadgeSection => ({
		text,
		bg: "#a88800",
		textColor: "#fdf9ee",
		accentColor: "#e8c030",
	}),
	WARNING_INVERT: (text: string): BadgeSection => ({
		text,
		bg: "#f5dc88",
		textColor: "#3d2e00",
		accentColor: "#e8c030",
	}),

	/** Info navy */
	INFO: (text: string): BadgeSection => ({
		text,
		bg: "#001f4a",
		textColor: "#ffffff",
		accentColor: "#4e9add",
	}),
	INFO_DARK: (text: string): BadgeSection => ({
		text,
		bg: "#001028",
		textColor: "#cce0f8",
		accentColor: "#4e9add",
	}),
	INFO_LIGHT: (text: string): BadgeSection => ({
		text,
		bg: "#1a6ab8",
		textColor: "#eef4fd",
		accentColor: "#4e9add",
	}),
	INFO_INVERT: (text: string): BadgeSection => ({
		text,
		bg: "#96c4f0",
		textColor: "#001028",
		accentColor: "#4e9add",
	}),

	ORANGE: (text: string): BadgeSection => ({
		text,
		bg: "#9c4400",
		textColor: "#ffffff",
		accentColor: "#f5a855",
	}),
	ORANGE_DARK: (text: string): BadgeSection => ({
		text,
		bg: "#5a2800",
		textColor: "#fcdcb0",
		accentColor: "#f5a855",
	}),
	ORANGE_LIGHT: (text: string): BadgeSection => ({
		text,
		bg: "#d96810",
		textColor: "#fef4ec",
		accentColor: "#f5a855",
	}),
	ORANGE_INVERT: (text: string): BadgeSection => ({
		text,
		bg: "#fcdcb0",
		textColor: "#9c4400",
		accentColor: "#f5a855",
	}),
} as const;
