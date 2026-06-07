export interface flags {
	devProxy: string | false;
	/** forces the inclusion of the miscellanea package */
	miscellanea: boolean;
	db: "postgres" | false;
	auth: boolean;
}

type flagConfigurator = {
	[key in keyof flags]: () => flags[key];
};

type flagKeyMap = {
	[key in keyof flags]: `--${string}` | `--${string}`[];
};

interface bootstrapOpts {
	flags: flags;
}

const flagConfigurators: flagConfigurator = {
	db() {
		if (confirm("Use a DB provider? (postgres)")) {
			return "postgres";
		}
		return false;
	},
	miscellanea: () => false,
	devProxy() {
		if (confirm("Use a dev proxy?")) {
			return prompt("What is the host of your proxy?") || "dev.bear-metal.dev";
		}
		return false;
	},
	auth() {
		return (confirm("Use auth?"));
	},
};

const flagKeyMap: flagKeyMap = {
	db: "--use-db",
	devProxy: "--dev-proxy",
	miscellanea: "--misc",
	auth: "--auth",
};

export function coalesceFlags(flags: flags) {
	for (const [flag, arg] of Object.entries(flagKeyMap) as [keyof flags, string][]) {
		const f = { found: false };
		if (Array.isArray(arg)) {
			for (const a of arg) {
				flags[flag] = resolveFlags(a, f) ?? false as any;
			}
		} else flags[flag] = resolveFlags(arg, f) ?? false as any;
		if (!f.found) {
			flags[flag] = flagConfigurators[flag]() as any;
		}
	}
}

function resolveFlags(a: string, f: { found: boolean }): string | boolean | null {
	const arg = Deno.args.find((arg) => arg.startsWith(a));
	if (arg) {
		f.found = true;
		return arg.split("=")[1] || true;
	}
	return null;
}
