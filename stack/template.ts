import type { CollectionMap } from "@bearmetal/miscellanea";

import type { DenoConfig } from "./denoConfig.ts";
import { type ResolveOptions, TemplateProcessor } from "./directive.ts";
import type { flags } from "./flags.ts";
import { templates } from "./templates/embedded.ts";

type MainTemplateOpts = flags;

const optional: Partial<
	{
		[key in keyof flags]: (
			partials: CollectionMap<string, string>,
			opts: MainTemplateOpts,
		) => void;
	}
> = {
	db(p, opts) {
		p.add("main-ts-imports", `import { dbModule } from "@bearmetal/db"`);
		p.add("main-ts-middleware", `.use(dbModule("${opts.db}"))`);
	},
	devProxy(p, opts) {
		p.add("main-ts-imports", `import { devProxyModule } from "@bearmetal/devproxy"`);
		p.add("main-ts-middleware", `.use(devProxyModule("${opts.devProxy}"))`);
	},
	auth(p, _opts) {
		p.add("main-ts-imports", `import { authModule } from "@bearmetal/auth"`);
		p.add("main-ts-imports", `import { s } from "@bearmetal/forge"`);
		p.add("main-ts-middleware", `.use(authModule(s.object({ username: s.string() })))`);
	},
};

export function processFlagPartials(
	opts: MainTemplateOpts,
	partials: CollectionMap<string, string>,
): ResolveOptions {
	const ropts: ResolveOptions = {};
	for (const [key, fn] of Object.entries(optional)) {
		if (opts[key as keyof flags]) {
			fn(partials, opts);
			ropts[key] = true;
		}
	}
	return ropts;
}

/** Templates that can be scaffolded, for `--template` and its `--help` entry. */
export const templateNames: readonly string[] = Object.keys(templates);

/**
 * The `deno.json` a scaffolded app starts with.
 *
 * Generated rather than templated because it is the one file whose contents
 * depend on which optional modules were chosen.
 */
export function denoJson(_projectName: string, packages: Set<string>): string {
	const imports: DenoConfig["imports"] = {
		"@components/": "./components/",
		"@views/": "./views/",
	};
	packages.forEach((pkg) => {
		imports[`${pkg}`] = `jsr:${pkg}`;
	});

	const config: DenoConfig = {
		tasks: {
			"bm:bootstrap": {
				description: "Bootstrap the BearMetal stack.",
				dependencies: ["bm:drip"],
			},
			"bm:drip": {
				description: "Generates theme completions and CSS",
				command: "deno run -RW jsr:@bearmetal/drip",
			},
			"bm:dev": {
				description: "Starts the dev server, rebuilding and reloading on a change",
				command: "deno run -P=dev --watch main.ts",
			},
			"bm:start": {
				description: "Starts the server in production mode",
				command: "deno run -P=prod main.ts",
			},
		},
		permissions: {
			// `write` and `import` are what the client bundler needs: it writes a
			// synthesized entrypoint to a temp file and imports every component
			// module for its `@define` side effects.
			dev: {
				read: true,
				write: true,
				net: true,
				import: true,
				env: ["BEARMETAL_ENV"],
			},
			prod: {
				read: true,
				write: true,
				net: true,
				import: true,
				env: ["BEARMETAL_ENV"],
			},
		},
		// `Deno.bundle` is what builds the client bundle, and it is still unstable.
		unstable: ["bundle"],
		imports,
		compilerOptions: {
			jsx: "react-jsx",
			jsxImportSource: "@bearmetal/jsx",
			lib: ["deno.ns", "deno.window", "dom", "dom.iterable", "esnext"],
			noImplicitOverride: false,
		},
		fmt: {
			useTabs: true,
		},
	};

	return JSON.stringify(config, null, "\t") + "\n";
}

/**
 * Writes a template into `targetDir`, resolving its directives against `opts`.
 *
 * The files are embedded in this package (see `templates/generate.ts`), so this
 * touches the network not at all and cannot hand out a template written for a
 * different version of the stack.
 */
export function loadTemplateFiles(
	targetDir: string,
	partials: CollectionMap<string, string>,
	opts: ResolveOptions,
	templateRoot = "default",
	dryRun = false,
): Promise<void> {
	const files = templates[templateRoot];
	if (!files) {
		throw new Error(
			`Unknown template "${templateRoot}". Available: ${templateNames.join(", ")}.`,
		);
	}

	console.log(`   loading template "${templateRoot}"...`);
	const processor = new TemplateProcessor(opts, { targetDir, partials, dryRun });
	for (const [path, contents] of Object.entries(files)) processor.scan(path, contents);
	return processor.write(processor.resolve());
}
