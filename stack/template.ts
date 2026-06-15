import { UntarStream } from "@std/tar";

import { directoryOf, joinPath } from "@bearmetal/miscellanea";

import type { DenoConfig } from "./denoConfig.ts";
import type { flags } from "./flags.ts";

type MainTemplateOpts = flags;

interface MainTemplate {
	imports: [specifier: string, names: string[]][];
	middleware: string[];
}

const optional: Partial<
	{
		[key in keyof flags]: (
			i: MainTemplate["imports"],
			m: MainTemplate["middleware"],
			opts: MainTemplateOpts,
			files: FileBuilder[],
		) => void;
	}
> = {
	db(i, m, opts) {
		i.push(["@bearmetal/db", ["dbModule"]]);
		m.push(`.use(dbModule("${opts.db}"))`);
	},
	devProxy(i, m, opts) {
		i.push(["@bearmetal/devproxy", ["devProxyModule"]]);
		m.push(`.use(devProxyModule("${opts.devProxy}"))`);
	},
	auth(i, m) {
		i.push(["@bearmetal/auth", ["authModule"]]);
		i.push(["@bearmetal/forge", ["s"]]);
		m.push(`.use(authModule(s.object({ username: s.string() })))`);
	},
};

type FileBuilder = [string, () => string | Promise<string>];
export function buildMainTs(opts: MainTemplateOpts): FileBuilder[] {
	const t: MainTemplate = {
		imports: [],
		middleware: [],
	};

	const files: FileBuilder[] = [];

	for (const [key, fn] of Object.entries(optional)) {
		if (opts[key as keyof flags]) {
			fn(t.imports, t.middleware, opts, files);
		}
	}

	const importLines = t.imports
		.map(([spec, names]) => `import { ${names.join(", ")} } from "${spec}";`)
		.join("\n");

	const routerSetup = t.middleware.length > 0 ? `\n${t.middleware.join("\n\t")}` : "";

	return [
		["main.ts", () => {
			let t = maints.value;
			t = t.replace(/\n\/\/ @bearmetal imports/, importLines).replace(
				/\n\t\/\/ @bearmetal middleware/,
				routerSetup,
			);
			return t;
		}],
		...files,
	];
}

export function denoJson(_projectName: string, packages: Set<string>) {
	const imports: DenoConfig["imports"] = {
		"@app/": "./app/",
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
	templateRoot = "default",
): Promise<void> {
	console.log(`   loading template "${templateRoot}"...`);
	const tar = await fetch(templateBaseUrl);
	const tarStream = tar.body;
	if (!tarStream) throw new Error("No tar stream");
	for await (
		const entry of (await Deno.open("/home/emma/Downloads/BMStackTemplates-first.tar.gz")).readable
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
		if (path === "/main.ts") {
			const s = new TextDecoderStream();
			entry.readable?.pipeThrough(s as any).pipeTo(
				new WritableStream({
					write: (chunk) => {
						maints.value += chunk;
					},
				}),
			);
			continue;
		}
		path = joinPath(targetDir, path);

		console.log(`   writing ${path}...`);
		if (Deno.args.includes("--dry-run")) entry.readable?.cancel();
		else {
			await Deno.mkdir(directoryOf(path), { recursive: true });
			await entry.readable?.pipeTo((await Deno.open(path, { create: true, write: true })).writable);
		}
	}
}

const maints = { value: "" };
