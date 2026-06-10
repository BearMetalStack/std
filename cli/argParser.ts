export class ArgParser<T extends Record<string, string[]>> {
	private args: string[];
	private flags: Map<keyof T, boolean> = new Map();

	constructor(args: string[]) {
		this.args = args;
	}

	public get(key: string) {
		const index = this.args.indexOf(key);
		if (index === -1) return null;
		return this.args[index + 1];
	}

	setFlagDefs(flagDefs: T) {
		for (const [flag, defs] of Object.entries(flagDefs)) {
			for (const def of defs) {
				if (this.argFlags.includes(def)) {
					this.flags.set(flag, true);
				}
			}
		}
		return this;
	}

	getFlag(flag: keyof T) {
		return this.flags.get(flag);
	}

	get argFlags() {
		return this.args.filter((arg) => arg.startsWith("-"));
	}

	get nonFlags() {
		return this.args.filter((arg) => !arg.startsWith("-"));
	}

	get namedArgs() {
		return this.args.filter((arg) => arg.startsWith("--"));
	}

	get task() {
		return this.nonFlags[0];
	}
	get taskArgs() {
		return this.nonFlags.slice(1);
	}

	static parse(args: string[]) {
		return new ArgParser(args);
	}
}
