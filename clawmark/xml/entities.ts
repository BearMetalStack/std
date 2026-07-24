/**
 * @module
 * Entity decoding for the XML/HTML parser.
 *
 * Deliberately not reusing `@bearmetal/miscellanea`'s `unescapeHtml`: its regex
 * is `/&(gt|lt|apos);/g`, so it silently never unescapes `&quot;` or `&amp;`
 * despite both sitting in its own lookup table, and it handles no numeric
 * entities at all. Importing it would also give clawmark its first non-relative
 * source import, which the package has so far avoided.
 *
 * The table is the ~200 entities that actually turn up in HTML, OOXML and ODF
 * output, not the full 2,231-entry HTML5 set - that would be ~30kB of source in
 * a package whose whole pitch is being small. Callers needing more pass
 * `entities` to the parser.
 */

const NAMED: Record<string, string> = {
	// XML's own five
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",

	// Latin-1 punctuation and symbols
	nbsp: " ",
	iexcl: "¡",
	cent: "¢",
	pound: "£",
	curren: "¤",
	yen: "¥",
	brvbar: "¦",
	sect: "§",
	uml: "¨",
	copy: "©",
	ordf: "ª",
	laquo: "«",
	not: "¬",
	shy: "­",
	reg: "®",
	macr: "¯",
	deg: "°",
	plusmn: "±",
	sup2: "²",
	sup3: "³",
	acute: "´",
	micro: "µ",
	para: "¶",
	middot: "·",
	cedil: "¸",
	sup1: "¹",
	ordm: "º",
	raquo: "»",
	frac14: "¼",
	frac12: "½",
	frac34: "¾",
	iquest: "¿",
	times: "×",
	divide: "÷",

	// Latin-1 letters
	Agrave: "À",
	Aacute: "Á",
	Acirc: "Â",
	Atilde: "Ã",
	Auml: "Ä",
	Aring: "Å",
	AElig: "Æ",
	Ccedil: "Ç",
	Egrave: "È",
	Eacute: "É",
	Ecirc: "Ê",
	Euml: "Ë",
	Igrave: "Ì",
	Iacute: "Í",
	Icirc: "Î",
	Iuml: "Ï",
	ETH: "Ð",
	Ntilde: "Ñ",
	Ograve: "Ò",
	Oacute: "Ó",
	Ocirc: "Ô",
	Otilde: "Õ",
	Ouml: "Ö",
	Oslash: "Ø",
	Ugrave: "Ù",
	Uacute: "Ú",
	Ucirc: "Û",
	Uuml: "Ü",
	Yacute: "Ý",
	THORN: "Þ",
	szlig: "ß",
	agrave: "à",
	aacute: "á",
	acirc: "â",
	atilde: "ã",
	auml: "ä",
	aring: "å",
	aelig: "æ",
	ccedil: "ç",
	egrave: "è",
	eacute: "é",
	ecirc: "ê",
	euml: "ë",
	igrave: "ì",
	iacute: "í",
	icirc: "î",
	iuml: "ï",
	eth: "ð",
	ntilde: "ñ",
	ograve: "ò",
	oacute: "ó",
	ocirc: "ô",
	otilde: "õ",
	ouml: "ö",
	oslash: "ø",
	ugrave: "ù",
	uacute: "ú",
	ucirc: "û",
	uuml: "ü",
	yacute: "ý",
	thorn: "þ",
	yuml: "ÿ",

	// Typography - the ones word processors emit constantly
	ensp: " ",
	emsp: " ",
	thinsp: " ",
	zwnj: "‌",
	zwj: "‍",
	lrm: "‎",
	rlm: "‏",
	ndash: "–",
	mdash: "—",
	lsquo: "‘",
	rsquo: "’",
	sbquo: "‚",
	ldquo: "“",
	rdquo: "”",
	bdquo: "„",
	dagger: "†",
	Dagger: "‡",
	bull: "•",
	hellip: "…",
	permil: "‰",
	prime: "′",
	Prime: "″",
	lsaquo: "‹",
	rsaquo: "›",
	oline: "‾",
	frasl: "⁄",
	euro: "€",
	trade: "™",

	// Arrows / math / misc that show up in ODF and OOXML symbol runs
	larr: "←",
	uarr: "↑",
	rarr: "→",
	darr: "↓",
	harr: "↔",
	crarr: "↵",
	lArr: "⇐",
	uArr: "⇑",
	rArr: "⇒",
	dArr: "⇓",
	hArr: "⇔",
	minus: "−",
	lowast: "∗",
	radic: "√",
	infin: "∞",
	ne: "≠",
	le: "≤",
	ge: "≥",
	sum: "∑",
	prod: "∏",
	part: "∂",
	int: "∫",
	asymp: "≈",
	equiv: "≡",
	sub: "⊂",
	sup: "⊃",
	nsub: "⊄",
	sube: "⊆",
	supe: "⊇",
	isin: "∈",
	notin: "∉",
	cap: "∩",
	cup: "∪",
	and: "∧",
	or: "∨",
	forall: "∀",
	exist: "∃",
	empty: "∅",
	nabla: "∇",
	prop: "∝",
	ang: "∠",
	there4: "∴",
	sim: "∼",
	cong: "≅",
	perp: "⊥",
	sdot: "⋅",
	loz: "◊",
	spades: "♠",
	clubs: "♣",
	hearts: "♥",
	diams: "♦",

	// Greek - ODF math and symbol fonts
	Alpha: "Α",
	Beta: "Β",
	Gamma: "Γ",
	Delta: "Δ",
	Epsilon: "Ε",
	Zeta: "Ζ",
	Eta: "Η",
	Theta: "Θ",
	Iota: "Ι",
	Kappa: "Κ",
	Lambda: "Λ",
	Mu: "Μ",
	Nu: "Ν",
	Xi: "Ξ",
	Omicron: "Ο",
	Pi: "Π",
	Rho: "Ρ",
	Sigma: "Σ",
	Tau: "Τ",
	Upsilon: "Υ",
	Phi: "Φ",
	Chi: "Χ",
	Psi: "Ψ",
	Omega: "Ω",
	alpha: "α",
	beta: "β",
	gamma: "γ",
	delta: "δ",
	epsilon: "ε",
	zeta: "ζ",
	eta: "η",
	theta: "θ",
	iota: "ι",
	kappa: "κ",
	lambda: "λ",
	mu: "μ",
	nu: "ν",
	xi: "ξ",
	omicron: "ο",
	pi: "π",
	rho: "ρ",
	sigmaf: "ς",
	sigma: "σ",
	tau: "τ",
	upsilon: "υ",
	phi: "φ",
	chi: "χ",
	psi: "ψ",
	omega: "ω",
};

