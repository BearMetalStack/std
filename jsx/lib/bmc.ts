const _MARKER = Symbol.for("bearmetal.bmc");

// deno-lint-ignore no-explicit-any
const _Base = ((globalThis as any).HTMLElement ?? class {}) as abstract new (...args: any[]) => any;

export abstract class BMC extends _Base {
	static readonly [_MARKER] = true;
	static tag: string;
	/** @description tells SSR that this component is client-only */
	static client: boolean = false;

	static serverRender(
		_props: Record<string, unknown>,
		children: string,
	): string | Promise<string> {
		return children;
	}

	static serverLoad?(
		_props: Record<string, unknown>,
	): Record<string, unknown> | Promise<Record<string, unknown>> {
		return {};
	}

	get parentBMC(): BMC | null {
		if (typeof document === "undefined") return null;
		const self = this as unknown as HTMLElement;
		let current = self.parentElement;
		while (current && !isBMC(current)) {
			current = current?.parentElement;
		}

		return current as unknown as BMC;
	}
}

export function isBMC(v: unknown): v is typeof BMC {
	// deno-lint-ignore no-explicit-any
	return typeof v === "function" && (v as any)[_MARKER] === true;
}
