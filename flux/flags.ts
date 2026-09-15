/**
 * @module
 * Hunspell `FLAG` mode handling.
 *
 * Hunspell supports three ways of writing flags in `.aff`/`.dic` files:
 *
 * - default: each character of a flag string is its own single-character flag
 * - `long`: flags come in two-character pairs
 * - `num`: flags are comma-separated decimal numbers
 *
 * Whatever the source format, {@linkcode parseFlags} normalizes every flag to a plain string key,
 * so downstream code never needs to know which mode a dictionary declared.
 */

export type FlagMode = "default" | "long" | "num";

/** Parses the value of an `.aff` `FLAG` directive into a {@linkcode FlagMode}. */
export function parseFlagMode(value: string | undefined): FlagMode {
	if (value === "long") return "long";
	if (value === "num") return "num";
	return "default";
}

/**
 * Splits a raw flag string (as found after the `/` in a `.dic` entry, or as an `.aff` directive
 * value) into normalized, plain-string flag keys per the given {@linkcode FlagMode}.
 */
export function parseFlags(raw: string, mode: FlagMode): string[] {
	if (raw.length === 0) return [];
	switch (mode) {
		case "long": {
			const flags: string[] = [];
			for (let i = 0; i < raw.length; i += 2) {
				flags.push(raw.slice(i, i + 2));
			}
			return flags;
		}
		case "num":
			return raw.split(",").map((flag) => flag.trim()).filter((flag) => flag.length > 0);
		case "default":
			return raw.split("");
	}
}