/**
 * Windows-1252 remap that HTML requires for numeric references in the C1
 * range - `&#128;` means the euro sign, not U+0080. Word's HTML export relies
 * on this, so it is not optional for our main real-world input.
 */
const C1_REMAP: Record<number, number> = {
	0x80: 0x20ac,
	0x82: 0x201a,
	0x83: 0x0192,
	0x84: 0x201e,
	0x85: 0x2026,
	0x86: 0x2020,
	0x87: 0x2021,
	0x88: 0x02c6,
	0x89: 0x2030,
	0x8a: 0x0160,
	0x8b: 0x2039,
	0x8c: 0x0152,
	0x8e: 0x017d,
	0x91: 0x2018,
	0x92: 0x2019,
	0x93: 0x201c,
	0x94: 0x201d,
	0x95: 0x2022,
	0x96: 0x2013,
	0x97: 0x2014,
	0x98: 0x02dc,
	0x99: 0x2122,
	0x9a: 0x0161,
	0x9b: 0x203a,
	0x9c: 0x0153,
	0x9e: 0x017e,
	0x9f: 0x0178,
};

const REPLACEMENT = "�";

function fromCodePoint(code: number): string {
	if (code === 0 || code > 0x10ffff) return REPLACEMENT;
	// Lone surrogates are not valid scalar values.
	if (code >= 0xd800 && code <= 0xdfff) return REPLACEMENT;
	if (C1_REMAP[code] !== undefined) return String.fromCodePoint(C1_REMAP[code]);
	return String.fromCodePoint(code);
}

const ENTITY_RX = /&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g;

/**
 * Decodes entity references in `input`. An unrecognized reference is left
 * exactly as written rather than dropped - losing text silently is far worse
 * than passing an odd `&foo;` through to the markdown.
 */
export function decodeEntities(
	input: string,
	extra?: Record<string, string>,
	onBad?: (name: string, offset: number) => void,
): string {
	if (!input.includes("&")) return input;

	return input.replace(ENTITY_RX, (match, body: string, offset: number) => {
		if (body[0] === "#") {
			const hex = body[1] === "x" || body[1] === "X";
			const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
			if (Number.isNaN(code)) {
				onBad?.(match, offset);
				return match;
			}
			return fromCodePoint(code);
		}
		const hit = extra?.[body] ?? NAMED[body];
		if (hit === undefined) {
			onBad?.(match, offset);
			return match;
		}
		return hit;
	});
}

/** The built-in named table, exposed so callers can inspect or extend it. */
export { NAMED as namedEntities };
