import type { Theme } from "@bearmetal/drip";
import { emitCalcCSS, isCalcNode } from "../css/calc.ts";

export class ThemeUtils {
	constructor(private data: Theme) {}

	async *eachColor({ skipReferences }: { skipReferences?: boolean } = {}) {
		const colors = this.data.color;
		yield* this._each(colors as Theme, ["color"]).filter((e) => {
			if (skipReferences) return e[1].startsWith("#");
			return true;
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
