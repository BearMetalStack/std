import type { Theme } from "@bearmetal/drip";
import { emitCalcCSS, isCalcNode } from "../css/calc.ts";

export class ThemeUtils {
	constructor(private data: Theme) {}

	async *eachColor(
		{ skipReferences, skipIdentities }: { skipReferences?: boolean; skipIdentities?: boolean } = {},
	): AsyncGenerator<[string, string], void, unknown> {
		const colors = this.data.color;
		yield* this._each(colors as Theme, ["color"]).filter((e) => {
			let result = true;
			if (skipReferences) result = result && e[1].startsWith("#");
			if (skipIdentities) result = result && /[1-9][05](0)?$/.test(e[0]);
			return result;
		});
	}

	*_each(theme: Theme, path: string[] = []): Generator<[string, string], void, unknown> {
		for (const [key, sub] of Object.entries(theme)) {
			if (key.startsWith("#")) continue;
			if (typeof sub === "string") yield [buildPath(...path, key), sub];
			else if (isCalcNode(sub)) yield [buildPath(...path, key), emitCalcCSS(sub)];
			else if (sub && !Array.isArray(sub)) yield* this._each(sub as Theme, [...path, key]);
		}
	}
}

function buildPath(...s: string[]) {
	return s.filter(Boolean).join("-");
}
