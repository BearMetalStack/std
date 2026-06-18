import { UntarStream } from "@std/tar";

import type { CollectionMap } from "@bearmetal/miscellanea";

import type { DenoConfig } from "./denoConfig.ts";
import { type ResolveOptions, TemplateProcessor } from "./directive.ts";
import type { flags } from "./flags.ts";

type MainTemplateOpts = flags;

interface MainTemplate {
	imports: [specifier: string, names: string[]][];
	middleware: string[];
}

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

export function denoJson(_projectName: string, packages: Set<string>) {
	const imports: DenoConfig["imports"] = {
		"@app/": "./app/",
		"@views/": "./views/",
		"@components/": "./components/",
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
				command: "deno run jsr:@bearmetal/drip",
			},
			"bm:dev": {
				description: "Starts the dev server",
				command: "deno run -P=dev main.ts",
			},
		},
		permissions: {
			dev: {
				read: true,
				net: true,
			},
		},
		imports,
		compilerOptions: {
			jsx: "react-jsx",
			jsxImportSource: "@bearmetal/jsx",
			lib: ["deno.ns", "deno.window", "node", "dom"],
			noImplicitOverride: false,
		},
		fmt: {
			useTabs: true,
		},
	};

	return JSON.stringify(config, null, "\t");
}

const version = "first";
const templateBaseUrl =
	`https://github.com/emmalineautumn/BMStackTemplates/archive/refs/tags/${version}.tar.gz`;
export async function loadTemplateFiles(
	targetDir: string,
	partials: CollectionMap<string, string>,
	opts: ResolveOptions,
	templateRoot = "default",
): Promise<void> {
	if (Deno.args.includes("--dry-run")) return;
	console.log(`   loading template "${templateRoot}"...`);
	const tar = await fetch(templateBaseUrl);
	const tarStream = tar.body;
	if (!tarStream) throw new Error("No tar stream");
	const processor = new TemplateProcessor(opts, { targetDir, partials });
	// (await Deno.open("/home/emma/repos/bmtemplate/default.tar.gz"))
	for await (
		const entry of tarStream
			.pipeThrough(new DecompressionStream("gzip")).pipeThrough(
				new UntarStream(),
			)
	) {
		let path = entry.path;
		if (!path.includes(templateRoot) || path.endsWith("deno.json")) {
			entry.readable?.cancel();
			continue;
		}
		path = path.split(templateRoot).at(-1) ?? "";
		if (entry.readable) processor.scan(path, entry.readable);
	}
	return processor.write(processor.resolve());
}
