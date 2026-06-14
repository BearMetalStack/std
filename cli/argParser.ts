export class ArgParser<T extends Record<string, string[]>> {
	private args: string[];
	private flags: Map<keyof T, boolean> = new Map();

	constructor(args: string[]) {
		this.args = args;
	}

	public get(key: string): string | null {
		const index = this.args.indexOf(key);
		if (index === -1) return null;
		return this.args[index + 1];
	}

	setFlagDefs(flagDefs: T): this {
		for (const [flag, defs] of Object.entries(flagDefs)) {
			for (const def of defs) {
				if (this.argFlags.includes(def)) {
					this.flags.set(flag, true);
				}
			}
		}
		return this;
	}

	getFlag(flag: keyof T): boolean | undefined {
		return this.flags.get(flag);
	}

	get argFlags(): string[] {
		return this.args.filter((arg) => arg.startsWith("-"));
	}

	get nonFlags(): string[] {
		return this.args.filter((arg) => !arg.startsWith("-"));
	}

	get namedArgs(): string[] {
		return this.args.filter((arg) => arg.startsWith("--"));
	}

	get task(): string {
		return this.nonFlags[0];
	}
	get taskArgs(): string[] {
		return this.nonFlags.slice(1);
	}

	static parse(args: string[]): ArgParser<Record<string, string[]>> {
		return new ArgParser(args);
	}
}
